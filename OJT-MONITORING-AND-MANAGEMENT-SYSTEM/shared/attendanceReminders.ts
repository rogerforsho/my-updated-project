export type AttendanceReminderKind = 'time_in_soon' | 'late' | 'time_out';

export interface AttendanceReminder {
  at: Date;
  kind: AttendanceReminderKind;
  title: string;
  body: string;
}

export interface AttendanceReminderInput {
  /** Only an approved Practicum Schedule produces reminders. */
  schedule: {
    status: string;
    work_days: number[];
    time_in: string;
    time_out: string;
    start_date: string;
    end_date?: string | null;
  } | null;
  /** Today's attendance (Manila date), or null when the student has not timed in. */
  todayRecord: { time_in: string | null; time_out: string | null } | null;
  /** YYYY-MM-DD dates with no work (holidays); callers merge global and company days. */
  nonWorkingDates: Iterable<string>;
  now?: Date;
  /** How many days ahead to plan, today included. */
  days?: number;
}

export const TIME_IN_SOON_MINUTES = 10;
export const LATE_AFTER_MINUTES = 15;

const MANILA_OFFSET_MS = 8 * 3600 * 1000;
const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 3600 * 1000;

/** The instant a "HH:MM[:SS]" wall-clock time happens on a Manila calendar date. */
function manilaInstant(date: string, time: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  const [h, min] = time.split(':').map(Number);
  return new Date(Date.UTC(y, m - 1, d, h, min) - MANILA_OFFSET_MS);
}

function clock12(time: string): string {
  const [h, m] = time.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

/**
 * Reminders the phone should hold for the next few days.
 * Every day gets "time in soon" and "late"; "time out" is planned for today only, once the student has timed in
 * (the app re-plans right after a time-in, so tomorrow's time-out reminder is never needed in advance).
 * Today's reminders the student has already satisfied are left out. Past reminders are never returned.
 */
export function planAttendanceReminders(input: AttendanceReminderInput): AttendanceReminder[] {
  const { schedule } = input;
  if (!schedule || schedule.status !== 'approved') return [];
  const now = input.now ?? new Date();
  const off = new Set(input.nonWorkingDates);
  const today = new Date(now.getTime() + MANILA_OFFSET_MS).toISOString().slice(0, 10);
  const timedIn = Boolean(input.todayRecord?.time_in);
  const timedOut = Boolean(input.todayRecord?.time_out);
  const out: AttendanceReminder[] = [];

  for (let i = 0; i < (input.days ?? 7); i++) {
    const date = new Date(Date.parse(`${today}T00:00:00.000Z`) + i * DAY_MS).toISOString().slice(0, 10);
    if (date < schedule.start_date || (schedule.end_date && date > schedule.end_date)) continue;
    if (!schedule.work_days.includes(new Date(`${date}T00:00:00.000Z`).getUTCDay()) || off.has(date)) continue;

    const isToday = i === 0;
    const start = manilaInstant(date, schedule.time_in);
    if (!(isToday && timedIn)) {
      out.push({
        at: new Date(start.getTime() - TIME_IN_SOON_MINUTES * MINUTE_MS), kind: 'time_in_soon',
        title: 'Time in soon', body: `Your shift starts at ${clock12(schedule.time_in)}. Time in when you arrive.`,
      });
      out.push({
        at: new Date(start.getTime() + LATE_AFTER_MINUTES * MINUTE_MS), kind: 'late',
        title: "You're late", body: `You haven't timed in yet. Your shift started at ${clock12(schedule.time_in)}.`,
      });
    }
    if (isToday && timedIn && !timedOut) {
      out.push({
        at: manilaInstant(date, schedule.time_out), kind: 'time_out',
        title: 'Time out', body: `Your shift ends at ${clock12(schedule.time_out)}. Remember to time out.`,
      });
    }
  }
  return out.filter((r) => r.at.getTime() > now.getTime());
}
