const PHILIPPINE_OFFSET_MS = 8 * 60 * 60 * 1000;
export const AUTO_TIME_OUT_REASON = 'Automatic time-out: no Time Out was recorded within 10 hours of Time In.';

/** Philippine civil time, independent of the device/server time zone. */
export function getPhilippineClock(date = new Date()): Date {
  return new Date(date.getTime() + PHILIPPINE_OFFSET_MS);
}

export function getAttendanceDate(date = new Date()): string {
  return getPhilippineClock(date).toISOString().slice(0, 10);
}

/** A pending record this many whole days old is an Overdue Attendance Review the Coordinator may adjudicate. */
export const OVERDUE_REVIEW_DAYS = 3;

/** Whole days a closed, still-pending record has waited since the server received its Time Out; null otherwise. */
export function daysPendingReview(
  record: { verification_status?: string | null; time_out?: string | null; time_out_received_at?: string | null; updated_at?: string | null },
  now = new Date(),
): number | null {
  if (record.verification_status !== 'pending' || !record.time_out) return null;
  // shortcut: updated_at moves on edits, so rows without a receipt time may look newer than they are; fine for pre-receipt-column rows.
  const since = record.time_out_received_at ?? record.updated_at;
  if (!since) return null;
  return Math.max(0, Math.floor((now.getTime() - new Date(since).getTime()) / 86_400_000));
}

export function isOverdueReview(record: Parameters<typeof daysPendingReview>[0], now = new Date()): boolean {
  const days = daysPendingReview(record, now);
  return days !== null && days >= OVERDUE_REVIEW_DAYS;
}

/** The one rule for "an automatic time-out may be replaced": still pending and carrying the auto reason. Nothing else is replaceable. */
export function isReplaceableAutoTimeOut(
  record: { time_out?: string | null; verification_status?: string | null; time_out_flag_reason?: string | null },
): boolean {
  return Boolean(record.time_out && record.verification_status === 'pending' &&
    record.time_out_flag_reason === AUTO_TIME_OUT_REASON);
}
