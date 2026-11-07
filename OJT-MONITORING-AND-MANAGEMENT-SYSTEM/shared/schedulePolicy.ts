export interface SchedulePolicyInput {
  work_days: number[];
  time_in: string;
  time_out: string;
  lunch_break_minutes?: number | null;
  lunch_break_start?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  work_modality?: 'on_site' | 'hybrid' | 'remote';
}

export interface ValidatedSchedulePolicy {
  lunch_break_minutes: number;
  lunch_break_start: string | null;
  daily_hours: number;
  weekly_hours: number;
}

export type SchedulePolicyResult =
  | { ok: true; value: ValidatedSchedulePolicy }
  | { ok: false; message: string };

// Regulatory caps on a Practicum Schedule (CHED CMO 104, as cited in the user-facing errors below).
// Daily hours are net of lunch, so a 9-hour shift with a 1-hour lunch is exactly at the limit.
export const MAX_DAILY_HOURS = 8;
export const MAX_WEEKLY_HOURS = 40;
/** A practicum may last at most this many calendar months (CHED CMO 104 / SIPP). Mirrors enforce_practicum_window() in the database. */
export const MAX_PRACTICUM_MONTHS = 5;

/** The date `months` after `isoDate`, clamped to the last day of that month (Aug 31 + 5 months = Jan 31, Sep 30 + 5 = Feb 28). */
export function addMonthsClamped(isoDate: string, months: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const target = m - 1 + months;
  const year = y + Math.floor(target / 12);
  const month = ((target % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(Math.min(d, lastDay)).padStart(2, '0')}`;
}

/** Error text when the practicum window is missing or longer than the cap; null when it is fine. Dates are already valid YYYY-MM-DD. */
export function practicumWindowError(startDate: string, endDate: string | null | undefined): string | null {
  if (!endDate) return `Enter the practicum end date. A practicum can last at most ${MAX_PRACTICUM_MONTHS} months.`;
  const latest = addMonthsClamped(startDate, MAX_PRACTICUM_MONTHS);
  if (endDate > latest) {
    return `A practicum can last at most ${MAX_PRACTICUM_MONTHS} months. For a ${startDate} start, the latest end date is ${latest}.`;
  }
  return null;
}

/**
 * Can the schedule reach the required hours inside the window? Counts scheduled weekdays from start to end;
 * holidays are not known here, so this is a lenient check (it never rejects a schedule that could finish).
 */
export function validateScheduleFeasibility(input: {
  start_date: string; end_date: string; work_days: number[]; daily_hours: number; required_hours: number;
}): { ok: true } | { ok: false; message: string } {
  const cursor = new Date(`${input.start_date}T00:00:00.000Z`);
  const end = new Date(`${input.end_date}T00:00:00.000Z`);
  let days = 0;
  for (; cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    if (input.work_days.includes(cursor.getUTCDay())) days++;
  }
  const hours = Math.round(days * input.daily_hours * 100) / 100;
  if (hours < input.required_hours) {
    return {
      ok: false,
      message: `This schedule gives about ${hours} hours between ${input.start_date} and ${input.end_date}, but ${input.required_hours} hours are required. Add work days or lengthen the shift (up to ${MAX_DAILY_HOURS} hours a day) so the hours fit within ${MAX_PRACTICUM_MONTHS} months.`,
    };
  }
  return { ok: true };
}

function parseTimeToMinutes(value: string): number {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) return NaN;
  return Number(match[1]) * 60 + Number(match[2]);
}

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/**
 * Pure Practicum Schedule rules shared by the web and mobile submission adapters (ADR 0001).
 * No I/O: callers own the Supabase reads/writes and only pass the proposed schedule in.
 * Returns the first rule broken, not all of them, so the UI shows one fix at a time.
 */
export function validateSchedulePolicy(input: SchedulePolicyInput): SchedulePolicyResult {
  if (!input.start_date || !isCalendarDate(input.start_date)) {
    return { ok: false, message: 'Enter a valid practicum start date.' };
  }
  if (input.end_date && !isCalendarDate(input.end_date)) {
    return { ok: false, message: 'Enter a valid practicum end date.' };
  }
  if (input.end_date && input.end_date < input.start_date) {
    return { ok: false, message: 'Practicum end date must be on or after the start date.' };
  }
  const windowError = practicumWindowError(input.start_date, input.end_date);
  if (windowError) return { ok: false, message: windowError };
  if (!Array.isArray(input.work_days) || input.work_days.length === 0) {
    return { ok: false, message: 'Please select at least one weekly work day.' };
  }
  // Work days are 1 = Monday ... 6 = Saturday. Sunday (0 or 7) is deliberately not a valid practicum day.
  if (input.work_days.some(day => !Number.isInteger(day) || day < 1 || day > 6) ||
      new Set(input.work_days).size !== input.work_days.length) {
    return { ok: false, message: 'Select valid work days from Monday through Saturday.' };
  }

  const startMin = parseTimeToMinutes(input.time_in);
  const endMin = parseTimeToMinutes(input.time_out);
  if (!Number.isFinite(startMin) || !Number.isFinite(endMin)) {
    return { ok: false, message: 'Enter valid Time In and Time Out values.' };
  }
  if (startMin >= endMin) return { ok: false, message: 'Time In must be earlier than Time Out.' };
  // Same-day shifts only, inside 06:00-21:00: overnight/graveyard shifts are prohibited for students.
  if (startMin < 6 * 60 || endMin > 21 * 60) {
    return { ok: false, message: 'Practicum shifts must fall between 6:00 AM and 9:00 PM (graveyard/overnight shifts are prohibited per CHED CMO 104).' };
  }

  // An omitted lunch duration defaults to 60 minutes, but a positive lunch needs an explicit start time:
  // the start is what Credited Hours later subtracts from attendance, so we never guess it (ADR 0001).
  const lunchMinutes = input.lunch_break_minutes ?? 60;
  const providedLunchStart = input.lunch_break_start?.trim() || null;
  if (!Number.isInteger(lunchMinutes) || lunchMinutes < 0 || lunchMinutes > 120) {
    return { ok: false, message: 'Lunch duration must be between 0 and 120 minutes.' };
  }
  if (lunchMinutes > 0) {
    const lunchStartMin = providedLunchStart ? parseTimeToMinutes(providedLunchStart) : NaN;
    if (!Number.isFinite(lunchStartMin) || lunchStartMin < startMin || lunchStartMin + lunchMinutes > endMin) {
      return { ok: false, message: 'Enter a valid lunch interval inside the scheduled shift.' };
    }
  } else if (providedLunchStart) {
    return { ok: false, message: 'A lunch start time is not allowed when lunch duration is zero.' };
  }

  const dailyHours = Math.round((((endMin - startMin - lunchMinutes) / 60) * 100)) / 100;
  if (dailyHours <= 0) {
    return { ok: false, message: 'Shift duration must be greater than lunch break duration.' };
  }
  if (dailyHours > MAX_DAILY_HOURS) {
    return { ok: false, message: `Calculated daily shift is ${dailyHours} hours. Maximum allowable work duration is ${MAX_DAILY_HOURS.toFixed(1)} hours per day per CHED CMO 104 guidelines.` };
  }
  const weeklyHours = Math.round(dailyHours * input.work_days.length * 100) / 100;
  if (weeklyHours > MAX_WEEKLY_HOURS) {
    return { ok: false, message: `Calculated weekly commitment is ${weeklyHours} hours across ${input.work_days.length} days. Maximum allowable work duration is ${MAX_WEEKLY_HOURS.toFixed(1)} hours per week per CHED CMO 104 guidelines.` };
  }

  return {
    ok: true,
    value: {
      lunch_break_minutes: lunchMinutes,
      lunch_break_start: lunchMinutes > 0 ? providedLunchStart : null,
      daily_hours: dailyHours,
      weekly_hours: weeklyHours,
    },
  };
}
