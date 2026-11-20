import type { DbAttendance } from '@ojt/shared';

const colors = { late: '#dc2626', ok: '#0A3824', muted: '#64748b' };

// "08:00:00" -> "8:00 AM"
function clock12(hms: string): string {
  const [h, m] = hms.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

/** What the Punctuality row says. Never a bare "unknown": every case names what happened. */
export function punctuality(
  record: Pick<DbAttendance, 'late_status' | 'sync_status'>,
  scheduleTimeIn?: string | null,
): { text: string; color: string } {
  const starts = scheduleTimeIn ? ` (starts ${clock12(scheduleTimeIn)})` : '';
  switch (record.late_status) {
    case 'on_time': return { text: `On time${starts}`, color: colors.ok };
    case 'late': return { text: `Late${starts}`, color: colors.late };
    case 'not_work_day': return { text: 'Not a scheduled work day', color: colors.muted };
    case 'no_schedule': return { text: 'No approved schedule yet', color: colors.muted };
    default:
      return record.sync_status === 'pending_sync'
        ? { text: 'Checked once it syncs', color: colors.muted }
        : { text: 'Not rated', color: colors.muted };
  }
}
