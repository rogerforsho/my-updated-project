import { AUTO_TIME_OUT_REASON, getPhilippineClock, isWithinGeofence } from '@ojt/shared';

// Pure attendance-recording decisions for /api/mobile/attendance. No I/O, so node --test can load it.

export type LocationStatus = 'verified' | 'flagged_out_of_bounds' | 'location_unavailable' | 'not_applicable';
export type AttendancePolicy = {
  companyId: string;
  remote: boolean;
  geofenceEnabled: boolean;
  latitude: number | null;
  longitude: number | null;
  radiusMeters: number;
};
export type Failure = { status: number; code: string; message: string };

// Small allowance for device/server clock drift; anything later is a future-dated entry.
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

export function deriveLocationEvidence(
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

/** Late status from the company's cutoff ("HH:MM[:SS]") for the Philippine weekday of timeIn. */
export function lateStatusFor(timeIn: string, cutoff: string | null | undefined): 'on_time' | 'late' | 'unknown' {
  const localTime = getPhilippineClock(new Date(timeIn));
  const dayOfWeek = localTime.getUTCDay();
  if (dayOfWeek === 0 || dayOfWeek === 6 || !cutoff) return 'unknown';
  const [cutoffHour, cutoffMinute] = String(cutoff).split(':').map(Number);
  const seconds = localTime.getUTCHours() * 3600 + localTime.getUTCMinutes() * 60 + localTime.getUTCSeconds();
  return seconds > cutoffHour * 3600 + cutoffMinute * 60 ? 'late' : 'on_time';
}

/** Future-dated entries are always refused; time-in is also weekday-only. */
export function captureTimeFailure(capturedAt: string, nowMs: number, weekdaysOnly: boolean): Failure | null {
  if (new Date(capturedAt).getTime() > nowMs + MAX_CLOCK_SKEW_MS)
    return { status: 400, code: 'VALIDATION_FAILURE', message: 'Attendance cannot be recorded for a future date or time.' };
  if (weekdaysOnly && [0, 6].includes(getPhilippineClock(new Date(capturedAt)).getUTCDay()))
    return { status: 400, code: 'VALIDATION_FAILURE', message: 'Attendance is only recorded on weekdays.' };
  return null;
}

/** Whether a time-out may be written over this record; an automatic time-out may be replaced, nothing else. */
export function timeOutDecision(
  record: { time_in: string; time_out?: string | null; verification_status?: string | null; time_out_flag_reason?: string | null },
  capturedAt: string,
): { failure: Failure } | { replacingAutoTimeOut: boolean } {
  const replacingAutoTimeOut = Boolean(record.time_out && record.verification_status === 'pending' &&
    record.time_out_flag_reason === AUTO_TIME_OUT_REASON);
  if (record.time_out && !replacingAutoTimeOut)
    return { failure: { status: 409, code: 'DUPLICATE_REQUEST', message: 'Time Out has already been recorded for today.' } };
  if (new Date(capturedAt).getTime() < new Date(record.time_in).getTime())
    return { failure: { status: 400, code: 'VALIDATION_FAILURE', message: 'Time Out cannot be earlier than Time In.' } };
  return { replacingAutoTimeOut };
}
