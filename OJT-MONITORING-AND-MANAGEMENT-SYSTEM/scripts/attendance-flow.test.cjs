const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');

function load(relative, mocks = {}, cache = new Map()) {
  let filename = path.resolve(root, relative);
  if (!path.extname(filename)) filename += '.ts';
  if (cache.has(filename)) return cache.get(filename);
  const exports = {}; cache.set(filename, exports);
  const out = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: filename }).outputText;
  vm.runInNewContext(out, { exports, console, Date, process: { env: {} }, require(name) {
    if (mocks[name]) return mocks[name];
    if (name.startsWith('.')) return load(path.resolve(path.dirname(filename), name), mocks, cache);
    return require(name);
  } }, { filename });
  return exports;
}
const shared = { ...load('shared/attendanceDate.ts'), ...load('shared/geo.ts') };
const flow = load('apps/web/src/lib/attendance-flow.ts', { '@ojt/shared': shared });
const { MemoryAttendanceAdapter } = load('apps/web/src/lib/attendance-flow-memory.ts', { '@ojt/shared': shared });
const plain = o => JSON.parse(JSON.stringify(o));
const AUTO = shared.AUTO_TIME_OUT_REASON;
const NOW = new Date('2026-10-05T19:00:00+08:00').getTime();
const S = 's1';

const inInput = (o = {}) => ({ assignmentId: 'a1', attendanceDate: '2026-10-05', capturedAt: '2026-10-05T08:00:00+08:00',
  selfiePath: 's1/time_in_x.jpg', latitude: 14, longitude: 121, clientReason: null, ...o });
const outInput = (o = {}) => ({ attendanceId: null, attendanceDate: '2026-10-05', capturedAt: '2026-10-05T17:00:00+08:00',
  selfiePath: 's1/time_out_x.jpg', latitude: 14, longitude: 121, clientReason: null, ...o });
const mem = (o = {}) => new MemoryAttendanceAdapter({ selfies: ['s1/time_in_x.jpg', 's1/time_out_x.jpg'], ...o });
const autoRow = { attendance_id: 'r1', student_id: S, assignment_id: 'a1', attendance_date: '2026-10-05',
  time_in: '2026-10-05T08:00:00+08:00', time_out: '2026-10-05T18:00:00+08:00', verification_status: 'pending',
  time_out_flag_reason: AUTO };

test('time-in records a pending row with evidence and late status', async () => {
  const a = mem({ cutoff: '08:00:00' });
  const r = await flow.recordTimeIn(a, S, inInput({ capturedAt: '2026-10-05T08:30:00+08:00' }), NOW);
  assert.equal(r.ok, true);
  const row = a.rows[0];
  assert.equal(row.verification_status, 'pending'); assert.equal(row.late_status, 'late');
  assert.equal(row.time_in_location_status, 'verified'); assert.equal(row.sync_status, 'synced');
  assert.equal(r.attendanceId, row.attendance_id);
});

test('time-in refusals: future, weekend, bad selfie, no assignment, policy down, duplicate', async () => {
  const code = async (a, i) => { const r = await flow.recordTimeIn(a, S, i, NOW); return [r.failure.status, r.failure.code]; };
  assert.deepEqual(await code(mem(), inInput({ capturedAt: '2026-10-05T19:30:00+08:00' })), [400, 'VALIDATION_FAILURE']);
  assert.deepEqual(await code(mem(), inInput({ capturedAt: '2026-10-04T08:00:00+08:00', attendanceDate: '2026-10-04' })), [400, 'VALIDATION_FAILURE']);
  assert.deepEqual(await code(mem({ selfies: [] }), inInput()), [400, 'VALIDATION_FAILURE']);
  assert.deepEqual(await code(mem({ policy: null }), inInput()), [403, 'FORBIDDEN']);
  assert.deepEqual(await code(mem({ policy: 'unavailable' }), inInput()), [503, 'SERVER_FAILURE']);
  const dup = mem({ rows: [{ ...autoRow, time_out: null, time_out_flag_reason: null }] });
  assert.deepEqual(await code(dup, inInput()), [409, 'DUPLICATE_REQUEST']);
});

test('time-in outside the geofence is recorded but flagged for review', async () => {
  const a = mem();
  await flow.recordTimeIn(a, S, inInput({ latitude: 15, longitude: 121 }), NOW);
  assert.equal(a.rows[0].time_in_location_status, 'flagged_out_of_bounds');
});

const open = { ...autoRow, time_out: null, time_out_flag_reason: null, verification_status: 'pending' };

test('time-out closes an open record and stays pending', async () => {
  const a = mem({ rows: [{ ...open }] });
  assert.deepEqual(plain(await flow.recordTimeOut(a, S, outInput(), NOW)), { ok: true });
  assert.equal(a.rows[0].time_out, '2026-10-05T17:00:00+08:00');
  assert.equal(a.rows[0].verification_status, 'pending');
});

test('time-out refusals: no time-in, earlier than time-in, already closed, bad selfie, policy gone', async () => {
  const st = async (a, i = outInput()) => (await flow.recordTimeOut(a, S, i, NOW)).failure.status;
  assert.equal(await st(mem()), 404);
  assert.equal(await st(mem({ rows: [{ ...open }] }), outInput({ capturedAt: '2026-10-05T07:00:00+08:00' })), 400);
  assert.equal(await st(mem({ rows: [{ ...open, time_out: '2026-10-05T16:00:00+08:00', verification_status: 'approved' }] })), 409);
  assert.equal(await st(mem({ rows: [{ ...open }], selfies: [] })), 400);
  assert.equal(await st(mem({ rows: [{ ...open }], policy: 'unavailable' })), 503);
});

test('an offline_ attendance id falls back to the date lookup', async () => {
  const a = mem({ rows: [{ ...open }] });
  assert.equal((await flow.recordTimeOut(a, S, outInput({ attendanceId: 'offline_pending' }), NOW)).ok, true);
});

test('time-out replaces a pending automatic time-out and flags it for review', async () => {
  const a = mem({ rows: [{ ...autoRow }] });
  assert.equal((await flow.recordTimeOut(a, S, outInput(), NOW)).ok, true);
  const row = a.rows[0];
  assert.equal(row.time_out, '2026-10-05T17:00:00+08:00');
  assert.match(row.time_out_flag_reason, /replaced automatic time-out/);
  assert.equal(row.verification_status, 'pending');
});

test('an auto time-out already verified or reworded is not replaceable', async () => {
  for (const patch of [{ verification_status: 'approved' }, { time_out_flag_reason: 'Manual note' }]) {
    const a = mem({ rows: [{ ...autoRow, ...patch }] });
    assert.equal((await flow.recordTimeOut(a, S, outInput(), NOW)).failure.status, 409);
  }
});

test('race: a Supervisor verifies the auto time-out after lookup; the replacement is refused and nothing is overwritten', async () => {
  const a = mem({ rows: [{ ...autoRow }] });
  a.beforeWrite = () => { a.rows[0].verification_status = 'approved'; };
  const r = await flow.recordTimeOut(a, S, outInput(), NOW);
  assert.equal(r.failure.status, 503);
  assert.equal(a.rows[0].time_out, '2026-10-05T18:00:00+08:00');
});

test('race: the auto time-out cron closes the record after lookup; a normal time-out is refused', async () => {
  const a = mem({ rows: [{ ...open }] });
  a.beforeWrite = () => { Object.assign(a.rows[0], { time_out: '2026-10-05T18:00:00+08:00', time_out_flag_reason: AUTO }); };
  const r = await flow.recordTimeOut(a, S, outInput(), NOW);
  assert.equal(r.failure.status, 503);
  assert.equal(a.rows[0].time_out_flag_reason, AUTO);
});

test('race: a second device replaces the auto time-out first; this one is refused', async () => {
  const a = mem({ rows: [{ ...autoRow }] });
  a.beforeWrite = () => { Object.assign(a.rows[0], { time_out: '2026-10-05T16:30:00+08:00', time_out_flag_reason: null }); };
  assert.equal((await flow.recordTimeOut(a, S, outInput(), NOW)).failure.status, 503);
  assert.equal(a.rows[0].time_out, '2026-10-05T16:30:00+08:00');
});
