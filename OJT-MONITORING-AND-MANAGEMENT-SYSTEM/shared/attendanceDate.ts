const PHILIPPINE_OFFSET_MS = 8 * 60 * 60 * 1000;
export const AUTO_TIME_OUT_REASON = 'Automatic time-out: no Time Out was recorded within 10 hours of Time In.';

/** Philippine civil time, independent of the device/server time zone. */
export function getPhilippineClock(date = new Date()): Date {
  return new Date(date.getTime() + PHILIPPINE_OFFSET_MS);
}

export function getAttendanceDate(date = new Date()): string {
  return getPhilippineClock(date).toISOString().slice(0, 10);
}

/** The one rule for "an automatic time-out may be replaced": still pending and carrying the auto reason. Nothing else is replaceable. */
export function isReplaceableAutoTimeOut(
  record: { time_out?: string | null; verification_status?: string | null; time_out_flag_reason?: string | null },
): boolean {
  return Boolean(record.time_out && record.verification_status === 'pending' &&
    record.time_out_flag_reason === AUTO_TIME_OUT_REASON);
}
