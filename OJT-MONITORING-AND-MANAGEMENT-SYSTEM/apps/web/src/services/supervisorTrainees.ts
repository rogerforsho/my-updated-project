'use server';

import { getTrustedActor } from '@/src/lib/trusted-actor';
import { getServiceClient } from '@/src/lib/supabase/service';
import { toCsv } from '@/src/lib/csv';
import { expectedEndDate, type AppResult } from '@ojt/shared';

export interface PlacementEntry {
  assignment_id: string;
  assignment_status: string;
  start_date: string;
  end_date: string | null;
  company_name: string;
  branch_name: string;
  branch_address: string;
}

export interface SupervisedTrainee {
  student_id: string;
  full_name: string;
  student_number: string;
  course: string;
  /** Current placement (active one, otherwise the latest). */
  placement: PlacementEntry;
  history: PlacementEntry[];
  completed_hours: number;
  required_hours: number;
  graduated: boolean;
  /** Active placement with no attendance in the last 7 days. */
  no_recent_attendance: boolean;
  expected_end: string | null;
}

export interface CompanyIntake {
  company_id: string;
  company_name: string;
  max_interns: number | null;
  accepting_students: boolean;
  active_interns: number;
  is_open: boolean;
  /** Completed placements at this company whose hours met the requirement, across all supervisors. */
  company_graduated: number;
}

const DEFAULT_REQUIRED_HOURS = 486;
const INACTIVE_DAYS = 7;

// Mirrors course_department() in the database.
function departmentOf(course: string): 'ICS' | 'IBE' | null {
  const c = course.toUpperCase();
  if (/BSIT|BSCS|CPE|INFORMATION TECHNOLOGY|COMPUTER/.test(c)) return 'ICS';
  if (/BSBA|BSENTREP|ENTREPRENEURSHIP|HUMAN RESOURCE|BSA|ACCOUNTANCY/.test(c)) return 'IBE';
  return null;
}

const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] : v) ?? null;
const isoDaysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

async function supervisorContext() {
  const { supabase, user, profile } = await getTrustedActor();
  if (!user || profile?.role !== 'Supervisor') return null;
  const { data: supervisorId } = await supabase.rpc('get_my_supervisor_id');
  return supervisorId ? { supabase, supervisorId: supervisorId as string, userId: user.id } : null;
}

/**
 * Trainees for the signed-in Supervisor with placement, hours and status flags.
 * Reads through the service client (Supervisors have no RLS read on hours) but only ever for this supervisor's own assignments.
 */
export async function listSupervisedTrainees(): Promise<AppResult<SupervisedTrainee[]>> {
  const ctx = await supervisorContext();
  if (!ctx) return { data: null, error: { code: 'FORBIDDEN', message: 'Access denied.' } };
  const db = getServiceClient();

  const { data: rows, error } = await db.from('student_assignments')
    .select(`assignment_id, student_id, company_id, assignment_status, start_date, end_date,
      companies(company_name), company_branches(branch_name, address),
      students(student_number, course, required_hours, users(full_name))`)
    .eq('supervisor_id', ctx.supervisorId).order('start_date', { ascending: false }).limit(1000);
  if (error) return { data: null, error: { code: 'SERVER_FAILURE', message: 'Failed to load trainees.' } };

  const ids = [...new Set((rows ?? []).map((r) => r.student_id as string))];
  if (!ids.length) return { data: [], error: null };

  const [progress, recent, schedules, offDays] = await Promise.all([
    db.from('internship_progress').select('student_id, completed_hours').in('student_id', ids),
    db.from('attendance').select('student_id').in('student_id', ids).gte('attendance_date', isoDaysAgo(INACTIVE_DAYS)),
    db.from('practicum_schedules').select('student_id, work_days, daily_hours, created_at')
      .in('student_id', ids).in('status', ['approved', 'modified']).order('created_at', { ascending: false }),
    db.from('non_working_days').select('day_date, scope, department, company_id').gte('day_date', isoDaysAgo(0)).limit(1000),
  ]);

  const hours = new Map((progress.data ?? []).map((p) => [p.student_id as string, Number(p.completed_hours) || 0]));
  const attended = new Set((recent.data ?? []).map((a) => a.student_id as string));
  const schedule = new Map<string, { work_days: number[]; daily_hours: number }>();
  for (const s of schedules.data ?? []) if (!schedule.has(s.student_id as string)) schedule.set(s.student_id as string, { work_days: s.work_days as number[], daily_hours: Number(s.daily_hours) });

  const byStudent = new Map<string, typeof rows>();
  for (const r of rows ?? []) byStudent.set(r.student_id as string, [...(byStudent.get(r.student_id as string) ?? []), r]);

  const today = isoDaysAgo(0);
  const trainees: SupervisedTrainee[] = [];
  for (const [student_id, list] of byStudent) {
    const entries = list!.map((r) => {
      const company = one(r.companies as { company_name: string } | { company_name: string }[] | null);
      const branch = one(r.company_branches as { branch_name: string; address: string } | { branch_name: string; address: string }[] | null);
      return {
        row: r,
        entry: {
          assignment_id: r.assignment_id as string, assignment_status: r.assignment_status as string,
          start_date: r.start_date as string, end_date: (r.end_date as string | null) ?? null,
          company_name: company?.company_name ?? '', branch_name: branch?.branch_name ?? '', branch_address: branch?.address ?? '',
        } satisfies PlacementEntry,
      };
    });
    const current = entries.find((e) => e.entry.assignment_status === 'active') ?? entries[0];
    const student = one(current.row.students as unknown as { student_number: string; course: string; required_hours: number | null; users: unknown } | null);
    const user = one(student?.users as { full_name: string } | { full_name: string }[] | null);
    const required = student?.required_hours ?? DEFAULT_REQUIRED_HOURS;
    const done = hours.get(student_id) ?? 0;
    const active = current.entry.assignment_status === 'active';
    const dept = departmentOf(student?.course ?? '');
    const plan = schedule.get(student_id);
    const off = (offDays.data ?? []).filter((d) =>
      d.scope === 'global' || (d.scope === 'department' && d.department === dept) || (d.scope === 'company' && d.company_id === current.row.company_id));

    trainees.push({
      student_id,
      full_name: user?.full_name ?? '',
      student_number: student?.student_number ?? '',
      course: student?.course ?? '',
      placement: current.entry,
      history: entries.map((e) => e.entry),
      completed_hours: done,
      required_hours: required,
      graduated: entries.some((e) => e.entry.assignment_status === 'completed') && done >= required,
      no_recent_attendance: active && !attended.has(student_id),
      expected_end: active && plan
        ? expectedEndDate({ remainingHours: Math.max(0, required - done), dailyHours: plan.daily_hours, workDays: plan.work_days, nonWorkingDates: off.map((d) => d.day_date as string), asOfDate: today })
        : null,
    });
  }
  return { data: trainees.sort((a, b) => a.full_name.localeCompare(b.full_name)), error: null };
}

export async function getMyCompanyIntake(): Promise<AppResult<CompanyIntake>> {
  const ctx = await supervisorContext();
  if (!ctx) return { data: null, error: { code: 'FORBIDDEN', message: 'Access denied.' } };
  const db = getServiceClient();
  const { data: sup } = await db.from('supervisors').select('company_id').eq('supervisor_id', ctx.supervisorId).maybeSingle();
  if (!sup?.company_id) return { data: null, error: { code: 'NOT_FOUND', message: 'No company is linked to your account.' } };
  const [company, active, open] = await Promise.all([
    db.from('companies').select('company_id, company_name, max_interns, accepting_students').eq('company_id', sup.company_id).single(),
    db.from('student_assignments').select('*', { count: 'exact', head: true }).eq('company_id', sup.company_id).eq('assignment_status', 'active'),
    db.rpc('company_is_open', { p_company_id: sup.company_id }),
  ]);
  if (company.error || !company.data) return { data: null, error: { code: 'SERVER_FAILURE', message: 'Could not load company settings.' } };

  const { data: done } = await db.from('student_assignments')
    .select('student_id, students(required_hours)').eq('company_id', sup.company_id).eq('assignment_status', 'completed').limit(2000);
  const doneIds = [...new Set((done ?? []).map((d) => d.student_id as string))];
  const { data: prog } = doneIds.length
    ? await db.from('internship_progress').select('student_id, completed_hours').in('student_id', doneIds)
    : { data: [] as { student_id: string; completed_hours: number }[] };
  const hrs = new Map((prog ?? []).map((p) => [p.student_id as string, Number(p.completed_hours) || 0]));
  const graduated = new Set((done ?? []).filter((d) => {
    const st = one(d.students as unknown as { required_hours: number | null } | null);
    return (hrs.get(d.student_id as string) ?? 0) >= (st?.required_hours ?? DEFAULT_REQUIRED_HOURS);
  }).map((d) => d.student_id as string));

  return { data: { ...company.data, active_interns: active.count ?? 0, is_open: open.data === true, company_graduated: graduated.size } as CompanyIntake, error: null };
}

export async function setMyCompanyIntake(input: { max_interns: number | null; accepting_students: boolean }): Promise<AppResult<null>> {
  const ctx = await supervisorContext();
  if (!ctx) return { data: null, error: { code: 'FORBIDDEN', message: 'Access denied.' } };
  const max = input.max_interns;
  if (max !== null && (!Number.isInteger(max) || max < 1 || max > 500))
    return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'Enter a whole number from 1 to 500, or leave it empty for no limit.' } };
  const { error } = await ctx.supabase.rpc('supervisor_set_company_intake', { p_max_interns: max, p_accepting: input.accepting_students });
  if (error) return { data: null, error: { code: 'SERVER_FAILURE', message: 'Could not save intake settings.' } };
  return { data: null, error: null };
}

async function ownsTrainee(supervisorId: string, studentId: string) {
  const { count } = await getServiceClient().from('student_assignments')
    .select('*', { count: 'exact', head: true }).eq('supervisor_id', supervisorId).eq('student_id', studentId);
  return (count ?? 0) > 0;
}

/** Files the trainee already uploaded; open each through getSignedDocumentUrl. */
export async function listTraineeReports(student_id: string): Promise<AppResult<{ report_id: string; report_type: string; file_path: string; status: string; submission_date: string }[]>> {
  const ctx = await supervisorContext();
  if (!ctx || !(await ownsTrainee(ctx.supervisorId, student_id))) return { data: null, error: { code: 'FORBIDDEN', message: 'Access denied.' } };
  const { data, error } = await ctx.supabase.from('reports')
    .select('report_id, report_type, file_path, status, submission_date')
    .eq('student_id', student_id).order('submission_date', { ascending: false }).limit(200);
  if (error) return { data: null, error: { code: 'SERVER_FAILURE', message: 'Could not load reports.' } };
  return { data: data ?? [], error: null };
}

export async function exportTraineeAttendanceCsv(student_id: string, from: string, to: string): Promise<AppResult<{ filename: string; csv: string }>> {
  const ctx = await supervisorContext();
  if (!ctx || !(await ownsTrainee(ctx.supervisorId, student_id))) return { data: null, error: { code: 'FORBIDDEN', message: 'Access denied.' } };
  const date = /^\d{4}-\d{2}-\d{2}$/;
  if (!date.test(from) || !date.test(to) || from > to)
    return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'Choose a valid date range.' } };
  const { data, error } = await getServiceClient().from('attendance')
    .select('attendance_date, time_in, time_out, credited_hours, late_status, verification_status, time_in_location_status, time_out_location_status')
    .eq('student_id', student_id).gte('attendance_date', from).lte('attendance_date', to)
    .order('attendance_date').limit(2000);
  if (error) return { data: null, error: { code: 'SERVER_FAILURE', message: 'Could not export attendance.' } };
  const csv = toCsv(
    ['Date', 'Time in', 'Time out', 'Credited hours', 'Late status', 'Verification', 'Time-in location', 'Time-out location'],
    (data ?? []).map((r) => [r.attendance_date, r.time_in, r.time_out, r.credited_hours, r.late_status, r.verification_status, r.time_in_location_status, r.time_out_location_status]),
  );
  return { data: { filename: `attendance_${from}_to_${to}.csv`, csv }, error: null };
}
