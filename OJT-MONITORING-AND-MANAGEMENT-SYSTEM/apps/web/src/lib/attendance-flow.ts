import { getPhilippineClock, isReplaceableAutoTimeOut } from '@ojt/shared';
import {
  captureTimeFailure, deriveLocationEvidence, lateStatusFor, timeOutDecision,
  type AttendancePolicy, type Failure,
} from './attendance-recording';

// The whole time_in / time_out flow: load policy, check selfie evidence, decide, write.
// I/O sits behind AttendanceAdapter (Supabase+storage in attendance-flow-supabase.ts, in-memory for tests).
// Adapter methods throw on infrastructure errors; the flow maps them to 503.

export type AttendanceRow = {
  attendance_id: string; assignment_id: string; time_in: string; time_out?: string | null;
  verification_status?: string | null; time_out_flag_reason?: string | null;
};

export interface AttendanceAdapter {
  hasValidSelfie(path: string): Promise<boolean>;
  /** null: no assignment covers the date. */
  loadPolicy(studentId: string, assignmentId: string, attendanceDate: string): Promise<AttendancePolicy | 'unavailable' | null>;
  findByDate(studentId: string, attendanceDate: string): Promise<{ attendance_id: string } | null>;
  /** Cutoff "HH:MM[:SS]" for the company on that Philippine weekday; null when unknown. */
  lateCutoff(companyId: string, dayOfWeek: number): Promise<string | null>;
  insertTimeIn(row: Record<string, unknown>): Promise<string | null>;
  findForTimeOut(studentId: string, attendanceDate: string, attendanceId: string | null): Promise<AttendanceRow | null>;
  /** Guarded write: applies only if the record is still open (or, when replacing, still the same replaceable auto time-out). */
  writeTimeOut(studentId: string, record: AttendanceRow, patch: Record<string, unknown>, replacing: boolean): Promise<boolean>;
}

export type Evidence = { latitude: number | null; longitude: number | null; clientReason: unknown };
export type TimeInInput = Evidence & { assignmentId: string; attendanceDate: string; capturedAt: string; selfiePath: string };
export type TimeOutInput = Evidence & { attendanceId: string | null; attendanceDate: string; capturedAt: string; selfiePath: string };
export type FlowResult<T = object> = ({ ok: true } & T) | { failure: Failure };

const fail = (status: number, code: string, message: string): { failure: Failure } => ({ failure: { status, code, message } });

export async function recordTimeIn(
  adapter: AttendanceAdapter, studentId: string, input: TimeInInput, nowMs: number,
): Promise<FlowResult<{ attendanceId: string }>> {
  const timeFailure = captureTimeFailure(input.capturedAt, nowMs, true);
  if (timeFailure) return { failure: timeFailure };
  if (!await adapter.hasValidSelfie(input.selfiePath))
    return fail(400, 'VALIDATION_FAILURE', 'Upload a valid selfie before recording Time In.');

  const policy = await adapter.loadPolicy(studentId, input.assignmentId, input.attendanceDate);
  if (policy === 'unavailable') return fail(503, 'SERVER_FAILURE', 'Could not verify the attendance location policy.');
  if (!policy) return fail(403, 'FORBIDDEN', 'No company assignment covers this attendance date.');
  const evidence = deriveLocationEvidence(input.latitude, input.longitude, policy, input.clientReason);

  let existing;
  try { existing = await adapter.findByDate(studentId, input.attendanceDate); }
  catch { return fail(503, 'SERVER_FAILURE', 'Could not check today\'s attendance.'); }
  if (existing) return fail(409, 'DUPLICATE_REQUEST', 'You already have an attendance record for today.');

  const cutoff = await adapter.lateCutoff(policy.companyId, getPhilippineClock(new Date(input.capturedAt)).getUTCDay()).catch(() => null);
  const receivedAt = new Date().toISOString();
  let id: string | null = null;
  try {
    id = await adapter.insertTimeIn({
      student_id: studentId,
      assignment_id: input.assignmentId,
      attendance_date: input.attendanceDate,
      time_in: input.capturedAt,
      time_in_selfie_path: input.selfiePath,
      verification_status: 'pending',
      late_status: lateStatusFor(input.capturedAt, cutoff),
      sync_status: 'synced',
      time_in_lat: evidence.latitude,
      time_in_lng: evidence.longitude,
      time_in_distance_meters: evidence.distanceMeters,
      time_in_location_status: evidence.status,
      time_in_flag_reason: evidence.flagReason,
      time_in_received_at: receivedAt,
      synced_at: receivedAt,
    });
  } catch { /* falls through to the failure below */ }
  return id ? { ok: true, attendanceId: id } : fail(503, 'SERVER_FAILURE', 'Failed to record Time In.');
}

export async function recordTimeOut(
  adapter: AttendanceAdapter, studentId: string, input: TimeOutInput, nowMs: number,
): Promise<FlowResult> {
  const timeFailure = captureTimeFailure(input.capturedAt, nowMs, false);
  if (timeFailure) return { failure: timeFailure };
  if (!await adapter.hasValidSelfie(input.selfiePath))
    return fail(400, 'VALIDATION_FAILURE', 'Upload a valid selfie before recording Time Out.');

  // Offline-queued ids are not real record ids; look those up by date.
  const id = input.attendanceId && !input.attendanceId.startsWith('offline_') ? input.attendanceId : null;
  let record: AttendanceRow | null = null;
  try { record = await adapter.findForTimeOut(studentId, input.attendanceDate, id); } catch { /* treated as not found */ }
  if (!record) return fail(404, 'NOT_FOUND', 'Record Time In before Time Out.');
  const decision = timeOutDecision(record, input.capturedAt);
  if ('failure' in decision) return decision;
  const { replacingAutoTimeOut } = decision;

  const policy = await adapter.loadPolicy(studentId, record.assignment_id, input.attendanceDate);
  if (!policy || policy === 'unavailable') return fail(503, 'SERVER_FAILURE', 'Could not verify the attendance location policy.');
  const evidence = deriveLocationEvidence(input.latitude, input.longitude, policy, input.clientReason);
  const receivedAt = new Date().toISOString();
  let written = false;
  try {
    written = await adapter.writeTimeOut(studentId, record, {
      time_out: input.capturedAt,
      time_out_selfie_path: input.selfiePath,
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
    }, replacingAutoTimeOut);
  } catch { /* falls through to the failure below */ }
  return written ? { ok: true } : fail(503, 'SERVER_FAILURE', 'Failed to record Time Out.');
}

/** True when the stored record still matches what the guarded write expects. Shared by in-memory adapter and tests of the guard. */
export function guardHolds(current: AttendanceRow, expected: AttendanceRow, replacing: boolean): boolean {
  return replacing
    ? isReplaceableAutoTimeOut(current) && current.time_out === expected.time_out
    : current.time_out == null;
}
