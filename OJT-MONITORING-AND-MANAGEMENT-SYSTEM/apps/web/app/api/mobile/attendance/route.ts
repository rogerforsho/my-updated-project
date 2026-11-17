import { getAttendanceDate } from '@ojt/shared';
import { mobileBffFailure, mobileBffPreamble } from '@/src/lib/mobile-bff';
import { getServiceClient } from '@/src/lib/supabase/service';
import { recordTimeIn, recordTimeOut } from '@/src/lib/attendance-flow';
import { supabaseAttendanceAdapter } from '@/src/lib/attendance-flow-supabase';

export const runtime = 'nodejs';

function isTimestamp(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(new Date(value).getTime());
}

function validCoordinate(value: unknown, min: number, max: number): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max);
}

function ownedSelfiePath(value: unknown, studentId: string, type: 'time_in' | 'time_out'): value is string {
  return typeof value === 'string' && value.startsWith(`${studentId}/`) && value.split('/').length === 2 &&
    new RegExp(`^${type}_[a-zA-Z0-9_-]{1,100}\\.jpg$`, 'i').test(value.split('/')[1]);
}

export async function POST(request: Request) {
  const pre = await mobileBffPreamble(request, {
    limit: { action: 'attendance_submit', max: 60, windowSeconds: 3600 },
    body: { maxBytes: 16 * 1024, label: 'Attendance request' },
  });
  if (pre.response) return pre.response;
  const { actor, body: input } = pre;
  const adapter = supabaseAttendanceAdapter(getServiceClient(), actor.supabase);
  const studentId = actor.studentId;
  const latitude = input.latitude;
  const longitude = input.longitude;
  const clientReason = input.flag_reason;
  if (typeof latitude === 'undefined' || typeof longitude === 'undefined' ||
      !validCoordinate(latitude, -90, 90) || !validCoordinate(longitude, -180, 180) ||
      ((latitude === null) !== (longitude === null)) ||
      (clientReason != null && typeof clientReason !== 'string'))
    return mobileBffFailure({ status: 400, code: 'VALIDATION_FAILURE', message: 'Attendance location data is invalid.' });

  if (input.action === 'time_in') {
    const assignmentId = input.assignment_id;
    const attendanceDate = input.attendance_date;
    const capturedAt = input.time_in;
    const selfiePath = input.time_in_selfie_path;
    if (typeof assignmentId !== 'string' || !isTimestamp(capturedAt) || typeof attendanceDate !== 'string' ||
        attendanceDate !== getAttendanceDate(new Date(capturedAt)) || !ownedSelfiePath(selfiePath, studentId, 'time_in'))
      return mobileBffFailure({ status: 400, code: 'VALIDATION_FAILURE', message: 'Time In details are invalid.' });
    const result = await recordTimeIn(adapter, studentId,
      { assignmentId, attendanceDate, capturedAt, selfiePath, latitude, longitude, clientReason }, Date.now());
    if ('failure' in result) return mobileBffFailure(result.failure);
    return Response.json({ data: { attendance_id: result.attendanceId }, error: null }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
  }

  if (input.action === 'time_out') {
    const capturedAt = input.time_out;
    const attendanceDate = input.attendance_date;
    const attendanceId = input.attendance_id;
    const selfiePath = input.time_out_selfie_path;
    if (!isTimestamp(capturedAt) || typeof attendanceDate !== 'string' ||
        attendanceDate !== getAttendanceDate(new Date(capturedAt)) ||
        (attendanceId != null && typeof attendanceId !== 'string') ||
        !ownedSelfiePath(selfiePath, studentId, 'time_out'))
      return mobileBffFailure({ status: 400, code: 'VALIDATION_FAILURE', message: 'Time Out details are invalid.' });
    const result = await recordTimeOut(adapter, studentId, {
      attendanceId: typeof attendanceId === 'string' ? attendanceId : null,
      attendanceDate, capturedAt, selfiePath, latitude, longitude, clientReason,
    }, Date.now());
    if ('failure' in result) return mobileBffFailure(result.failure);
    return Response.json({ data: null, error: null }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
  }

  return mobileBffFailure({ status: 400, code: 'VALIDATION_FAILURE', message: 'Unknown attendance action.' });
}
