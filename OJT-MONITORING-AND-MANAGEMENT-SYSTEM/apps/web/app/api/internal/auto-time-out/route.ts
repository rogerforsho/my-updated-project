import { timingSafeEqual } from 'node:crypto';
import { getServiceClient } from '@/src/lib/supabase/service';

export const runtime = 'nodejs';
export const maxDuration = 60;

const AUTO_TIME_OUT_MS = 10 * 60 * 60 * 1000;
const NO_STORE = { 'Cache-Control': 'no-store' };

function sameSecret(provided: string, expected: string): boolean {
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

// Closes attendance left open for 10 hours; the record stays pending, so no hours are credited until a Supervisor verifies it.
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: 'Worker is not configured.' }, { status: 503 });
  if (!sameSecret(request.headers.get('authorization') || '', `Bearer ${secret}`))
    return Response.json({ error: 'Unauthorized.' }, { status: 401, headers: NO_STORE });

  const service = getServiceClient();
  const now = Date.now();
  const { data: open, error } = await service
    .from('attendance')
    .select('attendance_id, time_in')
    .is('time_out', null)
    .lte('time_in', new Date(now - AUTO_TIME_OUT_MS).toISOString())
    .neq('sync_status', 'conflict')
    .limit(100);
  if (error) return Response.json({ error: 'Attendance is temporarily unavailable.' }, { status: 503, headers: NO_STORE });

  let timedOut = 0;
  let failed = 0;
  for (const row of open ?? []) {
    const { data, error: updateError } = await service
      .from('attendance')
      .update({
        time_out: new Date(Date.parse(row.time_in) + AUTO_TIME_OUT_MS).toISOString(),
        time_out_received_at: new Date(now).toISOString(),
        time_out_location_status: 'not_applicable',
        time_out_flag_reason: 'Automatic time-out: no Time Out was recorded within 10 hours of Time In.',
        verification_status: 'pending',
      })
      .eq('attendance_id', row.attendance_id)
      .is('time_out', null) // a student time-out that lands first wins
      .select('attendance_id');
    if (updateError) failed++;
    else if (data?.length) timedOut++;
  }

  return Response.json({ timedOut, failed }, { status: 200, headers: NO_STORE });
}
