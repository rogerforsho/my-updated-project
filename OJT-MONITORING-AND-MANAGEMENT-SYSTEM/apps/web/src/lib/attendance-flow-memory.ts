import { guardHolds, type AttendanceAdapter, type AttendanceRow } from './attendance-flow';
import type { AttendancePolicy } from './attendance-recording';

type Row = AttendanceRow & Record<string, unknown>;

/** In-memory AttendanceAdapter for tests. `beforeWrite` runs between the decision and the guarded write, to simulate a race. */
export class MemoryAttendanceAdapter implements AttendanceAdapter {
  rows: Row[];
  beforeWrite: (() => void) | null = null;
  private selfies: Set<string>;
  private policy: AttendancePolicy | 'unavailable' | null;
  private cutoff: string | null;

  constructor(opts: { selfies?: string[]; rows?: Row[]; policy?: AttendancePolicy | 'unavailable' | null; cutoff?: string | null } = {}) {
    this.selfies = new Set(opts.selfies ?? []);
    this.rows = opts.rows ?? [];
    this.policy = opts.policy === undefined
      ? { companyId: 'c', remote: false, geofenceEnabled: true, latitude: 14, longitude: 121, radiusMeters: 150 }
      : opts.policy;
    this.cutoff = opts.cutoff ?? null;
  }

  async hasValidSelfie(path: string) { return this.selfies.has(path); }
  async loadPolicy() { return this.policy; }
  async findByDate(studentId: string, date: string) {
    return this.rows.find(r => r.student_id === studentId && r.attendance_date === date) ?? null;
  }
  async lateCutoff() { return this.cutoff; }
  async insertTimeIn(row: Record<string, unknown>) {
    this.beforeWrite?.();
    const attendance_id = `mem-${this.rows.length + 1}`;
    this.rows.push({ ...row, attendance_id } as Row);
    return attendance_id;
  }
  async findForTimeOut(studentId: string, date: string, id: string | null) {
    const found = this.rows.find(r => r.student_id === studentId && r.attendance_date === date && (!id || r.attendance_id === id));
    return found ? { ...found } : null;
  }
  async writeTimeOut(studentId: string, record: AttendanceRow, patch: Record<string, unknown>, replacing: boolean) {
    this.beforeWrite?.();
    const current = this.rows.find(r => r.student_id === studentId && r.attendance_id === record.attendance_id);
    if (!current || !guardHolds(current, record, replacing)) return false;
    Object.assign(current, patch);
    return true;
  }
}
