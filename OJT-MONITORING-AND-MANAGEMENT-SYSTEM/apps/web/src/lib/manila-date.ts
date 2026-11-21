// Attendance dates are Asia/Manila calendar days, so date presets must not follow the browser's timezone.
export const isoDate = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });

export type DatePreset = 'today' | 'week' | 'month' | 'all';

/** [from, to] as YYYY-MM-DD in Manila time; empty strings mean "all dates". */
export function presetRange(kind: DatePreset, now = new Date()): [string, string] {
  const today = isoDate(now);
  if (kind === 'all') return ['', ''];
  if (kind === 'today') return [today, today];
  // Manila has no daylight saving, so 24h steps are exact.
  if (kind === 'week') return [isoDate(new Date(now.getTime() - 6 * 86_400_000)), today];
  return [`${today.slice(0, 8)}01`, today];
}
