'use server';

import { getTrustedActor } from '@/src/lib/trusted-actor';

import { canManageDepartmentStudent } from '@/src/lib/department-scope';
import { recordAuditEvent } from '@/src/lib/audit';
import { checkStudentGatewayStatus } from './reports';
import { GATEWAY_DOCUMENT_SPECS, practicumWindowError, resolveRequiredHours, validateScheduleFeasibility, validateSchedulePolicy } from '@ojt/shared';
import type { AppResult, DbPracticumSchedule, WorkModality } from '@ojt/shared';



export interface PracticumScheduleInput {
  company_id?: string | null;
  custom_company_name?: string | null;
  work_modality: WorkModality;
  work_days: number[]; // 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
  time_in: string; // "HH:MM" e.g. "08:00"
  time_out: string; // "HH:MM" e.g. "17:00"
  lunch_break_minutes?: number; // default 60
  lunch_break_start: string | null;
  start_date: string;
  end_date?: string | null;
  student_notes?: string | null;
}

export type ScheduleDetail = Omit<DbPracticumSchedule, 'students' | 'companies'> & {
  students?: {
    student_id: string;
    student_number: string;
    course: string;
    year_level: number;
    users?: { full_name: string; email: string } | null;
  } | null;
  companies?: { company_id: string; company_name: string; address?: string | null } | null;
};

export async function submitPracticumSchedule(
  input: PracticumScheduleInput
): Promise<AppResult<DbPracticumSchedule>> {
  const { supabase, user, profile } = await getTrustedActor();
  if (!user || profile?.role !== 'Student' || profile?.account_status !== 'active') {
    return { data: null, error: { code: 'FORBIDDEN', message: 'Access denied.' } };
  }

  const { data: student } = await supabase
    .from('students')
    .select('student_id, course, required_hours')
    .eq('user_id', user.id)
    .single();

  if (!student) {
    return { data: null, error: { code: 'NOT_FOUND', message: 'Student record not found.' } };
  }

  // 1. Enforce Gateway Clearance (all required documents approved). Students already placed are exempt.
  const gateway = await checkStudentGatewayStatus(student.student_id);
  const { data: placed } = await supabase
    .from('student_assignments').select('assignment_id')
    .eq('student_id', student.student_id).eq('assignment_status', 'active').limit(1).maybeSingle();
  if (!gateway.isCleared && !placed) {
    return {
      data: null,
      error: {
        code: 'VALIDATION_FAILURE',
        message: `Cannot propose practicum schedule: You must first have your ${GATEWAY_DOCUMENT_SPECS.length} mandatory pre-deployment documents approved by your OJT Coordinator (Missing: ${gateway.missing.join(', ')}).`,
      },
    };
  }

  // 2. Validate input fields
  // 3. Apply the same pure CHED/CDM policy as mobile; persistence stays here.
  const policy = validateSchedulePolicy(input);
  if (!policy.ok) {
    return { data: null, error: { code: 'VALIDATION_FAILURE', message: policy.message } };
  }
  const { lunch_break_minutes: lunchMinutes, lunch_break_start: lunchStart, daily_hours: dailyHours, weekly_hours: weeklyHours } = policy.value;
  const feasibility = validateScheduleFeasibility({
    start_date: input.start_date!, end_date: input.end_date!, work_days: input.work_days,
    daily_hours: dailyHours, required_hours: resolveRequiredHours(student.required_hours, student.course),
  });
  if (!feasibility.ok) return { data: null, error: { code: 'VALIDATION_FAILURE', message: feasibility.message } };

  // 4. Upsert or Insert schedule proposal
  const { data: existing } = await supabase
    .from('practicum_schedules')
    .select('schedule_id, status')
    .eq('student_id', student.student_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  let result;
  if (existing && existing.status === 'pending') {
    result = await supabase
      .from('practicum_schedules')
      .update({
        company_id: input.company_id || null,
        custom_company_name: input.custom_company_name || null,
        work_modality: input.work_modality,
        work_days: input.work_days,
        time_in: input.time_in,
        time_out: input.time_out,
        lunch_break_minutes: lunchMinutes,
        lunch_break_start: lunchStart,
        daily_hours: dailyHours,
        weekly_hours: weeklyHours,
        start_date: input.start_date,
        end_date: input.end_date || null,
        student_notes: input.student_notes || null,
        updated_at: new Date().toISOString(),
      })
      .eq('schedule_id', existing.schedule_id)
      .select()
      .single();
  } else {
    result = await supabase
      .from('practicum_schedules')
      .insert({
        student_id: student.student_id,
        company_id: input.company_id || null,
        custom_company_name: input.custom_company_name || null,
        work_modality: input.work_modality,
        work_days: input.work_days,
        time_in: input.time_in,
        time_out: input.time_out,
        lunch_break_minutes: lunchMinutes,
        lunch_break_start: lunchStart,
        daily_hours: dailyHours,
        weekly_hours: weeklyHours,
        start_date: input.start_date,
        end_date: input.end_date || null,
        student_notes: input.student_notes || null,
        status: 'pending',
      })
      .select()
      .single();
  }

  if (result.error) {
    return { data: null, error: { code: 'SERVER_FAILURE', message: 'Failed to submit practicum schedule.' } };
  }

  await recordAuditEvent({
    actor_user_id: user.id,
    action: 'PRACTICUM_SCHEDULE_SUBMITTED',
    entity_type: 'practicum_schedule',
    entity_id: result.data.schedule_id,
    details: { daily_hours: dailyHours, weekly_hours: weeklyHours, modality: input.work_modality },
  });

  return { data: result.data as DbPracticumSchedule, error: null };
}

export async function getStudentPracticumSchedule(): Promise<AppResult<ScheduleDetail | null>> {
  const { supabase, user } = await getTrustedActor();
  if (!user) return { data: null, error: { code: 'FORBIDDEN', message: 'Access denied.' } };

  const { data: student } = await supabase
    .from('students')
    .select('student_id')
    .eq('user_id', user.id)
    .single();

  if (!student) return { data: null, error: { code: 'NOT_FOUND', message: 'Student record not found.' } };

  const { data, error } = await supabase
    .from('practicum_schedules')
    .select(`
      *,
      students (
        student_id, student_number, course, year_level,
        users ( full_name, email )
      ),
      companies ( company_id, company_name, address )
    `)
    .eq('student_id', student.student_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return { data: null, error: { code: 'SERVER_FAILURE', message: 'Failed to load schedule.' } };
  return { data: (data as ScheduleDetail) || null, error: null };
}

export async function listPracticumSchedules(
  statusFilter = 'pending',
  page = 1,
  pageSize = 20
): Promise<AppResult<{ schedules: ScheduleDetail[]; total: number }>> {
  const { supabase, user, profile } = await getTrustedActor();
  if (!user || profile?.role !== 'Coordinator' || profile?.account_status !== 'active') {
    return { data: null, error: { code: 'FORBIDDEN', message: 'Access denied.' } };
  }

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from('practicum_schedules')
    .select(`
      *,
      students (
        student_id, student_number, course, year_level,
        users ( full_name, email )
      ),
      companies ( company_id, company_name, address )
    `, { count: 'exact' })
    .order('created_at', { ascending: false });

  if (statusFilter !== 'all') {
    query = query.eq('status', statusFilter);
  }

  const { data, error, count } = await query.range(from, to);

  if (error) return { data: null, error: { code: 'SERVER_FAILURE', message: 'Failed to load schedules.' } };
  return { data: { schedules: (data as ScheduleDetail[]) || [], total: count ?? 0 }, error: null };
}

export async function reviewPracticumSchedule(
  schedule_id: string,
  action: 'approve' | 'reject' | 'modify',
  reviewData?: {
    company_id?: string;
    branch_id?: string;
    supervisor_id?: string;
    feedback?: string;
    start_date?: string;
    end_date?: string;
  }
): Promise<AppResult<null>> {
  const { supabase, user, profile } = await getTrustedActor();
  if (!user || profile?.role !== 'Coordinator' || profile?.account_status !== 'active') {
    return { data: null, error: { code: 'FORBIDDEN', message: 'Access denied.' } };
  }

  const { data: schedule } = await supabase
    .from('practicum_schedules')
    .select('*')
    .eq('schedule_id', schedule_id)
    .single();

  if (!schedule) {
    return { data: null, error: { code: 'NOT_FOUND', message: 'Schedule proposal not found.' } };
  }
  if (!await canManageDepartmentStudent(supabase, user.id, profile.role, schedule.student_id))
    return { data: null, error: { code: 'FORBIDDEN', message: 'Schedule is outside your department.' } };
  if (!['approve', 'reject', 'modify'].includes(action))
    return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'Invalid schedule decision.' } };
  if (action === 'approve' && (!reviewData?.company_id || !reviewData.branch_id || !reviewData.supervisor_id))
    return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'Choose the HTE, approved branch, and Supervisor before approval.' } };
  if (action === 'approve') {
    // The approved window (as edited here) must respect the 5-month cap and still fit the required hours.
    const start = reviewData?.start_date || schedule.start_date;
    const end = reviewData?.end_date || schedule.end_date;
    const windowError = practicumWindowError(start, end);
    if (windowError) return { data: null, error: { code: 'VALIDATION_FAILURE', message: windowError } };
    const { data: owner } = await supabase.from('students').select('course, required_hours').eq('student_id', schedule.student_id).maybeSingle();
    const feasibility = validateScheduleFeasibility({
      start_date: start, end_date: end, work_days: schedule.work_days,
      daily_hours: Number(schedule.daily_hours), required_hours: resolveRequiredHours(owner?.required_hours, owner?.course),
    });
    if (!feasibility.ok) return { data: null, error: { code: 'VALIDATION_FAILURE', message: feasibility.message } };
  }

  const { error } = await supabase.rpc('coordinator_review_practicum_schedule', {
    p_schedule_id: schedule_id,
    p_action: action,
    p_company_id: reviewData?.company_id || null,
    p_branch_id: reviewData?.branch_id || null,
    p_supervisor_id: reviewData?.supervisor_id || null,
    p_feedback: reviewData?.feedback || null,
    p_start_date: reviewData?.start_date || null,
    p_end_date: reviewData?.end_date || null,
  });
  if (error) {
    if (error.code === '42501')
      return { data: null, error: { code: 'FORBIDDEN', message: 'Schedule is outside your department.' } };
    if (error.code === '22023' || error.code === '23505')
      return { data: null, error: { code: 'VALIDATION_FAILURE', message: error.message } };
    return { data: null, error: { code: 'SERVER_FAILURE', message: 'Failed to review schedule.' } };
  }

  return { data: null, error: null };
}
