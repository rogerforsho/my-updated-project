import type { SupabaseClient } from '@supabase/supabase-js';
import { getGatewayStatus, resolveRequiredHours, validateScheduleFeasibility, validateSchedulePolicy, type WorkModality } from '@ojt/shared';
import { isUuid, mobileBffFailure, mobileBffOk, mobileBffPreamble } from '@/src/lib/mobile-bff';

export const runtime = 'nodejs';

const MODALITIES = new Set<WorkModality>(['on_site', 'hybrid', 'remote']);

function failure(code: string, message: string, status: number) {
  return mobileBffFailure({ status, code, message });
}

export async function POST(request: Request) {
  // No rate limit: this route never had one, and adding a counter here is a separate decision.
  const pre = await mobileBffPreamble(request, { body: { maxBytes: 16 * 1024, label: 'Schedule request' } });
  if (pre.response) return pre.response;
  const { actor, body: input } = pre;
  // shortcut: the BFF client types only the tables it declares; this route reads more, so use it untyped.
  const supabase = actor.supabase as unknown as SupabaseClient;

  if (!Array.isArray(input.work_days) || typeof input.time_in !== 'string' || typeof input.time_out !== 'string' ||
      typeof input.start_date !== 'string' || typeof input.lunch_break_minutes !== 'number' ||
      (input.lunch_break_start !== null && typeof input.lunch_break_start !== 'string') ||
      typeof input.work_modality !== 'string' || !MODALITIES.has(input.work_modality as WorkModality) ||
      (input.company_id != null && !isUuid(input.company_id)) ||
      (input.end_date != null && typeof input.end_date !== 'string') ||
      (input.custom_company_name != null && typeof input.custom_company_name !== 'string') ||
      (input.student_notes != null && typeof input.student_notes !== 'string'))
    return failure('VALIDATION_FAILURE', 'Complete the schedule fields with valid values.', 400);

  const policy = validateSchedulePolicy({
    work_days: input.work_days as number[],
    time_in: input.time_in,
    time_out: input.time_out,
    lunch_break_minutes: input.lunch_break_minutes,
    lunch_break_start: input.lunch_break_start as string | null,
    start_date: input.start_date,
    end_date: input.end_date as string | null | undefined,
    work_modality: input.work_modality as WorkModality,
  });
  if (!policy.ok) return failure('VALIDATION_FAILURE', policy.message, 400);

  const { data: student, error: studentError } = await supabase.from('students')
    .select('student_id, course, required_hours').eq('user_id', actor.user.id).maybeSingle();
  if (studentError || !student)
    return failure('NOT_FOUND', 'Student profile not found.', 404);
  const feasibility = validateScheduleFeasibility({
    start_date: input.start_date as string, end_date: input.end_date as string, work_days: input.work_days as number[],
    daily_hours: policy.value.daily_hours, required_hours: resolveRequiredHours(student.required_hours, student.course),
  });
  if (!feasibility.ok) return failure('VALIDATION_FAILURE', feasibility.message, 400);

  const { data: reports, error: reportsError } = await supabase.from('reports')
    .select('report_type').eq('student_id', student.student_id).eq('status', 'approved');
  if (reportsError) return failure('SERVER_FAILURE', 'Could not check pre-deployment documents.', 503);
  const gateway = getGatewayStatus(reports || []);
  // Students already placed with an active assignment are exempt from newly added documents.
  const { data: placed, error: placedError } = await supabase.from('student_assignments')
    .select('assignment_id').eq('student_id', student.student_id).eq('assignment_status', 'active').limit(1).maybeSingle();
  if (placedError) return failure('SERVER_FAILURE', 'Could not check your placement.', 503);
  if (!gateway.isCleared && !placed)
    return failure('VALIDATION_FAILURE', `Cannot propose practicum schedule: approved pre-deployment documents are required. Missing: ${gateway.missing.join(', ')}.`, 400);

  const { data: existing, error: existingError } = await supabase.from('practicum_schedules')
    .select('schedule_id, status').eq('student_id', student.student_id)
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (existingError) return failure('SERVER_FAILURE', 'Could not check the current schedule proposal.', 503);

  const scheduleFields = {
    company_id: input.company_id || null,
    custom_company_name: input.custom_company_name || null,
    work_modality: input.work_modality,
    work_days: input.work_days,
    time_in: input.time_in,
    time_out: input.time_out,
    lunch_break_minutes: policy.value.lunch_break_minutes,
    lunch_break_start: policy.value.lunch_break_start,
    daily_hours: policy.value.daily_hours,
    weekly_hours: policy.value.weekly_hours,
    start_date: input.start_date,
    end_date: input.end_date || null,
    student_notes: input.student_notes || null,
  };

  const result = existing?.status === 'pending'
    ? await supabase.from('practicum_schedules').update({ ...scheduleFields, updated_at: new Date().toISOString() })
        .eq('schedule_id', existing.schedule_id).select().single()
    : await supabase.from('practicum_schedules').insert({ ...scheduleFields, student_id: student.student_id, status: 'pending' })
        .select().single();

  if (result.error || !result.data)
    return failure('SERVER_FAILURE', 'Failed to submit schedule proposal.', 503);
  return mobileBffOk(result.data);
}
