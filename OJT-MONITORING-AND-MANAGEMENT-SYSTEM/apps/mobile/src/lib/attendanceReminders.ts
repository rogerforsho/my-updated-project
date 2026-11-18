import * as Notifications from 'expo-notifications';
import {
  getAttendanceDate, nonWorkingDatesFor, planAttendanceReminders,
  type DbAttendance, type DbPracticumSchedule, type NonWorkingDayRow,
} from '@ojt/shared';
import { supabase } from './supabase';

const CHANNEL = 'attendance-reminders';
const DAYS_AHEAD = 7;

// Reminders also show while the app is open, so a student sitting in the app still sees them.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false,
  }),
});

// Refreshes run one at a time: two overlapping cancel-then-schedule passes would leave duplicates.
let queue: Promise<void> = Promise.resolve();

export function cancelAttendanceReminders(): Promise<void> {
  return Notifications.cancelAllScheduledNotificationsAsync().catch(() => {});
}

async function holidays(schedule: DbPracticumSchedule, online: boolean): Promise<Set<string>> {
  if (!online) return new Set(); // shortcut: offline re-plans ignore holidays, so one may remind on a day off until the next online open
  const to = getAttendanceDate(new Date(Date.now() + (DAYS_AHEAD + 1) * 86_400_000));
  const { data, error } = await supabase.from('non_working_days').select('day_date, scope, department, company_id')
    .gte('day_date', getAttendanceDate()).lte('day_date', to);
  if (error) return new Set();
  // shortcut: department-scoped days are skipped (the student's department is not cached on the phone).
  return nonWorkingDatesFor((data ?? []) as NonWorkingDayRow[], null, schedule.company_id ? [schedule.company_id] : []);
}

async function replan(schedule: DbPracticumSchedule, todayRecord: DbAttendance | null, online: boolean) {
  let perm = await Notifications.getPermissionsAsync();
  if (!perm.granted && perm.canAskAgain) perm = await Notifications.requestPermissionsAsync();
  if (!perm.granted) return;

  await Notifications.setNotificationChannelAsync(CHANNEL, {
    name: 'Attendance reminders', importance: Notifications.AndroidImportance.HIGH,
  });
  const reminders = planAttendanceReminders({
    schedule, todayRecord, nonWorkingDates: await holidays(schedule, online), days: DAYS_AHEAD,
  });
  await cancelAttendanceReminders();
  for (const r of reminders) {
    await Notifications.scheduleNotificationAsync({
      content: { title: r.title, body: r.body },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: r.at, channelId: CHANNEL },
    });
  }
}

/** Re-plans the phone's time-in / late / time-out reminders. Never throws: a reminder must not break attendance. */
export function refreshAttendanceReminders(schedule: DbPracticumSchedule, todayRecord: DbAttendance | null, online: boolean): Promise<void> {
  queue = queue.then(() => replan(schedule, todayRecord, online)).catch(() => {});
  return queue;
}
