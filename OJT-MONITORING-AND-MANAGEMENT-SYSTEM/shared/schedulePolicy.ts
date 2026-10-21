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

export const MAX_DAILY_HOURS = 8;
export const MAX_WEEKLY_HOURS = 40;

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

/** Pure schedule rules shared by the web and mobile submission adapters. */
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
  if ((input.work_modality === 'remote' || input.work_modality === 'hybrid') && !input.end_date) {
    return { ok: false, message: 'Remote and hybrid schedules need an end date for coordinator review.' };
  }
  if (!Array.isArray(input.work_days) || input.work_days.length === 0) {
    return { ok: false, message: 'Please select at least one weekly work day.' };
  }
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
  if (startMin < 6 * 60 || endMin > 21 * 60) {
    return { ok: false, message: 'Practicum shifts must fall between 6:00 AM and 9:00 PM (graveyard/overnight shifts are prohibited per CHED CMO 104).' };
  }

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
