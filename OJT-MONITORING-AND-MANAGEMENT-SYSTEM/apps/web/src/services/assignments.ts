'use server';

import { getCoordinator } from '@/src/lib/actor';
import { canManageDepartmentStudent, canManageDepartmentRecord } from '@/src/lib/department-scope';
import { recordAuditEvent } from '@/src/lib/audit';
import { checkStudentGatewayStatus } from './reports';
import { GATEWAY_DOCUMENT_SPECS, matchesDoc, practicumWindowError } from '@ojt/shared';
import type { AppResult, DbStudentAssignment, AssignmentStatus, StudentStatus } from '@ojt/shared';

export interface AssignmentInput {
  student_id: string;
  company_id: string;
  branch_id: string;
  supervisor_id: string;
  start_date: string;
  end_date?: string;
}

export interface AssignmentDetail extends DbStudentAssignment {
  students: { student_number: string; course: string; year_level: number; status: StudentStatus; users: { full_name: string; email: string } };
  companies: { company_name: string };
  company_branches?: { branch_name: string; address: string };
  supervisors: { position: string; users: { full_name: string; email: string } };
}

function applyAssignmentSearch(query: any, q?: string) {
  // one table per query: a student number has digits, otherwise match the name
  if (!q) return query;
  return /\d/.test(q)
    ? query.ilike('students.student_number', `%${q}%`)
    : query.ilike('students.users.full_name', `%${q}%`);
}

// One row per company with its true assignment count and how many are still active, so folded groups need no row load.
// shortcut: counts in JS from a narrow select, fine for a department-sized list; move to a SQL group-by past ~1000 assignments.
export async function listAssignmentGroups(
  search?: string
): Promise<AppResult<{ groups: Array<{ company_id: string; company_name: string; count: number; active: number }> }>> {
  const { supabase, authorized } = await getCoordinator();
  if (!authorized) return { data: null, error: { code: 'FORBIDDEN', message: 'Access denied.' } };

  const q = search?.trim().replace(/[%_,()]/g, '');
  const { data, error } = await applyAssignmentSearch(
    supabase
      .from('student_assignments')
      .select(`company_id, assignment_status, companies ( company_name ), students${q ? '!inner' : ''} ( student_number, users${q ? '!inner' : ''} ( full_name ) )`),
    q
  ).limit(5000);
  if (error) return { data: null, error: { code: 'SERVER_FAILURE', message: 'Failed to load assignment groups.' } };

  const byCompany = new Map<string, { company_id: string; company_name: string; count: number; active: number }>();
  for (const row of (data ?? []) as any[]) {
    const g = byCompany.get(row.company_id) ?? { company_id: row.company_id, company_name: row.companies?.company_name ?? 'Unknown company', count: 0, active: 0 };
    g.count += 1;
    if (row.assignment_status === 'active') g.active += 1;
    byCompany.set(row.company_id, g);
  }
  return { data: { groups: [...byCompany.values()].sort((a, b) => a.company_name.localeCompare(b.company_name)) }, error: null };
}

export async function listAssignments(
  page = 1,
  pageSize = 20,
  search?: string,
  companyId?: string
): Promise<AppResult<{ assignments: AssignmentDetail[]; total: number }>> {
  const { supabase, authorized } = await getCoordinator();
  if (!authorized) return { data: null, error: { code: 'FORBIDDEN', message: 'Access denied.' } };

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const q = search?.trim().replace(/[%_,()]/g, '');
  let query = supabase
    .from('student_assignments')
    .select(`
      *,
      students${q ? '!inner' : ''} (
        student_number, course, year_level, status,
        users${q ? '!inner' : ''} ( full_name, email )
      ),
      companies ( company_name ),
      company_branches ( branch_name, address ),
      supervisors (
        position,
        users ( full_name, email )
      )
    `, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to);
  query = applyAssignmentSearch(query, q);
  if (companyId) query = query.eq('company_id', companyId);

  const { data, error, count } = await query;
  if (error) return { data: null, error: { code: 'SERVER_FAILURE', message: 'Failed to load assignments.' } };
  return { data: { assignments: data as AssignmentDetail[], total: count ?? 0 }, error: null };
}

export async function createAssignment(input: AssignmentInput): Promise<AppResult<DbStudentAssignment>> {
  if (!input.student_id) return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'Student is required.' } };
  if (!input.company_id) return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'Company is required.' } };
  if (!input.supervisor_id) return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'Supervisor is required.' } };
  if (!input.start_date) return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'Start date is required.' } };
  const windowError = practicumWindowError(input.start_date, input.end_date);
  if (windowError) return { data: null, error: { code: 'VALIDATION_FAILURE', message: windowError } };

  const { supabase, user, role, authorized, scope } = await getCoordinator();
  if (!authorized || !user) return { data: null, error: { code: 'FORBIDDEN', message: 'Access denied.' } };
  if (!await canManageDepartmentStudent(supabase, user.id, role, input.student_id, 'student_id', scope))
    return { data: null, error: { code: 'FORBIDDEN', message: 'Student is outside your department.' } };
  if (!input.branch_id) return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'HTE branch is required.' } };

  // Check for existing active assignment for this student
  const { data: existing } = await supabase
    .from('student_assignments')
    .select('assignment_id')
    .eq('student_id', input.student_id)
    .eq('assignment_status', 'active')
    .maybeSingle();

  if (existing) return { data: null, error: { code: 'DUPLICATE_REQUEST', message: 'Student already has an active assignment.' } };

  // Enforce Pre-Deployment Gateway Requirement: Student must have mandatory gateway documents approved
  const gateway = await checkStudentGatewayStatus(input.student_id);
  if (!gateway.isCleared) {
    return {
      data: null,
      error: {
        code: 'VALIDATION_FAILURE',
        message: `Cannot assign trainee: Student has only ${gateway.approvedCount}/${GATEWAY_DOCUMENT_SPECS.length} approved pre-deployment gateway credentials. Missing or unapproved: ${gateway.missing.join(', ')}.`,
      },
    };
  }

  // Verify supervisor belongs to the selected company
  const { data: supervisor } = await supabase
    .from('supervisors')
    .select('company_id')
    .eq('supervisor_id', input.supervisor_id)
    .single();

  if (!supervisor) return { data: null, error: { code: 'NOT_FOUND', message: 'Supervisor not found.' } };
  if (supervisor.company_id !== input.company_id)
    return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'Supervisor does not belong to the selected company.' } };

  const { data: branch } = await supabase.from('company_branches').select('branch_id')
    .eq('branch_id', input.branch_id).eq('company_id', input.company_id).eq('status', 'active').maybeSingle();
  if (!branch) return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'Select an active branch of the selected HTE.' } };

  const { data, error } = await supabase
    .from('student_assignments')
    .insert({
      student_id: input.student_id,
      company_id: input.company_id,
      branch_id: input.branch_id,
      supervisor_id: input.supervisor_id,
      start_date: input.start_date,
      end_date: input.end_date ?? null,
      assignment_status: 'active',
    })
    .select()
    .single();

  if (error?.message.includes('not accepting new students'))
    return { data: null, error: { code: 'FORBIDDEN', message: 'This company is not accepting new students.' } };
  if (error?.code === '22023') return { data: null, error: { code: 'VALIDATION_FAILURE', message: error.message } };
  if (error) return { data: null, error: { code: 'SERVER_FAILURE', message: 'Failed to create assignment.' } };

  // Log Audit Trail
  await recordAuditEvent({
    actor_user_id: user.id,
    action: 'STUDENT_ASSIGNED',
    entity_type: 'student_assignment',
    entity_id: data.assignment_id,
    details: { student_id: input.student_id, company_id: input.company_id, supervisor_id: input.supervisor_id },
  });

  return { data: data as DbStudentAssignment, error: null };
}

export async function updateAssignmentStatus(
  assignment_id: string,
  assignment_status: AssignmentStatus
): Promise<AppResult<null>> {
  if (!assignment_id) return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'Assignment ID is required.' } };

  const { supabase, user, role, authorized, scope } = await getCoordinator();
  if (!authorized || !user) return { data: null, error: { code: 'FORBIDDEN', message: 'Access denied.' } };
  if (!await canManageDepartmentRecord(supabase, user.id, role, 'student_assignments', 'assignment_id', assignment_id))
    return { data: null, error: { code: 'FORBIDDEN', message: 'Assignment is outside your department.' } };

  const { error } = await supabase
    .from('student_assignments')
    .update({ assignment_status })
    .eq('assignment_id', assignment_id);

  if (error) return { data: null, error: { code: 'SERVER_FAILURE', message: 'Failed to update assignment.' } };

  await recordAuditEvent({
    actor_user_id: user.id,
    action: `ASSIGNMENT_${assignment_status.toUpperCase()}`,
    entity_type: 'student_assignment',
    entity_id: assignment_id,
    details: { status: assignment_status },
  });

  return { data: null, error: null };
}

export async function updateStudentStatus(
  student_id: string,
  status: StudentStatus
): Promise<AppResult<null>> {
  if (!student_id) return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'Student ID is required.' } };
  // Completion goes through the final-grade workflow, not this control.
  if (!(['dropped', 'inc', 'terminated'] as StudentStatus[]).includes(status))
    return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'Status must be DROPPED, INC, or TERMINATED.' } };

  const { supabase, user, role, authorized, scope } = await getCoordinator();
  if (!authorized || !user) return { data: null, error: { code: 'FORBIDDEN', message: 'Access denied.' } };
  if (!await canManageDepartmentStudent(supabase, user.id, role, student_id, 'student_id', scope))
    return { data: null, error: { code: 'FORBIDDEN', message: 'Student is outside your department.' } };

  const { data: certificate } = await supabase
    .from('certificates').select('student_id').eq('student_id', student_id).maybeSingle();
  if (certificate)
    return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'Completed OJT records are read-only.' } };

  const { error } = await supabase
    .from('students')
    .update({ status })
    .eq('student_id', student_id);

  if (error) return { data: null, error: { code: 'SERVER_FAILURE', message: 'Failed to update student status.' } };

  await recordAuditEvent({
    actor_user_id: user.id,
    action: `STUDENT_STATUS_${status.toUpperCase()}`,
    entity_type: 'student',
    entity_id: student_id,
    details: { status },
  });

  return { data: null, error: null };
}

export async function reassignStudent(
  student_id: string,
  new_company_id: string,
  new_branch_id: string,
  new_supervisor_id: string,
  start_date: string
): Promise<AppResult<DbStudentAssignment>> {
  const { supabase, user, role, authorized, scope } = await getCoordinator();
  if (!authorized || !user) return { data: null, error: { code: 'FORBIDDEN', message: 'Access denied.' } };
  if (!await canManageDepartmentStudent(supabase, user.id, role, student_id, 'student_id', scope))
    return { data: null, error: { code: 'FORBIDDEN', message: 'Student is outside your department.' } };

  // 1. Mark current active assignment as 'reassigned'
  await supabase
    .from('student_assignments')
    .update({
      assignment_status: 'reassigned',
      end_date: new Date().toISOString().split('T')[0],
    })
    .eq('student_id', student_id)
    .eq('assignment_status', 'active');

  // 2. Create new active assignment
  const { data: newAssignment, error } = await supabase
    .from('student_assignments')
    .insert({
      student_id,
      company_id: new_company_id,
      branch_id: new_branch_id,
      supervisor_id: new_supervisor_id,
      start_date,
      assignment_status: 'active',
    })
    .select()
    .single();

  if (error || !newAssignment) {
    return { data: null, error: { code: 'SERVER_FAILURE', message: 'Failed to reassign student.' } };
  }

  await recordAuditEvent({
    actor_user_id: user.id,
    action: 'STUDENT_REASSIGNED',
    entity_type: 'student_assignment',
    entity_id: newAssignment.assignment_id,
    details: { student_id, new_company_id, new_supervisor_id },
  });

  return { data: newAssignment as DbStudentAssignment, error: null };
}

export interface StudentAssignmentOption {
  student_id: string;
  student_number: string;
  full_name: string;
  course: string;
  status: string;
  is_gateway_cleared: boolean;
  gateway_approved_count: number;
  missing_gateway_documents: string[];
  has_active_assignment: boolean;
}

export async function listStudentsForAssignment(): Promise<AppResult<StudentAssignmentOption[]>> {
  const { supabase, authorized } = await getCoordinator();
  if (!authorized) return { data: null, error: { code: 'FORBIDDEN', message: 'Access denied.' } };

  // 1. Fetch active students
  const { data, error } = await supabase
    .from('students')
    .select(`
      student_id, student_number, course, status,
      users!inner ( full_name, account_status )
    `)
    .eq('users.account_status', 'active');

  if (error) return { data: null, error: { code: 'SERVER_FAILURE', message: 'Failed to load students.' } };

  // 2. Fetch existing active assignments
  const { data: activeAssignments } = await supabase
    .from('student_assignments')
    .select('student_id')
    .eq('assignment_status', 'active');

  const assignedStudentIds = new Set((activeAssignments ?? []).map(a => a.student_id));

  // 3. Fetch all approved reports to check gateway compliance
  const { data: approvedReports } = await supabase
    .from('reports')
    .select('student_id, report_type')
    .eq('status', 'approved');

  const studentApprovedSpecsMap = new Map<string, Set<string>>();
  (approvedReports ?? []).forEach(r => {
    const set = studentApprovedSpecsMap.get(r.student_id) || new Set<string>();
    for (const spec of GATEWAY_DOCUMENT_SPECS) {
      if (matchesDoc(r.report_type, spec.name)) {
        set.add(spec.id);
      }
    }
    studentApprovedSpecsMap.set(r.student_id, set);
  });

  interface AssignmentStudentRow {
    student_id: string;
    student_number: string;
    course: string;
    status: string;
    users: { full_name: string; account_status: string } | { full_name: string; account_status: string }[];
  }

  const students: StudentAssignmentOption[] = (data ?? []).map((s: AssignmentStudentRow) => {
    const user = Array.isArray(s.users) ? s.users[0] : s.users;
    const approvedSpecs = studentApprovedSpecsMap.get(s.student_id) || new Set<string>();
    const isCleared = approvedSpecs.size === GATEWAY_DOCUMENT_SPECS.length;
    const missing = GATEWAY_DOCUMENT_SPECS.filter(spec => !approvedSpecs.has(spec.id)).map(spec => spec.name);

    return {
      student_id: s.student_id,
      student_number: s.student_number,
      full_name: user?.full_name ?? '',
      course: s.course,
      status: s.status,
      is_gateway_cleared: isCleared,
      gateway_approved_count: approvedSpecs.size,
      missing_gateway_documents: missing,
      has_active_assignment: assignedStudentIds.has(s.student_id),
    };
  });

  return { data: students, error: null };
}

export async function listSupervisorsForCompany(
  company_id: string
): Promise<AppResult<{ supervisor_id: string; full_name: string; position: string }[]>> {
  if (!company_id) return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'Company ID is required.' } };

  const { supabase, authorized } = await getCoordinator();
  if (!authorized) return { data: null, error: { code: 'FORBIDDEN', message: 'Access denied.' } };

  const { data, error } = await supabase
    .from('supervisors')
    .select('supervisor_id, position, users ( full_name )')
    .eq('company_id', company_id);

  if (error) return { data: null, error: { code: 'SERVER_FAILURE', message: 'Failed to load supervisors.' } };

  interface SupervisorRow {
    supervisor_id: string;
    position: string;
    users: { full_name: string } | { full_name: string }[];
  }

  return {
    data: (data ?? []).map((s: SupervisorRow) => {
      const user = Array.isArray(s.users) ? s.users[0] : s.users;
      return {
        supervisor_id: s.supervisor_id,
        full_name: user?.full_name ?? '',
        position: s.position,
      };
    }),
    error: null,
  };
}
