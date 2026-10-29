export interface ExpectedEndInput {
  remainingHours: number;
  /** Hours the student works on a scheduled day (practicum_schedules.daily_hours). */
  dailyHours: number;
  /** 1=Mon … 6=Sat, as stored in practicum_schedules.work_days. */
  workDays: number[];
  /** YYYY-MM-DD dates with no work: global, department and company non_working_days merged by the caller. */
  nonWorkingDates: Iterable<string>;
  /** Hours up to and including this YYYY-MM-DD are already counted; counting resumes the next day. */
  asOfDate: string;
}

const MAX_DAYS = 1500;

/**
 * Projected last day of the practicum, or null when it cannot be projected.
 * Rendered hours are never reduced by holidays; non-working days only push the date out.
 */
export function expectedEndDate(input: ExpectedEndInput): string | null {
  const start = /^\d{4}-\d{2}-\d{2}$/.test(input.asOfDate) ? new Date(`${input.asOfDate}T00:00:00.000Z`) : null;
  if (!start || start.toISOString().slice(0, 10) !== input.asOfDate) return null;
  if (!Number.isFinite(input.remainingHours) || input.remainingHours < 0) return null;
  if (input.remainingHours === 0) return input.asOfDate;
  if (!Number.isFinite(input.dailyHours) || input.dailyHours <= 0 || input.dailyHours > 24) return null;
  const days = new Set(input.workDays);
  if (days.size === 0) return null;
  const off = new Set(input.nonWorkingDates);

  let remaining = input.remainingHours;
  const cursor = new Date(start);
  for (let i = 0; i < MAX_DAYS; i++) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    const iso = cursor.toISOString().slice(0, 10);
    if (!days.has(cursor.getUTCDay()) || off.has(iso)) continue;
    remaining -= input.dailyHours;
    if (remaining <= 0) return iso;
  }
  return null;
}
