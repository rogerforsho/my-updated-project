'use server';

import { getTrustedActor } from '@/src/lib/trusted-actor';

import { createClient } from '@/src/lib/supabase/server';
import { canManageDepartmentRecord, canManageDepartmentStudent } from '@/src/lib/department-scope';
import { getServiceClient } from '@/src/lib/supabase/service';
import { recordAuditEvent } from '@/src/lib/audit';
import { validateUploadedBytes } from '@/src/lib/uploadValidation';
import { authActionLimit } from '@/src/services/auth/internal';
import { GATEWAY_DOCUMENT_SPECS, isCoordinatorReviewType, STUDENT_REPORT_TYPES, SUPERVISOR_REVIEW_REPORT_TYPES, matchesDoc } from '@ojt/shared';
import type { AppResult, DbReport } from '@ojt/shared';



export interface ReportWithStudent extends DbReport {
  students: {
    student_number: string;
    course: string;
    users: { full_name: string };
  };
}

export interface ReportInput {
  report_type: string;
  file_path: string;
  remarks?: string;
}

export async function listStudentReports(page = 1, pageSize = 20): Promise<AppResult<{ reports: DbReport[]; total: number }>> {
  const { supabase, user, profile } = await getTrustedActor();
  if (!user || profile?.role !== 'Student' || profile?.account_status !== 'active')
    return { data: null, error: { code: 'FORBIDDEN', message: 'Access denied.' } };

  const { data: student } = await supabase.from('students').select('student_id').eq('user_id', user.id).single();
  if (!student) return { data: null, error: { code: 'NOT_FOUND', message: 'Student profile not found.' } };

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data, error, count } = await supabase
    .from('reports')
    .select('*', { count: 'exact' })
    .eq('student_id', student.student_id)
    .order('submission_date', { ascending: false })
    .range(from, to);

  if (error) return { data: null, error: { code: 'SERVER_FAILURE', message: 'Failed to load reports.' } };

  return { data: { reports: (data ?? []) as DbReport[], total: count ?? 0 }, error: null };
}

export async function submitReport(input: ReportInput): Promise<AppResult<null>> {
  if (!STUDENT_REPORT_TYPES.includes(input.report_type?.trim() || '')) return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'Choose a supported report type.' } };
  if (!input.file_path?.trim()) return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'File path is required.' } };

  const { supabase, user, profile } = await getTrustedActor();
  if (!user || profile?.role !== 'Student' || profile?.account_status !== 'active')
    return { data: null, error: { code: 'FORBIDDEN', message: 'Access denied.' } };

  const limitError = await authActionLimit('report_submit', user.id, 10, 3600, 'user');
  if (limitError) return { data: null, error: limitError };

  const filePath = input.file_path.trim();
  const ownedUploadPath = new RegExp(`^${user.id}/reports/[0-9a-f-]{36}\\.(pdf|docx|doc|jpg|jpeg|png)$`, 'i');
  if (!ownedUploadPath.test(filePath))
    return { data: null, error: { code: 'FORBIDDEN', message: 'Uploaded document path is invalid.' } };

  const storage = supabase.storage.from('private-documents');
  const removeUpload = () => getServiceClient().storage.from('private-documents').remove([filePath]);
  const { data: uploadedFile, error: downloadError } = await storage.download(filePath);
  if (downloadError || !uploadedFile)
    return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'Upload the document again before submitting it.' } };
  if (uploadedFile.size > 10 * 1024 * 1024) {
    await removeUpload();
    return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'Document exceeds the 10 MB limit.' } };
  }
  const checked = validateUploadedBytes(
    new Uint8Array(await uploadedFile.arrayBuffer()),
    filePath.split('/').at(-1) || '',
    uploadedFile.type,
    ['.pdf', '.docx', '.doc', '.jpg', '.jpeg', '.png'],
    10 * 1024 * 1024
  );
  if (checked.error || !checked.data) {
    await removeUpload();
    return { data: null, error: checked.error };
  }

  const { data: student } = await supabase.from('students').select('student_id').eq('user_id', user.id).single();
  if (!student) {
    await removeUpload();
    return { data: null, error: { code: 'NOT_FOUND', message: 'Student profile not found.' } };
  }

  const { data: report, error } = await getServiceClient().from('reports').insert({
    student_id: student.student_id,
    report_type: input.report_type.trim(),
    file_path: filePath,
    status: 'submitted',
    remarks: input.remarks?.trim() ?? null,
  }).select('report_id').single();

  if (error) {
    await removeUpload();
    return { data: null, error: { code: 'SERVER_FAILURE', message: 'Failed to submit report.' } };
  }

  await recordAuditEvent({
    actor_user_id: user.id,
    action: 'REPORT_SUBMITTED',
    entity_type: 'report',
    entity_id: report.report_id,
    details: { report_type: input.report_type, file_path: input.file_path },
  });

  return { data: null, error: null };
}

export async function listReportsForCoordinator(page = 1, pageSize = 20): Promise<AppResult<{ reports: ReportWithStudent[]; total: number }>> {
  const { supabase, profile } = await getTrustedActor();
  if (!profile || profile.role !== 'Coordinator' || profile.account_status !== 'active')
    return { data: null, error: { code: 'FORBIDDEN', message: 'Access denied.' } };

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data, error, count } = await supabase
    .from('reports')
    .select(`*, students ( student_number, course, users ( full_name ) )`, { count: 'exact' })
    .order('submission_date', { ascending: false })
    .range(from, to);

  if (error) return { data: null, error: { code: 'SERVER_FAILURE', message: 'Failed to load reports.' } };

  return { data: { reports: (data ?? []) as ReportWithStudent[], total: count ?? 0 }, error: null };
}

export async function reviewReport(
  report_id: string,
  status: 'reviewed' | 'approved' | 'rejected',
  remarks?: string
): Promise<AppResult<null>> {
  if (!report_id) return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'Report ID is required.' } };
  if (!['reviewed', 'approved', 'rejected'].includes(status))
    return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'Invalid review status.' } };

  const { supabase, user, profile } = await getTrustedActor();
  if (!user || !profile || profile.role !== 'Coordinator' || profile.account_status !== 'active')
    return { data: null, error: { code: 'FORBIDDEN', message: 'Access denied.' } };
  const { data: target, error: targetError } = await supabase.from('reports')
    .select('student_id, report_type').eq('report_id', report_id).maybeSingle();
  if (targetError) return { data: null, error: { code: 'SERVER_FAILURE', message: 'Failed to load report.' } };
  if (!target) return { data: null, error: { code: 'NOT_FOUND', message: 'Report not found or access denied.' } };
  if (!isCoordinatorReviewType(target.report_type))
    return { data: null, error: { code: 'FORBIDDEN', message: 'Routine accomplishment reports are reviewed by the assigned Supervisor.' } };
  if (!await canManageDepartmentRecord(supabase, user.id, profile.role, 'reports', 'report_id', report_id))
    return { data: null, error: { code: 'FORBIDDEN', message: 'Report is outside your department.' } };

  const { data: updated, error } = await supabase.from('reports').update({
    status,
    remarks: remarks?.trim() ?? null,
    updated_at: new Date().toISOString(),
  }).eq('report_id', report_id).in('status', ['submitted', 'rejected']).select('report_id').maybeSingle();

  if (error) return { data: null, error: { code: 'SERVER_FAILURE', message: 'Failed to review report.' } };
  if (!updated) return { data: null, error: { code: 'NOT_FOUND', message: 'Report not found or access denied.' } };

  await recordAuditEvent({
    actor_user_id: user.id,
    action: `REPORT_${status.toUpperCase()}`,
    entity_type: 'report',
    entity_id: report_id,
    details: { status, remarks },
  });

  return { data: null, error: null };
}

export async function listReportsForSupervisor(
  page = 1,
  pageSize = 20
): Promise<AppResult<{ reports: ReportWithStudent[]; total: number }>> {
  const { supabase, user, profile } = await getTrustedActor();
  if (!user || profile?.role !== 'Supervisor' || profile?.account_status !== 'active')
    return { data: null, error: { code: 'FORBIDDEN', message: 'Access denied.' } };

  const { data: supervisor } = await supabase
    .from('supervisors')
    .select('supervisor_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!supervisor) return { data: null, error: { code: 'NOT_FOUND', message: 'Supervisor profile not found.' } };

  // Get assigned student IDs
  const { data: assignments } = await supabase
    .from('student_assignments')
    .select('student_id')
    .eq('supervisor_id', supervisor.supervisor_id);

  const studentIds = (assignments ?? []).map((a) => a.student_id);
  if (studentIds.length === 0) {
    return { data: { reports: [], total: 0 }, error: null };
  }

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data, error, count } = await supabase
    .from('reports')
    .select(`*, students ( student_number, course, users ( full_name ) )`, { count: 'exact' })
    .in('student_id', studentIds)
    .in('report_type', SUPERVISOR_REVIEW_REPORT_TYPES)
    .order('submission_date', { ascending: false })
    .range(from, to);

  if (error) return { data: null, error: { code: 'SERVER_FAILURE', message: 'Failed to load trainee reports.' } };

  return { data: { reports: (data ?? []) as ReportWithStudent[], total: count ?? 0 }, error: null };
}

export async function endorseReportBySupervisor(
  report_id: string,
  decision: 'approved' | 'returned',
  supervisor_feedback: string
): Promise<AppResult<null>> {
  if (!report_id) return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'Report ID is required.' } };
  if (!['approved', 'returned'].includes(decision)) return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'Choose approve or return.' } };
  if (!supervisor_feedback?.trim()) return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'Feedback remarks are required.' } };

  const { supabase, user, profile } = await getTrustedActor();
  if (!user || profile?.role !== 'Supervisor' || profile?.account_status !== 'active')
    return { data: null, error: { code: 'FORBIDDEN', message: 'Access denied.' } };

  const { data: report, error: lookupError } = await supabase.from('reports')
    .select('student_id, report_type').eq('report_id', report_id).maybeSingle();
  if (lookupError) return { data: null, error: { code: 'SERVER_FAILURE', message: 'Failed to load report.' } };
  if (!report) return { data: null, error: { code: 'NOT_FOUND', message: 'Report not found or access denied.' } };
  if (!['daily journal', 'accomplishment report'].includes(report.report_type.trim().toLowerCase()))
    return { data: null, error: { code: 'FORBIDDEN', message: 'Supervisors can decide daily accomplishment reports only.' } };

  const decidedAt = new Date().toISOString();
  const { data: updated, error } = await supabase.from('reports').update({
      supervisor_feedback: supervisor_feedback.trim(),
      supervisor_endorsed_at: decidedAt,
      supervisor_decision: decision,
      supervisor_decided_by: user.id,
      supervisor_decided_at: decidedAt,
      updated_at: decidedAt,
    })
    .eq('report_id', report_id).is('supervisor_decision', null).select('report_id').maybeSingle();

  if (error) return { data: null, error: { code: 'SERVER_FAILURE', message: 'Failed to record supervisor feedback.' } };
  if (!updated) return { data: null, error: { code: 'NOT_FOUND', message: 'Report not found or access denied.' } };

  await recordAuditEvent({
    actor_user_id: user.id,
    action: `REPORT_SUPERVISOR_${decision.toUpperCase()}`,
    entity_type: 'report',
    entity_id: report_id,
    details: { decision, supervisor_feedback },
  });

  return { data: null, error: null };
}

// ─── Pre-Deployment Gateway Compliance Tracker ────────────────────────────────

export interface StudentGatewayStatus {
  student_id: string;
  user_id: string;
  student_number: string;
  full_name: string;
  email: string;
  course: string;
  year_level: number;
  submitted_count: number;
  approved_count: number;
  total_required: number;
  missing_documents: string[];
  pending_documents: string[];
  approved_documents: string[];
  compliance_state: 'not_started' | 'in_progress' | 'ready_for_review' | 'ready_for_placement' | 'deployed';
  assigned_company: string | null;
  documents: {
    spec_id: string;
    spec_name: string;
    status: 'missing' | 'submitted' | 'approved' | 'rejected';
    report_id?: string;
    file_path?: string;
    submission_date?: string;
    remarks?: string | null;
  }[];
}

export interface GatewayComplianceSummary {
  students: StudentGatewayStatus[];
  total_students: number;
  needs_requirements: number;
  ready_for_review: number;
  ready_for_placement: number;
  deployed: number;
}


export async function checkStudentGatewayStatus(student_id: string): Promise<{ isCleared: boolean; approvedCount: number; missing: string[] }> {
  const supabase = await createClient();
  const { data: reports } = await supabase
    .from('reports')
    .select('report_type, status')
    .eq('student_id', student_id)
    .eq('status', 'approved');

  const approvedReports = reports || [];
  const approvedSpecs = new Set<string>();

  for (const r of approvedReports) {
    for (const spec of GATEWAY_DOCUMENT_SPECS) {
      if (matchesDoc(r.report_type, spec.name)) {
        approvedSpecs.add(spec.id);
      }
    }
  }

  const missing = GATEWAY_DOCUMENT_SPECS.filter(s => !approvedSpecs.has(s.id)).map(s => s.name);
  return {
    isCleared: approvedSpecs.size === GATEWAY_DOCUMENT_SPECS.length,
    approvedCount: approvedSpecs.size,
    missing,
  };
}

export async function getGatewayComplianceSummary(): Promise<AppResult<GatewayComplianceSummary>> {
  const { supabase, profile } = await getTrustedActor();
  if (!profile || profile.role !== 'Coordinator' || profile.account_status !== 'active')
    return { data: null, error: { code: 'FORBIDDEN', message: 'Access denied.' } };

  // 1. Fetch active students
  const { data: studentsData, error: stuErr } = await supabase
    .from('students')
    .select(`
      student_id,
      student_number,
      course,
      year_level,
      status,
      users!inner (
        user_id,
        full_name,
        email,
        account_status
      )
    `)
    .eq('users.account_status', 'active');

  if (stuErr) return { data: null, error: { code: 'SERVER_FAILURE', message: 'Failed to load students.' } };

  // 2. Fetch active assignments
  const { data: assignmentsData } = await supabase
    .from('student_assignments')
    .select('student_id, assignment_status, companies ( company_name )')
    .eq('assignment_status', 'active');

  const assignmentMap = new Map<string, string>();
  (assignmentsData ?? []).forEach((a: any) => {
    const comp = Array.isArray(a.companies) ? a.companies[0] : a.companies;
    assignmentMap.set(a.student_id, comp?.company_name || 'Assigned Workplace');
  });

  // 3. Fetch all reports
  const { data: reportsData } = await supabase
    .from('reports')
    .select('report_id, student_id, report_type, status, file_path, submission_date, remarks')
    .order('submission_date', { ascending: false });

  const studentReportsMap = new Map<string, any[]>();
  (reportsData ?? []).forEach((r) => {
    const arr = studentReportsMap.get(r.student_id) || [];
    arr.push(r);
    studentReportsMap.set(r.student_id, arr);
  });

  // 4. Build gateway compliance array
  const students: StudentGatewayStatus[] = (studentsData ?? []).map((s: any) => {
    const user = Array.isArray(s.users) ? s.users[0] : s.users;
    const userReports = studentReportsMap.get(s.student_id) || [];
    const assignedCompany = assignmentMap.get(s.student_id) || null;

    let submittedCount = 0;
    let approvedCount = 0;
    const missingDocs: string[] = [];
    const pendingDocs: string[] = [];
    const approvedDocs: string[] = [];

    const documents = GATEWAY_DOCUMENT_SPECS.map(spec => {
      const match = userReports.find(r => matchesDoc(r.report_type, spec.name));
      if (!match) {
        missingDocs.push(spec.name);
        return {
          spec_id: spec.id,
          spec_name: spec.name,
          status: 'missing' as const,
        };
      }

      submittedCount++;
      if (match.status === 'approved') {
        approvedCount++;
        approvedDocs.push(spec.name);
      } else if (match.status === 'rejected') {
        missingDocs.push(spec.name);
      } else {
        pendingDocs.push(spec.name);
      }

      return {
        spec_id: spec.id,
        spec_name: spec.name,
        status: (match.status as 'submitted' | 'approved' | 'rejected') || 'submitted',
        report_id: match.report_id,
        file_path: match.file_path,
        submission_date: match.submission_date,
        remarks: match.remarks,
      };
    });

    let complianceState: StudentGatewayStatus['compliance_state'] = 'not_started';
    if (assignedCompany) {
      complianceState = 'deployed';
    } else if (approvedCount === GATEWAY_DOCUMENT_SPECS.length) {
      complianceState = 'ready_for_placement';
    } else if (submittedCount === GATEWAY_DOCUMENT_SPECS.length) {
      complianceState = 'ready_for_review';
    } else if (submittedCount > 0) {
      complianceState = 'in_progress';
    }

    return {
      student_id: s.student_id,
      user_id: user?.user_id || '',
      student_number: s.student_number,
      full_name: user?.full_name || 'Unnamed Trainee',
      email: user?.email || '',
      course: s.course,
      year_level: s.year_level,
      submitted_count: submittedCount,
      approved_count: approvedCount,
      total_required: GATEWAY_DOCUMENT_SPECS.length,
      missing_documents: missingDocs,
      pending_documents: pendingDocs,
      approved_documents: approvedDocs,
      compliance_state: complianceState,
      assigned_company: assignedCompany,
      documents,
    };
  });

  return {
    data: {
      students,
      total_students: students.length,
      needs_requirements: students.filter(s => s.compliance_state === 'not_started' || s.compliance_state === 'in_progress').length,
      ready_for_review: students.filter(s => s.compliance_state === 'ready_for_review').length,
      ready_for_placement: students.filter(s => s.compliance_state === 'ready_for_placement').length,
      deployed: students.filter(s => s.compliance_state === 'deployed').length,
    },
    error: null,
  };
}

export async function sendRequirementReminder(studentUserId: string, missingDocs: string[]): Promise<AppResult<null>> {
  const { supabase, user, profile } = await getTrustedActor();
  if (!user || !profile || profile.role !== 'Coordinator' || profile.account_status !== 'active') {
    return { data: null, error: { code: 'FORBIDDEN', message: 'Access denied.' } };
  }
  if (!await canManageDepartmentStudent(supabase, user.id, profile.role, studentUserId, 'user_id'))
    return { data: null, error: { code: 'FORBIDDEN', message: 'Student is outside your department.' } };

  const service = getServiceClient();
  const docsText = missingDocs.join(', ');
  const message = `Coordinator Notice: You have pending pre-deployment requirements (${docsText}). Please upload these via your mobile app to unlock company assignment and daily attendance.`;

  const { error } = await service.from('notifications').insert({
    receiver_user_id: studentUserId,
    message,
    status: 'unread',
    notification_date: new Date().toISOString(),
  });

  if (error) {
    return { data: null, error: { code: 'SERVER_FAILURE', message: 'Failed to dispatch in-app reminder.' } };
  }

  return { data: null, error: null };
}
