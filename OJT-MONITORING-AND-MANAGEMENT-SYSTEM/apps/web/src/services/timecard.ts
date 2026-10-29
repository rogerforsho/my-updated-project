'use server';

import { getTrustedActor } from '@/src/lib/trusted-actor';
import { toCsv } from '@/src/lib/csv';
import type { AppResult } from '@ojt/shared';

export interface TimecardRow {
  key: string;
  student_id: string;
  full_name: string;
  student_number: string;
  company_name: string;
  date: string;
  time_in: string | null;
  time_out: string | null;
  hours: number | null;
  late: 'on_time' | 'late' | 'unknown' | 'absent';
  selfie: 'in_out' | 'in_only' | 'none';
  gps: string;
}

export interface TimecardFilter {
  search?: string;
  companyId?: string;
  from: string;
  to: string;
  /** When set, scheduled workdays with no record in the range are returned as absent rows. */
  studentId?: string;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] : v) ?? null;

function departmentOf(course: string): 'ICS' | 'IBE' | null {
  const c = course.toUpperCase();
  if (/BSIT|BSCS|CPE|INFORMATION TECHNOLOGY|COMPUTER/.test(c)) return 'ICS';
  if (/BSBA|BSENTREP|ENTREPRENEURSHIP|HUMAN RESOURCE|BSA|ACCOUNTANCY/.test(c)) return 'IBE';
  return null;
}

async function coordinator() {
  const { supabase, user, profile } = await getTrustedActor();
  return user && profile?.role === 'Coordinator' ? supabase : null;
}

type Raw = {
  attendance_id: string; student_id: string; attendance_date: string; time_in: string | null; time_out: string | null;
  credited_hours: number | null; late_status: TimecardRow['late']; time_in_selfie_path: string | null; time_out_selfie_path: string | null;
  time_in_location_status: string | null;
  students: unknown; student_assignments: unknown;
};

/**
 * Read-only per-student timecard. Row Level Security limits records to the coordinator's granted departments.
 * Absent rows are only produced for one selected student, so the list stays bounded.
 */
export async function listTimecard(page: number, pageSize: number, f: TimecardFilter): Promise<AppResult<{ rows: TimecardRow[]; total: number }>> {
  const supabase = await coordinator();
  if (!supabase) return { data: null, error: { code: 'FORBIDDEN', message: 'Access denied.' } };
  if (!DATE.test(f.from) || !DATE.test(f.to) || f.from > f.to)
    return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'Choose a valid date range.' } };

  const q = f.search?.trim().replace(/[%_,()]/g, '');
  let query = supabase.from('attendance')
    .select(`attendance_id, student_id, attendance_date, time_in, time_out, credited_hours, late_status,
      time_in_selfie_path, time_out_selfie_path, time_in_location_status,
      students${q ? '!inner' : ''}(student_number, course, users${q ? '!inner' : ''}(full_name)),
      student_assignments(company_id, companies(company_name))`, { count: 'exact' })
    .gte('attendance_date', f.from).lte('attendance_date', f.to)
    .order('attendance_date', { ascending: false }).order('time_in', { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);
  if (f.studentId) query = query.eq('student_id', f.studentId);
  if (f.companyId) {
    // An inner join through assignments is too slow under row security; filter on the company's assignment ids instead.
    const { data: ids } = await supabase.from('student_assignments').select('assignment_id').eq('company_id', f.companyId).limit(1000);
    if (!ids?.length) return { data: { rows: [], total: 0 }, error: null };
    query = query.in('assignment_id', ids.map((a) => a.assignment_id as string));
  }
  // one table per query: a student number has digits, otherwise match the name
  if (q) query = /\d/.test(q) ? query.ilike('students.student_number', `%${q}%`) : query.ilike('students.users.full_name', `%${q}%`);

  const { data, error, count } = await query;
  if (error) return { data: null, error: { code: 'SERVER_FAILURE', message: 'Could not load the timecard.' } };

  const rows: TimecardRow[] = ((data ?? []) as unknown as Raw[]).map((r) => {
    const st = one(r.students as { student_number: string; users: { full_name: string } | { full_name: string }[] } | null);
    const user = one(st?.users);
    const asg = one(r.student_assignments as { companies: { company_name: string } | { company_name: string }[] | null } | null);
    return {
      key: r.attendance_id, student_id: r.student_id,
      full_name: user?.full_name ?? '', student_number: st?.student_number ?? '',
      company_name: one(asg?.companies)?.company_name ?? '',
      date: r.attendance_date, time_in: r.time_in, time_out: r.time_out,
      hours: r.credited_hours == null ? null : Number(r.credited_hours),
      late: r.late_status,
      selfie: r.time_in_selfie_path ? (r.time_out_selfie_path ? 'in_out' : 'in_only') : 'none',
      gps: r.time_in_location_status ?? 'not_applicable',
    };
  });

  let total = count ?? 0;
  if (f.studentId && page === 1) {
    const absent = await absentDays(supabase, f.studentId, f.from, f.to);
    if (absent.length) {
      const who = rows[0];
      const { data: s } = who ? { data: null } : await supabase.from('students').select('student_number, users(full_name)').eq('student_id', f.studentId).maybeSingle();
      const su = one(one(s as { users: { full_name: string } | { full_name: string }[] } | null)?.users);
      for (const date of absent) rows.push({
        key: `absent-${date}`, student_id: f.studentId,
        full_name: who?.full_name ?? su?.full_name ?? '', student_number: who?.student_number ?? (s as { student_number?: string } | null)?.student_number ?? '',
        company_name: who?.company_name ?? '', date, time_in: null, time_out: null, hours: 0, late: 'absent', selfie: 'none', gps: 'not_applicable',
      });
      rows.sort((a, b) => b.date.localeCompare(a.date));
      total += absent.length;
    }
  }
  return { data: { rows, total }, error: null };
}

/** Scheduled workdays inside the placement, up to yesterday, with no attendance record. */
async function absentDays(supabase: NonNullable<Awaited<ReturnType<typeof coordinator>>>, studentId: string, from: string, to: string): Promise<string[]> {
  const [{ data: sched }, { data: asg }, { data: recs }, { data: student }] = await Promise.all([
    supabase.from('practicum_schedules').select('work_days').eq('student_id', studentId).in('status', ['approved', 'modified']).order('created_at', { ascending: false }).limit(1),
    supabase.from('student_assignments').select('company_id, start_date, end_date').eq('student_id', studentId).order('start_date', { ascending: false }),
    supabase.from('attendance').select('attendance_date').eq('student_id', studentId).gte('attendance_date', from).lte('attendance_date', to),
    supabase.from('students').select('course').eq('student_id', studentId).maybeSingle(),
  ]);
  const workDays = new Set<number>((sched?.[0]?.work_days as number[] | undefined) ?? []);
  if (!workDays.size || !asg?.length) return [];
  const dept = departmentOf(student?.course ?? '');
  const { data: off } = await supabase.from('non_working_days').select('day_date, scope, department, company_id').gte('day_date', from).lte('day_date', to);
  const closed = new Set((off ?? []).filter((d) => d.scope === 'global' || (d.scope === 'department' && d.department === dept) ||
    (d.scope === 'company' && asg.some((a) => a.company_id === d.company_id))).map((d) => d.day_date as string));
  const present = new Set((recs ?? []).map((r) => r.attendance_date as string));
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  const last = to < yesterday ? to : yesterday;

  const out: string[] = [];
  const cursor = new Date(`${from}T00:00:00.000Z`);
  for (let i = 0; i < 400 && cursor.toISOString().slice(0, 10) <= last; i++, cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const iso = cursor.toISOString().slice(0, 10);
    const inPlacement = asg.some((a) => iso >= (a.start_date as string) && (!a.end_date || iso <= (a.end_date as string)));
    if (inPlacement && workDays.has(cursor.getUTCDay()) && !closed.has(iso) && !present.has(iso)) out.push(iso);
  }
  return out;
}

export async function exportTimecardCsv(studentId: string, from: string, to: string): Promise<AppResult<{ filename: string; csv: string }>> {
  const res = await listTimecard(1, 2000, { studentId, from, to });
  if (res.error || !res.data) return { data: null, error: res.error ?? { code: 'SERVER_FAILURE', message: 'Export failed.' } };
  const csv = toCsv(
    ['Student', 'Student ID', 'Date', 'Time in', 'Time out', 'Hours', 'Status', 'Selfie', 'GPS'],
    res.data.rows.map((r) => [r.full_name, r.student_number, r.date, r.time_in, r.time_out, r.hours, r.late, r.selfie, r.gps]),
  );
  return { data: { filename: `timecard_${from}_to_${to}.csv`, csv }, error: null };
}
