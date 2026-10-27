const PHILIPPINE_OFFSET_MS = 8 * 60 * 60 * 1000;
export const AUTO_TIME_OUT_REASON = 'Automatic time-out: no Time Out was recorded within 10 hours of Time In.';

/** Philippine civil time, independent of the device/server time zone. */
export function getPhilippineClock(date = new Date()): Date {
  return new Date(date.getTime() + PHILIPPINE_OFFSET_MS);
}

export function getAttendanceDate(date = new Date()): string {
  return getPhilippineClock(date).toISOString().slice(0, 10);
}
