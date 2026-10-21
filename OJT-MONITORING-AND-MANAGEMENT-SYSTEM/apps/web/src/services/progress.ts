'use server';

import { getTrustedActor } from '@/src/lib/trusted-actor';

import { isICSCourse } from '@/src/lib/departments';
import { departmentScope, restrictDepartment } from '@/src/lib/department-scope';
import type { AppResult, ProgressStatus } from '@ojt/shared';



export interface StudentProgressDetail {
  student_id: string;
  full_name: string;
  student_number: string;
  course: string;
  year_level: number;
  company_name: string | null;
  required_hours: number;
  completed_hours: number;
  remaining_hours: number;
  progress_status: ProgressStatus;
  percentage: number;
  verified_sessions_count: number;
}

export interface CourseBreakdown {
  total: number;
  active: number;
  completed: number;
  hours: number;
}

export interface DepartmentSummaryData {
  totalStudents: number;
  activeTrainees: number;
  completedTrainees: number;
  totalRenderedHours: number;
  ics: {
    total: number;
    completed: number;
    hours: number;
    bsit: CourseBreakdown;
    bscpe: CourseBreakdown;
  };
  ibe: {
    total: number;
    completed: number;
    hours: number;
    bsbaHrm: CourseBreakdown;
    bsEntrep: CourseBreakdown;
  };
}



export async function listCohortProgress(
  page = 1,
  pageSize = 20,
  courseFilter?: string,
  statusFilter?: ProgressStatus
): Promise<AppResult<{ students: StudentProgressDetail[]; total: number }>> {
  const { supabase, user, profile } = await getTrustedActor();
  if (!user || !profile || profile.role !== 'Coordinator' || profile.account_status !== 'active')
    return { data: null, error: { code: 'FORBIDDEN', message: 'Access denied.' } };

  if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 200)
    return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'Invalid page or page size.' } };
  const scope = await departmentScope(supabase, user.id, profile.role);
  if (scope.error) return { data: null, error: { code: 'FORBIDDEN', message: scope.error } };

  if (statusFilter && !['not_started', 'in_progress', 'completed'].includes(statusFilter))
    return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'Invalid progress status.' } };

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from('students')
    .select(`
      student_id,
      student_number,
      course,
      year_level,
      required_hours,
      users!inner ( full_name, email, account_status ),
      internship_progress ( completed_hours, progress_status ),
      progress_filter:internship_progress (),
      student_assignments (
        assignment_status,
        companies ( company_name )
      )
    `, { count: 'exact' })
    .eq('users.account_status', 'active')
    .order('student_number', { ascending: true })
    .order('student_id', { ascending: true })
    .range(from, to);

  if (courseFilter && courseFilter !== 'all') query = query.eq('course', courseFilter);
  if (statusFilter === 'not_started')
    query = query.or('progress_filter.is.null,progress_filter.progress_status.eq.not_started');
  else if (statusFilter)
    query = query.eq('progress_filter.progress_status', statusFilter).not('progress_filter', 'is', 'null');
  query = restrictDepartment(query, scope.department);

  const { data, error, count } = await query;

  if (error)
    return { data: null, error: { code: 'SERVER_FAILURE', message: 'Failed to load cohort progress.' } };

  const students = (data ?? []).map((s: any) => {
    const user = Array.isArray(s.users) ? s.users[0] : s.users;
    const progress = Array.isArray(s.internship_progress) ? s.internship_progress[0] : s.internship_progress;
    const assignment = Array.isArray(s.student_assignments) ? s.student_assignments[0] : s.student_assignments;
    const company = assignment ? (Array.isArray(assignment.companies) ? assignment.companies[0] : assignment.companies) : null;

    const required = s.required_hours || 486;
    const completed = progress?.completed_hours || 0;
    const remaining = Math.max(0, required - completed);
    const percentage = Math.min(100, Math.round((completed / required) * 100));

    return {
      student_id: s.student_id,
      full_name: user?.full_name || '',
      student_number: s.student_number,
      course: s.course,
      year_level: s.year_level,
      company_name: company?.company_name || 'Unassigned',
      required_hours: required,
      completed_hours: completed,
      remaining_hours: remaining,
      progress_status: progress?.progress_status || (completed > 0 ? 'in_progress' : 'not_started'),
      percentage,
      verified_sessions_count: 0,
    };
  });

  return { data: { students, total: count ?? 0 }, error: null };
}

export async function listAllCohortProgress(): Promise<AppResult<StudentProgressDetail[]>> {
  const first = await listCohortProgress(1, 200);
  if (first.error || !first.data) return { data: null, error: first.error };
  const students = [...first.data.students];
  const pageCount = Math.ceil(first.data.total / 200);
  for (let page = 2; page <= pageCount; page++) {
    const result = await listCohortProgress(page, 200);
    if (result.error || !result.data) return { data: null, error: result.error };
    students.push(...result.data.students);
  }
  if (students.length !== first.data.total)
    return { data: null, error: { code: 'SERVER_FAILURE', message: 'The complete cohort could not be loaded for scenario planning.' } };
  return { data: students, error: null };
}

export async function getDepartmentSummary(): Promise<AppResult<DepartmentSummaryData>> {
  const { supabase, user, profile } = await getTrustedActor();
  if (!user || !profile || profile.role !== 'Coordinator' || profile.account_status !== 'active')
    return { data: null, error: { code: 'FORBIDDEN', message: 'Access denied.' } };

  const scope = await departmentScope(supabase, user.id, profile.role);
  if (scope.error) return { data: null, error: { code: 'FORBIDDEN', message: scope.error } };

  // Read bounded pages so Supabase's response cap cannot silently truncate totals.
  type ProgressRow = { course: string; internship_progress: { completed_hours: number; progress_status: string } | { completed_hours: number; progress_status: string }[] | null };
  const data: ProgressRow[] = [];
  for (let offset = 0; ; ) {
    let query = supabase
    .from('students')
    .select(`
      student_id, course,
      users!inner ( account_status ),
      internship_progress ( completed_hours, progress_status )
    `)
    .eq('users.account_status', 'active')
    .order('student_id', { ascending: true })
    .range(offset, offset + 199);
    query = restrictDepartment(query, scope.department);
    const { data: rows, error } = await query;
    if (error) return { data: null, error: { code: 'SERVER_FAILURE', message: 'Failed to load department summary.' } };
    if (!rows?.length) break;
    data.push(...rows);
    offset += rows.length;
  }

  let totalStudents = 0;
  let activeTrainees = 0;
  let completedTrainees = 0;
  let totalRenderedHours = 0;

  const emptyBreakdown = (): CourseBreakdown => ({ total: 0, active: 0, completed: 0, hours: 0 });

  const summary: DepartmentSummaryData = {
    totalStudents: 0,
    activeTrainees: 0,
    completedTrainees: 0,
    totalRenderedHours: 0,
    ics: {
      total: 0,
      completed: 0,
      hours: 0,
      bsit: emptyBreakdown(),
      bscpe: emptyBreakdown(),
    },
    ibe: {
      total: 0,
      completed: 0,
      hours: 0,
      bsbaHrm: emptyBreakdown(),
      bsEntrep: emptyBreakdown(),
    },
  };

  data.forEach((row) => {
    totalStudents++;
    const progress = Array.isArray(row.internship_progress) ? row.internship_progress[0] : row.internship_progress;
    const completed = progress?.completed_hours || 0;
    const status = progress?.progress_status || 'not_started';

    totalRenderedHours += completed;
    if (status === 'completed') completedTrainees++;
    else if (status === 'in_progress') activeTrainees++;

    const c = (row.course || '').toUpperCase();

    if (isICSCourse(c)) {
      summary.ics.total++;
      summary.ics.hours += completed;
      if (status === 'completed') summary.ics.completed++;

      const isCpe = c.includes('BS-CPE') || c.includes('BSCPE') || c.includes('COMPUTER ENGINEERING');
      const target = isCpe ? summary.ics.bscpe : summary.ics.bsit;
      target.total++;
      target.hours += completed;
      if (status === 'completed') target.completed++;
      else if (status === 'in_progress') target.active++;
    } else {
      summary.ibe.total++;
      summary.ibe.hours += completed;
      if (status === 'completed') summary.ibe.completed++;

      const isEntrep = c.includes('BSENTREP') || c.includes('ENTREPRENEURSHIP');
      const target = isEntrep ? summary.ibe.bsEntrep : summary.ibe.bsbaHrm;
      target.total++;
      target.hours += completed;
      if (status === 'completed') target.completed++;
      else if (status === 'in_progress') target.active++;
    }
  });

  summary.totalStudents = totalStudents;
  summary.activeTrainees = activeTrainees;
  summary.completedTrainees = completedTrainees;
  summary.totalRenderedHours = totalRenderedHours;

  return { data: summary, error: null };
}
export async function getOwnStudentProgress(): Promise<AppResult<StudentProgressDetail>> {
  const { supabase, user, profile } = await getTrustedActor();
  if (!user || profile?.role !== 'Student' || profile?.account_status !== 'active')
    return { data: null, error: { code: 'FORBIDDEN', message: 'Access denied.' } };

  const { data: student, error: studentError } = await supabase
    .from('students')
    .select(`
      student_id, student_number, course, year_level, required_hours,
      internship_progress ( completed_hours, remaining_hours, progress_status ),
      student_assignments (
        assignment_status,
        companies ( company_name )
      )
    `)
    .eq('user_id', user.id)
    .single();

  if (studentError || !student)
    return { data: null, error: { code: 'NOT_FOUND', message: 'Student profile not found.' } };

  const progress = Array.isArray(student.internship_progress)
    ? student.internship_progress[0]
    : student.internship_progress;

  const { count: verifiedCount } = await supabase
    .from('attendance')
    .select('*', { count: 'exact', head: true })
    .eq('student_id', student.student_id)
    .eq('verification_status', 'verified');

  const required = student.required_hours || 486;
  const completed = progress?.completed_hours || 0;
  const remaining = Math.max(0, required - completed);
  const percentage = Math.min(100, Math.round((completed / required) * 100));

  const assignment = Array.isArray(student.student_assignments) ? student.student_assignments[0] : student.student_assignments;
  const company = assignment ? (Array.isArray(assignment.companies) ? assignment.companies[0] : assignment.companies) : null;

  return {
    data: {
      student_id: student.student_id,
      full_name: profile.full_name,
      student_number: student.student_number,
      course: student.course,
      year_level: student.year_level,
      company_name: company?.company_name || 'Not yet assigned',
      required_hours: required,
      completed_hours: completed,
      remaining_hours: remaining,
      progress_status: progress?.progress_status || (completed > 0 ? 'in_progress' : 'not_started'),
      percentage,
      verified_sessions_count: verifiedCount || 0,
    },
    error: null,
  };
}
