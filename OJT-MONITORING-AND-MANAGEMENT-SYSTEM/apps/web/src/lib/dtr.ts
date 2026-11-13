// Daily Time Record (Civil Service Form 48 layout) built from timecard rows. Pure: no I/O, Manila time.

export interface DtrSchedule { dailyHours: number; lunchStart: string | null; lunchMinutes: number }
export interface DtrInputRow { date: string; time_in: string | null; time_out: string | null; hours: number | null; late: 'on_time' | 'late' | 'unknown' | 'absent' }
export interface DtrDay {
  day: number; weekday: string; weekend: boolean;
  amIn: string; amOut: string; pmIn: string; pmOut: string;
  underMinutes: number | null; status: string; hours: number | null;
}

const STATUS = { on_time: 'On time', late: 'Late', unknown: '', absent: 'Absent' } as const;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const manilaHm = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-GB', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', hour12: false });
const toMin = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));
const toHm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

export function buildDtrMonth(rows: DtrInputRow[], month: string, s: DtrSchedule) {
  const [y, m] = month.split('-').map(Number);
  const byDate = new Map(rows.map((r) => [r.date, r]));
  const lunchStart = s.lunchStart && s.lunchMinutes > 0 ? toMin(s.lunchStart) : null;
  const lunchEnd = lunchStart == null ? null : lunchStart + s.lunchMinutes;

  let totalUnderMinutes = 0;
  let totalHours = 0;
  const days: DtrDay[] = Array.from({ length: new Date(Date.UTC(y, m, 0)).getUTCDate() }, (_, i) => {
    const day = i + 1;
    const dow = new Date(Date.UTC(y, m - 1, day)).getUTCDay();
    const out: DtrDay = { day, weekday: WEEKDAYS[dow], weekend: dow === 0 || dow === 6, amIn: '', amOut: '', pmIn: '', pmOut: '', underMinutes: null, status: '', hours: null };
    const r = byDate.get(`${month}-${String(day).padStart(2, '0')}`);
    if (!r) return out;
    out.status = STATUS[r.late];
    out.hours = r.hours;
    if (r.hours) totalHours += r.hours;
    if (!r.time_in) return out;

    const tin = manilaHm(r.time_in);
    const tout = r.time_out ? manilaHm(r.time_out) : null;
    out.amIn = tin;
    if (tout) {
      if (lunchStart == null || lunchEnd == null) out.pmOut = tout;
      else if (toMin(tout) <= lunchStart) out.amOut = tout;
      else if (toMin(tout) < lunchEnd) { out.amOut = toHm(lunchStart); }
      else { out.amOut = toHm(lunchStart); out.pmIn = toHm(lunchEnd); out.pmOut = tout; }
    }
    // Undertime only when the day is complete (time-out and credited hours both known).
    if (tout && r.hours != null) {
      out.underMinutes = Math.max(0, Math.round(s.dailyHours * 60 - r.hours * 60));
      totalUnderMinutes += out.underMinutes;
    }
    return out;
  });
  return { days, totalUnderMinutes, totalHours: Math.round(totalHours * 100) / 100 };
}
