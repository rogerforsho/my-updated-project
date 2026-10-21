'use server';

import crypto from 'node:crypto';
import { getTrustedActor } from '@/src/lib/trusted-actor';

import { getServiceClient } from '@/src/lib/supabase/service';
import { recordAuditEvent } from '@/src/lib/audit';
import { departmentScope, restrictDepartment } from '@/src/lib/department-scope';
import type { AppResult } from '@ojt/shared';

const serviceClient = getServiceClient;



export interface ClearanceCheckResult {
  student_id: string;
  student_name: string;
  student_number: string;
  course: string;
  completed_hours: number;
  required_hours: number;
  hours_met: boolean;
  final_report_approved: boolean;
  evaluation_passed: boolean;
  evaluation_appeal_pending: boolean;
  evaluation_score: number | null;
  midterm_score: number | null;
  final_score: number | null;
  final_grade: number | null;
  grade_recorded_at: string | null;
  can_issue: boolean;
  certificate?: {
    certificate_id: string;
    verification_code: string;
    status: string;
    issued_at: string;
  } | null;
}

export async function checkClearanceStatus(student_id: string): Promise<AppResult<ClearanceCheckResult>> {
  if (!student_id) return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'Student ID is required.' } };

  const { supabase, user, profile } = await getTrustedActor();
  if (!user || profile?.account_status !== 'active' || !['Student', 'Coordinator'].includes(profile.role))
    return { data: null, error: { code: 'FORBIDDEN', message: 'Access denied.' } };
  const scope = await departmentScope(supabase, user.id, profile.role);
  if (scope.error) return { data: null, error: { code: 'FORBIDDEN', message: scope.error } };
  let visibleStudent = supabase.from('students').select('student_id').eq('student_id', student_id);
  visibleStudent = restrictDepartment(visibleStudent, scope.department);
  if (profile.role === 'Student') visibleStudent = visibleStudent.eq('user_id', user.id);
  const { data: accessible, error: accessError } = await visibleStudent.maybeSingle();
  if (accessError) return { data: null, error: { code: 'SERVER_FAILURE', message: 'Unable to check student access.' } };
  if (!accessible) return { data: null, error: { code: 'FORBIDDEN', message: 'Student record is not accessible.' } };

  // 1. Fetch student info
  const { data: student, error: studentErr } = await supabase
    .from('students')
    .select('student_id, student_number, course, required_hours, users ( full_name )')
    .eq('student_id', student_id)
    .single();

  if (studentErr || !student) {
    return { data: null, error: { code: 'NOT_FOUND', message: 'Student profile not found.' } };
  }

  // 2. Fetch progress hours
  const { data: progress } = await supabase
    .from('internship_progress')
    .select('completed_hours')
    .eq('student_id', student_id)
    .maybeSingle();

  const completedHours = Number(progress?.completed_hours || 0);
  const requiredHours = Number(student.required_hours || 486);
  const hoursMet = completedHours >= requiredHours;

  // 3. Fetch final report status
  const { data: finalReport } = await supabase
    .from('reports')
    .select('status')
    .eq('student_id', student_id)
    .eq('report_type', 'final_report')
    .eq('status', 'approved')
    .maybeSingle();

  const finalReportApproved = !!finalReport;

  // 4. Fetch supervisor evaluations (both midterm and final)
  const { data: evaluations } = await supabase
    .from('evaluations')
    .select('evaluation_id, performance_score, evaluation_type')
    .eq('student_id', student_id)
    .order('evaluation_date', { ascending: false });

  const evals = (evaluations ?? []) as { evaluation_id: string; performance_score: number | null; evaluation_type?: string }[];
  const { data: appeals, error: appealError } = await supabase.from('evaluation_appeals')
    .select('evaluation_id, status, resolved_score').eq('student_id', student_id).order('created_at', { ascending: false });
  if (appealError) return { data: null, error: { code: 'SERVER_FAILURE', message: 'Could not verify evaluation appeal decisions.' } };
  const evaluationAppealPending = (appeals ?? []).some(appeal => appeal.status === 'pending');
  const resolvedScoreByEvaluation = new Map<string, number>();
  for (const appeal of appeals ?? []) {
    if (appeal.status === 'adjusted' && appeal.resolved_score != null && !resolvedScoreByEvaluation.has(appeal.evaluation_id))
      resolvedScoreByEvaluation.set(appeal.evaluation_id, Number(appeal.resolved_score));
  }
  const effectiveScore = (evaluation: typeof evals[number] | null | undefined) =>
    evaluation ? resolvedScoreByEvaluation.get(evaluation.evaluation_id) ?? evaluation.performance_score : null;
  const midtermEval = evals.find(e => e.evaluation_type === 'midterm');
  const finalEval = evals.find(e => e.evaluation_type === 'final');

  const midtermScore = effectiveScore(midtermEval) !== null && effectiveScore(midtermEval) !== undefined
    ? Number(effectiveScore(midtermEval))
    : null;
  const finalScore = effectiveScore(finalEval) !== null && effectiveScore(finalEval) !== undefined
    ? Number(effectiveScore(finalEval))
    : null;

  const evalScore = finalScore !== null ? finalScore : midtermScore;
  const evaluationPassed = !evaluationAppealPending
    && midtermScore !== null && midtermScore >= 75
    && finalScore !== null && finalScore >= 75;

  // 5. Read the Coordinator-entered grade and any finalized certificate.
  const { data: grade, error: gradeError } = await supabase.from('ojt_final_grades')
    .select('final_grade, recorded_at').eq('student_id', student_id).maybeSingle();
  if (gradeError) return { data: null, error: { code: 'SERVER_FAILURE', message: 'Could not load the final OJT grade.' } };

  const { data: cert } = await supabase
    .from('certificates')
    .select('certificate_id, verification_code, status, issued_at')
    .eq('student_id', student_id)
    .maybeSingle();

  const userObj = Array.isArray(student.users) ? student.users[0] : student.users;

  return {
    data: {
      student_id,
      student_name: userObj?.full_name || '',
      student_number: student.student_number,
      course: student.course,
      completed_hours: completedHours,
      required_hours: requiredHours,
      hours_met: hoursMet,
      final_report_approved: finalReportApproved,
      evaluation_passed: evaluationPassed,
      evaluation_appeal_pending: evaluationAppealPending,
      evaluation_score: evalScore,
      midterm_score: midtermScore,
      final_score: finalScore,
      final_grade: grade ? Number(grade.final_grade) : null,
      grade_recorded_at: grade?.recorded_at ?? null,
      can_issue: hoursMet && finalReportApproved && evaluationPassed && !cert,
      certificate: cert || null,
    },
    error: null,
  };
}

export async function recordFinalOjtGrade(student_id: string, final_grade: number, academic_year?: string): Promise<AppResult<{ final_grade: number; verification_code: string | null }>> {
  if (!student_id) return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'Student ID is required.' } };

  const { supabase, user, profile } = await getTrustedActor();
  if (!user || !profile || profile.role !== 'Coordinator' || profile.account_status !== 'active') {
    return { data: null, error: { code: 'FORBIDDEN', message: 'OJT Coordinator access required.' } };
  }
  if (typeof final_grade !== 'number' || !Number.isFinite(final_grade) || final_grade < 1 || final_grade > 5 || Math.round(final_grade * 100) / 100 !== final_grade)
    return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'Final OJT grade must be between 1.00 and 5.00 with up to two decimal places.' } };

  const normalizedAcademicYear = academic_year?.trim().replace(/[–—]/g, '-');
  const academicYearMatch = normalizedAcademicYear?.match(/^(\d{4})-(\d{4})$/);
  if (final_grade <= 3 && (!academicYearMatch || Number(academicYearMatch[2]) !== Number(academicYearMatch[1]) + 1))
    return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'Enter the certificate academic year as consecutive years, for example 2026-2027.' } };

  const clearance = await checkClearanceStatus(student_id);
  if (clearance.error || !clearance.data) {
    return { data: null, error: { code: 'SERVER_FAILURE', message: clearance.error?.message || 'Failed to check clearance.' } };
  }

  if (clearance.data.certificate) {
    return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'This OJT record is already finalized.' } };
  }
  if (!clearance.data.hours_met || !clearance.data.final_report_approved || !clearance.data.evaluation_passed) {
    return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'The student has not met all academic clearance requirements.' } };
  }

  const { error: gradeError } = await supabase.from('ojt_final_grades').upsert({
    student_id, final_grade, recorded_by_user_id: user.id,
  }, { onConflict: 'student_id' });
  if (gradeError) return { data: null, error: { code: 'SERVER_FAILURE', message: 'Failed to save the final OJT grade.' } };

  if (final_grade > 3) {
    return { data: { final_grade, verification_code: null }, error: null };
  }

  // Fetch student active/last company
  const { data: assignment } = await supabase
    .from('student_assignments')
    .select('companies ( company_name )')
    .eq('student_id', student_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const compObj = Array.isArray(assignment?.companies) ? assignment?.companies[0] : assignment?.companies;
  const companyName = compObj?.company_name || 'Partner Host Training Establishment';

  // Generate a cryptographically random public verification code.
  const randomSuffix = crypto.randomBytes(4).toString('hex').toUpperCase();
  const verificationCode = `CDM-OJT-${new Date().getFullYear()}-${randomSuffix}`;

  const { data: cert, error: insertErr } = await supabase
    .from('certificates')
    .insert({
      student_id,
      verification_code: verificationCode,
      hours_rendered: clearance.data.completed_hours,
      host_company_name: companyName,
      academic_year: normalizedAcademicYear!,
      status: 'active',
      issued_by_user_id: user.id,
    })
    .select('certificate_id, verification_code')
    .single();

  if (insertErr || !cert) {
    return { data: null, error: { code: 'SERVER_FAILURE', message: 'Grade saved, but certificate finalization failed. Retry finalization or review the database error.' } };
  }

  await recordAuditEvent({
    actor_user_id: user.id,
    action: 'CERTIFICATE_ISSUED',
    entity_type: 'certificate',
    entity_id: cert.certificate_id,
    details: { student_id, verification_code: cert.verification_code },
  });

  return { data: { final_grade, verification_code: cert.verification_code }, error: null };
}

export async function revokeCertificate(certificate_id: string, reason: string): Promise<AppResult<null>> {
  if (!certificate_id) return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'Certificate ID is required.' } };
  if (!reason?.trim()) return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'Revocation reason is required.' } };

  const { supabase, user, profile } = await getTrustedActor();
  if (!user || !profile || profile.role !== 'Coordinator' || profile.account_status !== 'active') {
    return { data: null, error: { code: 'FORBIDDEN', message: 'OJT Coordinator access required.' } };
  }

  const { error } = await supabase
    .from('certificates')
    .update({
      status: 'revoked',
      revocation_reason: reason.trim(),
    })
    .eq('certificate_id', certificate_id);

  if (error) return { data: null, error: { code: 'SERVER_FAILURE', message: 'Failed to revoke certificate.' } };

  await recordAuditEvent({
    actor_user_id: user.id,
    action: 'CERTIFICATE_REVOKED',
    entity_type: 'certificate',
    entity_id: certificate_id,
    details: { reason },
  });

  return { data: null, error: null };
}

export async function verifyCertificatePublic(code: string): Promise<AppResult<{
  valid: boolean;
  status: 'active' | 'revoked' | 'not_found';
  verification_code: string;
  student_name?: string;
  student_number?: string;
  course?: string;
  hours_rendered?: number;
  host_company_name?: string;
  academic_year?: string;
  issued_at?: string;
  revocation_reason?: string;
}>> {
  if (!code?.trim()) {
    return { data: { valid: false, status: 'not_found', verification_code: code }, error: null };
  }

  const service = serviceClient();
  const { data, error } = await service
    .from('certificates')
    .select(`
      verification_code, hours_rendered, host_company_name, academic_year, status, revocation_reason, issued_at,
      students (
        student_number, course,
        users ( full_name )
      )
    `)
    .eq('verification_code', code.trim().toUpperCase())
    .maybeSingle();

  if (error || !data) {
    return { data: { valid: false, status: 'not_found', verification_code: code }, error: null };
  }

  const studentObj = Array.isArray(data.students) ? data.students[0] : data.students;
  const userObj = Array.isArray(studentObj?.users) ? studentObj?.users[0] : studentObj?.users;

  return {
    data: {
      valid: data.status === 'active',
      status: data.status as 'active' | 'revoked',
      verification_code: data.verification_code,
      student_name: userObj?.full_name || 'Trainee',
      student_number: studentObj?.student_number || '',
      course: studentObj?.course || '',
      hours_rendered: Number(data.hours_rendered),
      host_company_name: data.host_company_name,
      academic_year: data.academic_year,
      issued_at: data.issued_at,
      revocation_reason: data.revocation_reason || undefined,
    },
    error: null,
  };
}
