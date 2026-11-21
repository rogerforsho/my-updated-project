const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

function loadShared() {
  const exports = {};
  const output = ts.transpileModule(read('shared/attendanceDate.ts'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(output, { exports, Date });
  return exports;
}

const { OVERDUE_REVIEW_DAYS, daysPendingReview, isOverdueReview } = loadShared();
const DAY = 86_400_000;
const now = new Date('2026-11-16T08:00:00Z');
const ago = ms => new Date(now.getTime() - ms).toISOString();
const rec = (o = {}) => ({ verification_status: 'pending', time_out: ago(4 * DAY), time_out_received_at: ago(4 * DAY), updated_at: ago(0), ...o });

test('a pending record is overdue at exactly 3 days, not at 2 days 23 hours', () => {
  assert.equal(OVERDUE_REVIEW_DAYS, 3);
  assert.equal(isOverdueReview(rec({ time_out_received_at: ago(3 * DAY) }), now), true);
  assert.equal(isOverdueReview(rec({ time_out_received_at: ago(3 * DAY - 3_600_000) }), now), false);
});

test('only pending records can be overdue', () => {
  assert.equal(isOverdueReview(rec({ verification_status: 'verified' }), now), false);
  assert.equal(isOverdueReview(rec({ verification_status: 'rejected' }), now), false);
});

test('an open record (no Time Out yet) is never overdue', () => {
  assert.equal(daysPendingReview(rec({ time_out: null }), now), null);
  assert.equal(isOverdueReview(rec({ time_out: null }), now), false);
});

test('falls back to updated_at when the server receipt time is missing', () => {
  const old = rec({ time_out_received_at: null, updated_at: ago(5 * DAY) });
  assert.equal(daysPendingReview(old, now), 5);
  assert.equal(isOverdueReview(old, now), true);
  assert.equal(isOverdueReview(rec({ time_out_received_at: null, updated_at: ago(DAY) }), now), false);
});

test('daysPendingReview counts whole days', () => {
  assert.equal(daysPendingReview(rec({ time_out_received_at: ago(4 * DAY + 5 * 3_600_000) }), now), 4);
});

test('Attendance exceptions page offers the Overdue filter and shows the age', () => {
  const page = read('apps/web/app/(dashboard)/coordinator/attendance/ExceptionReview.tsx');
  assert.match(page, /value: 'overdue'/);
  assert.match(page, /OVERDUE_REVIEW_DAYS/);
  assert.match(page, /isOverdueReview\(record\)/);
  assert.match(page, /daysPendingReview\(record\)/);
  assert.match(page, /time_out_flag_reason/);
});

test('the coordinator list query narrows to pending, closed, 3+ days, oldest first', () => {
  const svc = read('apps/web/src/services/attendance.ts');
  const body = svc.slice(svc.indexOf('export async function listAttendanceForCoordinator'), svc.indexOf('export async function listOwnAttendance'));
  assert.match(body, /'overdue'/);
  assert.match(body, /OVERDUE_REVIEW_DAYS/);
  assert.match(body, /eq\('verification_status', 'pending'\)/);
  assert.match(body, /not\('time_out', 'is', null\)/);
  assert.match(body, /time_out_received_at\.lte\./);
  assert.match(body, /ascending: overdue/);
});
