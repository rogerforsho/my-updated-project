import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { validateSchedulePolicy, type WorkModality } from '@ojt/shared';
import { readLimitedJson } from '@/src/lib/read-limited-json';

export const runtime = 'nodejs';

const NO_STORE = { 'Cache-Control': 'no-store' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MODALITIES = new Set<WorkModality>(['on_site', 'hybrid', 'remote']);

function failure(code: string, message: string, status: number) {
  return Response.json({ data: null, error: { code, message } }, { status, headers: NO_STORE });
}

export async function POST(request: Request) {
  const authorization = request.headers.get('authorization');
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!token || !supabaseUrl || !supabaseKey)
    return failure('UNAUTHORIZED', 'Sign in again before submitting a schedule.', 401);

  const parsed = await readLimitedJson(request, 16 * 1024);
  if (parsed.error === 'too_large') return failure('VALIDATION_FAILURE', 'Schedule request is too large.', 413);
  if (parsed.error) return failure('VALIDATION_FAILURE', 'Schedule request could not be read.', 400);
  if (!parsed.data || typeof parsed.data !== 'object' || Array.isArray(parsed.data))
    return failure('VALIDATION_FAILURE', 'Invalid schedule request.', 400);
  const input = parsed.data as Record<string, unknown>;

  if (!Array.isArray(input.work_days) || typeof input.time_in !== 'string' || typeof input.time_out !== 'string' ||
      typeof input.start_date !== 'string' || typeof input.lunch_break_minutes !== 'number' ||
      (input.lunch_break_start !== null && typeof input.lunch_break_start !== 'string') ||
      typeof input.work_modality !== 'string' || !MODALITIES.has(input.work_modality as WorkModality) ||
      (input.company_id != null && (typeof input.company_id !== 'string' || !UUID.test(input.company_id))) ||
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

  const supabase = createSupabaseClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return failure('UNAUTHORIZED', 'Your session expired. Sign in again.', 401);

  const { data: profile, error: profileError } = await supabase.from('users')
    .select('role, account_status').eq('user_id', user.id).maybeSingle();
  if (profileError || profile?.role !== 'Student' || profile.account_status !== 'active')
    return failure('FORBIDDEN', 'Only active student accounts can submit schedules.', 403);

  const { data: student, error: studentError } = await supabase.from('students')
    .select('student_id').eq('user_id', user.id).maybeSingle();
  if (studentError || !student)
    return failure('NOT_FOUND', 'Student profile not found.', 404);

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
  return Response.json({ data: result.data, error: null }, { status: 200, headers: NO_STORE });
}
