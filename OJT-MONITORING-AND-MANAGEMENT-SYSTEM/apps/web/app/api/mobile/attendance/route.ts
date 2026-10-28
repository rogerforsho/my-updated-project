import { AUTO_TIME_OUT_REASON, getAttendanceDate, getPhilippineClock, isWithinGeofence } from '@ojt/shared';
import { authenticateMobileStudent, mobileBffFailure, type MobileSupabaseClient } from '@/src/lib/mobile-bff';
import { getServiceClient } from '@/src/lib/supabase/service';
import { authActionLimit } from '@/src/services/auth/internal';
import { validateUploadedBytes } from '@/src/lib/uploadValidation';
import { readLimitedJson } from '@/src/lib/read-limited-json';

export const runtime = 'nodejs';
type LocationStatus = 'verified' | 'flagged_out_of_bounds' | 'location_unavailable' | 'not_applicable';
const MAX_SELFIE_SIZE = 5 * 1024 * 1024;
// Small allowance for device/server clock drift; anything later is a future-dated entry.
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
const FUTURE_FAILURE = { status: 400, code: 'VALIDATION_FAILURE', message: 'Attendance cannot be recorded for a future date or time.' } as const;

function isFuture(value: string): boolean {
  return new Date(value).getTime() > Date.now() + MAX_CLOCK_SKEW_MS;
}

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

type AttendancePolicy = {
  companyId: string;
  remote: boolean;
  geofenceEnabled: boolean;
  latitude: number | null;
  longitude: number | null;
  radiusMeters: number;
};

async function loadAttendancePolicy(
  service: ReturnType<typeof getServiceClient>,
  studentId: string,
  assignmentId: string,
  attendanceDate: string,
): Promise<AttendancePolicy | 'unavailable' | null> {
  const assignmentQuery = service.from('student_assignments')
    .select('assignment_id, company_id, branch_id, start_date, end_date')
    .eq('assignment_id', assignmentId)
    .eq('student_id', studentId);
  const { data: assignment, error: assignmentError } = await assignmentQuery.maybeSingle();
  if (assignmentError) return 'unavailable';
  if (!assignment) return null;
  if (assignment.start_date > attendanceDate || (assignment.end_date && assignment.end_date < attendanceDate)) return null;

  const { data: company, error: companyError } = await service.from('company_branches')
    .select('latitude, longitude, geofence_radius_meters, geofence_enabled')
    .eq('company_id', assignment.company_id).eq('branch_id', assignment.branch_id).maybeSingle();
  if (companyError) return 'unavailable';
  if (!company) return null;

  const { data: schedule, error: scheduleError } = await service.from('practicum_schedules')
    .select('work_modality')
    .eq('student_id', studentId)
    .eq('company_id', assignment.company_id)
    .eq('branch_id', assignment.branch_id)
    .eq('status', 'approved')
    .lte('start_date', attendanceDate)
    .or(`end_date.is.null,end_date.gte.${attendanceDate}`)
    .order('start_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (scheduleError) return 'unavailable';

  const latitude = company.latitude == null ? null : Number(company.latitude);
  const longitude = company.longitude == null ? null : Number(company.longitude);
  return {
    companyId: assignment.company_id,
    remote: schedule?.work_modality === 'remote',
    geofenceEnabled: company.geofence_enabled === true,
    latitude: Number.isFinite(latitude) ? latitude : null,
    longitude: Number.isFinite(longitude) ? longitude : null,
    radiusMeters: Number(company.geofence_radius_meters) || 150,
  };
}

async function hasValidSelfie(service: ReturnType<typeof getServiceClient>, path: string): Promise<boolean> {
  const storage = service.storage.from('attendance-selfies');
  const { data: metadata, error: infoError } = await storage.info(path);
  if (infoError || !metadata || typeof metadata.size !== 'number' || !Number.isSafeInteger(metadata.size) || metadata.size < 1 ||
      metadata.size > MAX_SELFIE_SIZE || metadata.contentType !== 'image/jpeg') return false;

  const { data: file, error: downloadError } = await storage.download(path);
  if (downloadError || !file) return false;
  const checked = validateUploadedBytes(
    new Uint8Array(await file.arrayBuffer()), path, file.type, ['.jpg'], MAX_SELFIE_SIZE
  );
  return !checked.error && Boolean(checked.data);
}

function deriveLocationEvidence(
  latitude: number | null,
  longitude: number | null,
  policy: AttendancePolicy,
  clientReason: unknown,
): { latitude: number | null; longitude: number | null; distanceMeters: number | null; status: LocationStatus; flagReason: string | null } {
  if (policy.remote)
    return { latitude, longitude, distanceMeters: null, status: 'not_applicable', flagReason: null };
  if (latitude === null || longitude === null) {
    const reason = typeof clientReason === 'string' ? clientReason.trim().slice(0, 500) : '';
    return { latitude: null, longitude: null, distanceMeters: null, status: 'location_unavailable', flagReason: reason || 'GPS location unavailable.' };
  }
  if (policy.geofenceEnabled && policy.latitude !== null && policy.longitude !== null) {
    const result = isWithinGeofence(latitude, longitude, policy.latitude, policy.longitude, policy.radiusMeters);
    if (!result.isWithin) {
      const reason = typeof clientReason === 'string' ? clientReason.trim().slice(0, 500) : '';
      return { latitude, longitude, distanceMeters: result.distanceMeters, status: 'flagged_out_of_bounds', flagReason: reason || 'Outside the designated workplace geofence.' };
    }
    return { latitude, longitude, distanceMeters: result.distanceMeters, status: 'verified', flagReason: null };
  }
  return { latitude, longitude, distanceMeters: null, status: 'verified', flagReason: null };
}

async function calculateLateStatus(
  supabase: MobileSupabaseClient,
  companyId: string,
  timeIn: string,
): Promise<'on_time' | 'late' | 'unknown'> {
  const localTime = getPhilippineClock(new Date(timeIn));
  const dayOfWeek = localTime.getUTCDay();
  if (dayOfWeek === 0 || dayOfWeek === 6) return 'unknown';
  const { data: schedule, error } = await supabase.from('work_schedules')
    .select('time_in_cutoff').eq('company_id', companyId).eq('day_of_week', dayOfWeek).maybeSingle();
  if (error || !schedule?.time_in_cutoff) return 'unknown';
  const [cutoffHour, cutoffMinute] = String(schedule.time_in_cutoff).split(':').map(Number);
  const seconds = localTime.getUTCHours() * 3600 + localTime.getUTCMinutes() * 60 + localTime.getUTCSeconds();
  return seconds > cutoffHour * 3600 + cutoffMinute * 60 ? 'late' : 'on_time';
}

export async function POST(request: Request) {
  const auth = await authenticateMobileStudent(request);
  if (auth.error) return mobileBffFailure(auth.error);
  const limitError = await authActionLimit('attendance_submit', auth.actor.user.id, 60, 3600, 'user');
  if (limitError) return mobileBffFailure({
    status: limitError.code === 'RATE_LIMITED' ? 429 : 503,
    code: limitError.code,
    message: limitError.message,
  });

  const parsed = await readLimitedJson(request, 16 * 1024);
  if (parsed.error === 'too_large')
    return mobileBffFailure({ status: 413, code: 'VALIDATION_FAILURE', message: 'Attendance request is too large.' });
  if (parsed.error)
    return mobileBffFailure({ status: 400, code: 'VALIDATION_FAILURE', message: 'Attendance request could not be read.' });
  const body = parsed.data;
  if (!body || typeof body !== 'object' || Array.isArray(body))
    return mobileBffFailure({ status: 400, code: 'VALIDATION_FAILURE', message: 'Invalid attendance request.' });

  const input = body as Record<string, unknown>;
  const service = getServiceClient();
  const studentId = auth.actor.studentId;
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
    if (isFuture(capturedAt)) return mobileBffFailure(FUTURE_FAILURE);
    if ([0, 6].includes(getPhilippineClock(new Date(capturedAt)).getUTCDay()))
      return mobileBffFailure({ status: 400, code: 'VALIDATION_FAILURE', message: 'Attendance is only recorded on weekdays.' });
    if (!await hasValidSelfie(service, selfiePath))
      return mobileBffFailure({ status: 400, code: 'VALIDATION_FAILURE', message: 'Upload a valid selfie before recording Time In.' });

    const policy = await loadAttendancePolicy(service, studentId, assignmentId, attendanceDate);
    if (policy === 'unavailable')
      return mobileBffFailure({ status: 503, code: 'SERVER_FAILURE', message: 'Could not verify the attendance location policy.' });
    if (!policy)
      return mobileBffFailure({ status: 403, code: 'FORBIDDEN', message: 'No company assignment covers this attendance date.' });
    const evidence = deriveLocationEvidence(latitude, longitude, policy, clientReason);
    const { data: existing, error: existingError } = await service.from('attendance')
      .select('attendance_id').eq('student_id', studentId).eq('attendance_date', attendanceDate).maybeSingle();
    if (existingError)
      return mobileBffFailure({ status: 503, code: 'SERVER_FAILURE', message: 'Could not check today\'s attendance.' });
    if (existing)
      return mobileBffFailure({ status: 409, code: 'DUPLICATE_REQUEST', message: 'You already have an attendance record for today.' });

    const lateStatus = await calculateLateStatus(auth.actor.supabase, policy.companyId, capturedAt);
    const receivedAt = new Date().toISOString();
    const { data: record, error } = await service.from('attendance').insert({
      student_id: studentId,
      assignment_id: assignmentId,
      attendance_date: attendanceDate,
      time_in: capturedAt,
      time_in_selfie_path: selfiePath,
      verification_status: 'pending',
      late_status: lateStatus,
      sync_status: 'synced',
      time_in_lat: evidence.latitude,
      time_in_lng: evidence.longitude,
      time_in_distance_meters: evidence.distanceMeters,
      time_in_location_status: evidence.status,
      time_in_flag_reason: evidence.flagReason,
      time_in_received_at: receivedAt,
      synced_at: receivedAt,
    }).select('attendance_id').single();
    if (error || !record)
      return mobileBffFailure({ status: 503, code: 'SERVER_FAILURE', message: 'Failed to record Time In.' });
    return Response.json({ data: { attendance_id: record.attendance_id }, error: null }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
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
    if (isFuture(capturedAt)) return mobileBffFailure(FUTURE_FAILURE);
    if (!await hasValidSelfie(service, selfiePath))
      return mobileBffFailure({ status: 400, code: 'VALIDATION_FAILURE', message: 'Upload a valid selfie before recording Time Out.' });

    let query = service.from('attendance').select('attendance_id, assignment_id, time_in, time_out, time_out_flag_reason, verification_status')
      .eq('student_id', studentId).eq('attendance_date', attendanceDate);
    if (typeof attendanceId === 'string' && !attendanceId.startsWith('offline_')) query = query.eq('attendance_id', attendanceId);
    const { data: record, error: lookupError } = await query.maybeSingle();
    if (lookupError || !record)
      return mobileBffFailure({ status: 404, code: 'NOT_FOUND', message: 'Record Time In before Time Out.' });
    const replacingAutoTimeOut = Boolean(record.time_out && record.verification_status === 'pending' &&
      record.time_out_flag_reason === AUTO_TIME_OUT_REASON);
    if (record.time_out && !replacingAutoTimeOut)
      return mobileBffFailure({ status: 409, code: 'DUPLICATE_REQUEST', message: 'Time Out has already been recorded for today.' });
    if (new Date(capturedAt).getTime() < new Date(record.time_in).getTime())
      return mobileBffFailure({ status: 400, code: 'VALIDATION_FAILURE', message: 'Time Out cannot be earlier than Time In.' });

    const policy = await loadAttendancePolicy(service, studentId, record.assignment_id, attendanceDate);
    if (!policy || policy === 'unavailable')
      return mobileBffFailure({ status: 503, code: 'SERVER_FAILURE', message: 'Could not verify the attendance location policy.' });
    const evidence = deriveLocationEvidence(latitude, longitude, policy, clientReason);
    const receivedAt = new Date().toISOString();
    let updateQuery = service.from('attendance').update({
      time_out: capturedAt,
      time_out_selfie_path: selfiePath,
      verification_status: 'pending',
      time_out_lat: evidence.latitude,
      time_out_lng: evidence.longitude,
      time_out_distance_meters: evidence.distanceMeters,
      time_out_location_status: evidence.status,
      time_out_flag_reason: replacingAutoTimeOut
        ? [evidence.flagReason, 'Offline Time Out replaced automatic time-out; review before crediting hours.'].filter(Boolean).join(' ')
        : evidence.flagReason,
      sync_status: 'synced',
      time_out_received_at: receivedAt,
      synced_at: receivedAt,
      updated_at: receivedAt,
    }).eq('student_id', studentId).eq('attendance_id', record.attendance_id);
    updateQuery = replacingAutoTimeOut
      ? updateQuery.eq('verification_status', 'pending').eq('time_out', record.time_out!)
        .eq('time_out_flag_reason', AUTO_TIME_OUT_REASON)
      : updateQuery.is('time_out', null);
    const { data: updated, error } = await updateQuery.select('attendance_id').maybeSingle();
    if (error || !updated)
      return mobileBffFailure({ status: 503, code: 'SERVER_FAILURE', message: 'Failed to record Time Out.' });
    return Response.json({ data: null, error: null }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
  }

  return mobileBffFailure({ status: 400, code: 'VALIDATION_FAILURE', message: 'Unknown attendance action.' });
}
