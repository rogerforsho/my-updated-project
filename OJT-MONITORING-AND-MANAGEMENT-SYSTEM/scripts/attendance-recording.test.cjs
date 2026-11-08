const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');

// Runs the real mobile attendance service with only device/backend edges faked.
function loader(mocks) {
  const modules = new Map();
  function load(relative) {
    let filename = path.resolve(root, relative);
    if (!path.extname(filename)) filename += '.ts';
    if (mocks[filename]) return mocks[filename];
    if (modules.has(filename)) return modules.get(filename);
    const exports = {};
    modules.set(filename, exports);
    const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: filename,
    }).outputText;
    vm.runInNewContext(output, {
      exports, console, Date, process: { env: {} },
      require(name) {
        if (mocks[name]) return mocks[name];
        if (name === '@ojt/shared') return load('shared/attendanceDate.ts');
        if (name.startsWith('.')) return load(path.resolve(path.dirname(filename), name));
        return require(name);
      },
    }, { filename });
    return exports;
  }
  return load;
}

function fixture() {
  const state = { online: true, uploadError: null, bffError: null, existing: null, queue: [], bff: [] };
  const lib = f => path.join(root, 'apps/mobile/src/lib', f);
  const assignment = { assignment_id: 'a1', company_id: 'c', branch_id: 'b', companies: { company_name: 'Co' },
    company_branches: { latitude: 14, longitude: 121, geofence_radius_meters: 150, geofence_enabled: true } };
  const query = data => { const q = { select: () => q, eq: () => q, single: async () => ({ data }), maybeSingle: async () => ({ data }) }; return q; };
  const load = loader({
    [lib('supabase.ts')]: { supabase: { from: table => query(table === 'attendance' ? state.existing : table === 'student_assignments' ? assignment : null) } },
    [lib('syncEngine.ts')]: { isNetworkAvailable: async () => state.online },
    [lib('storage.ts')]: { uploadSelfieToStorage: async (_u, s, t) => state.uploadError
      ? { data: null, error: state.uploadError } : { data: { path: `${s}/${t}_x.jpg` }, error: null } },
    [lib('webBff.ts')]: { postWebBff: async (_e, payload) => { state.bff.push(payload);
      return state.bffError ? { data: null, error: state.bffError } : { data: { attendance_id: 'srv' }, error: null }; } },
    [lib('offlineQueue.ts')]: {
      saveImageToSandbox: async (_u, name) => `file:///sandbox/${name}`,
      enqueueOfflineAttendance: async item => { state.queue.push(item); },
      getOfflineQueue: async () => state.queue,
    },
    [lib('attendanceCache.ts')]: { getAttendanceIdentity: async () => ({ user: { user_id: 'u' }, student_id: 's1' }) },
    'expo-secure-store': { getItemAsync: async () => null, setItemAsync: async () => {}, deleteItemAsync: async () => {} },
  });
  return { state, attendance: load('apps/mobile/src/services/attendance.ts') };
}

const loc = { latitude: 14.1, longitude: 121.1, distanceMeters: 20, locationStatus: 'verified',
  flagReason: null, satelliteTimestamp: '2026-10-05T07:30:00+08:00' };
const serverDown = { code: 'SERVER_FAILURE', message: 'down' };
const plain = o => JSON.parse(JSON.stringify(o));

test('time-in queues one complete event when the selfie upload fails', async () => {
  const f = fixture(); f.state.uploadError = serverDown;
  const r = await f.attendance.recordTimeIn('file:///a.jpg', loc);
  assert.deepEqual(plain(r), { data: { attendance_id: 'offline_pending', isOffline: true }, error: null });
  assert.equal(f.state.queue.length, 1);
  const { local_photo_uri, ...rest } = f.state.queue[0];
  assert.match(local_photo_uri, /^file:\/\/\/sandbox\/time_in_\d+\.jpg$/);
  assert.deepEqual(plain(rest), { type: 'time_in', student_id: 's1', assignment_id: 'a1',
    captured_at: loc.satelliteTimestamp, attendance_date: '2026-10-05', latitude: 14.1, longitude: 121.1,
    distance_meters: 20, location_status: 'verified', flag_reason: null });
});

test('time-in and time-out queue the same event shape when the server is down', async () => {
  const f = fixture(); f.state.bffError = serverDown;
  assert.equal((await f.attendance.recordTimeIn('file:///a.jpg', loc)).data.isOffline, true);
  assert.equal(f.state.queue[0].type, 'time_in');
  f.state.queue.length = 0;
  f.state.existing = { attendance_id: 'srv-1', student_id: 's1', time_out: null };
  assert.equal((await f.attendance.recordTimeOut('srv-1', 'file:///b.jpg', loc)).data.isOffline, true);
  assert.deepEqual(plain({ ...f.state.queue[0], local_photo_uri: 0 }), { type: 'time_out', student_id: 's1',
    assignment_id: '', attendance_id: 'srv-1', local_photo_uri: 0, captured_at: loc.satelliteTimestamp,
    attendance_date: '2026-10-05', latitude: 14.1, longitude: 121.1, distance_meters: 20,
    location_status: 'verified', flag_reason: null });
});

test('a non-network server rejection is returned, not queued', async () => {
  const f = fixture(); f.state.bffError = { code: 'VALIDATION_FAILURE', message: 'no' };
  const r = await f.attendance.recordTimeIn('file:///a.jpg', loc);
  assert.equal(r.error.code, 'VALIDATION_FAILURE');
  assert.equal(f.state.queue.length, 0);
});

// ── Server-side recording decisions (apps/web/src/lib/attendance-recording.ts) ──
function recording() {
  const shared = loader({})('shared/attendanceDate.ts');
  const geo = loader({})('shared/geo.ts');
  return loader({ '@ojt/shared': { ...shared, ...geo } })('apps/web/src/lib/attendance-recording.ts');
}
const policy = { companyId: 'c', remote: false, geofenceEnabled: true, latitude: 14, longitude: 121, radiusMeters: 150 };

test('location evidence: remote, missing GPS, inside, outside, geofence off', () => {
  const { deriveLocationEvidence: d } = recording();
  assert.deepEqual(plain(d(14.5, 121.5, { ...policy, remote: true }, 'x')),
    { latitude: 14.5, longitude: 121.5, distanceMeters: null, status: 'not_applicable', flagReason: null });
  assert.deepEqual(plain(d(null, null, policy, '  no gps  ')),
    { latitude: null, longitude: null, distanceMeters: null, status: 'location_unavailable', flagReason: 'no gps' });
  assert.equal(d(null, null, policy, 5).flagReason, 'GPS location unavailable.');
  const inside = d(14, 121, policy, null);
  assert.equal(inside.status, 'verified'); assert.equal(inside.flagReason, null); assert.equal(inside.distanceMeters, 0);
  const outside = d(15, 121, policy, '');
  assert.equal(outside.status, 'flagged_out_of_bounds');
  assert.equal(outside.flagReason, 'Outside the designated workplace geofence.');
  assert.ok(outside.distanceMeters > 150);
  assert.deepEqual(plain(d(15, 121, { ...policy, geofenceEnabled: false }, null)),
    { latitude: 15, longitude: 121, distanceMeters: null, status: 'verified', flagReason: null });
});

test('late status compares Philippine local time with the cutoff and ignores weekends', () => {
  const { lateStatusFor: l } = recording();
  assert.equal(l('2026-10-05T08:00:00+08:00', '08:00:00'), 'on_time');
  assert.equal(l('2026-10-05T08:00:01+08:00', '08:00:00'), 'late');
  assert.equal(l('2026-10-05T08:00:01+08:00', null), 'unknown');
  assert.equal(l('2026-10-04T09:00:00+08:00', '08:00:00'), 'unknown');
});

test('capture time rules: future beyond skew and weekday-only time-in', () => {
  const { captureTimeFailure: c } = recording();
  const now = new Date('2026-10-05T08:00:00+08:00').getTime();
  assert.equal(c('2026-10-05T08:04:00+08:00', now, true), null);
  assert.equal(c('2026-10-05T08:06:00+08:00', now, true).code, 'VALIDATION_FAILURE');
  assert.equal(c('2026-10-04T08:00:00+08:00', now, true).message, 'Attendance is only recorded on weekdays.');
  assert.equal(c('2026-10-04T08:00:00+08:00', now, false), null);
});

test('time-out decision: duplicate, earlier than time-in, replacing automatic time-out', () => {
  const { timeOutDecision: t } = recording();
  const AUTO = loader({})('shared/attendanceDate.ts').AUTO_TIME_OUT_REASON;
  const open = { time_in: '2026-10-05T08:00:00Z', time_out: null };
  assert.deepEqual(plain(t(open, '2026-10-05T09:00:00Z')), { replacingAutoTimeOut: false });
  assert.equal(t(open, '2026-10-05T07:00:00Z').failure.message, 'Time Out cannot be earlier than Time In.');
  const closed = { ...open, time_out: '2026-10-05T17:00:00Z', verification_status: 'approved' };
  assert.equal(t(closed, '2026-10-05T18:00:00Z').failure.status, 409);
  const auto = { ...closed, verification_status: 'pending', time_out_flag_reason: AUTO };
  assert.deepEqual(plain(t(auto, '2026-10-05T18:00:00Z')), { replacingAutoTimeOut: true });
});

// ── Terminal vs retryable sync failures (attendanceSyncWorkflow.ts) ──
function workflow(overrides = {}) {
  const calls = { removed: [], blocked: [], inserts: 0, uploads: 0 };
  const adapter = {
    findTimeIn: async () => ({ data: null }),
    findTimeOut: async () => ({ data: { attendance_id: 'srv', time_out: null } }),
    uploadSelfie: async () => { calls.uploads++; return 's1/time_in_x.jpg'; },
    insertTimeIn: async () => { calls.inserts++; return { error: { code: 'VALIDATION_FAILURE', message: 'Attendance is only recorded on weekdays.' } }; },
    updateTimeOut: async () => ({ updated: false, error: { code: 'FORBIDDEN', message: 'nope' } }),
    removeQueueItem: async id => { calls.removed.push(id); },
    markBlocked: async (id, reason) => { calls.blocked.push([id, reason]); },
    now: () => '2026-10-05T00:00:00Z',
    ...overrides,
  };
  const { syncAttendanceWorkflow } = loader({ '@ojt/shared': loader({})('shared/attendanceDate.ts') })('apps/mobile/src/lib/attendanceSyncWorkflow.ts');
  return { calls, run: items => syncAttendanceWorkflow(items, 's1', adapter) };
}
const queued = (o = {}) => ({ id: 'q1', type: 'time_in', student_id: 's1', assignment_id: 'a1', local_photo_uri: 'file:///p.jpg',
  captured_at: '2026-10-05T08:00:00+08:00', attendance_date: '2026-10-05', ...o });

test('a terminal server rejection blocks the item without deleting it', async () => {
  const w = workflow();
  const r = await w.run([queued()]);
  assert.equal(r.syncedCount, 0);
  assert.deepEqual(plain(w.calls.blocked), [['q1', 'Attendance is only recorded on weekdays.']]);
  assert.deepEqual(w.calls.removed, []);
});

test('network and server failures stay retryable and are not blocked', async () => {
  const w = workflow({ insertTimeIn: async () => ({ error: { code: 'SERVER_FAILURE', message: 'down' } }) });
  await w.run([queued()]);
  assert.deepEqual(w.calls.blocked, []);
});

test('blocked items are not re-uploaded or re-submitted, but their reason is surfaced', async () => {
  const w = workflow();
  const r = await w.run([queued({ blocked_reason: 'Attendance is only recorded on weekdays.' })]);
  assert.equal(w.calls.uploads, 0); assert.equal(w.calls.inserts, 0);
  assert.deepEqual(plain(r.errors), ['Attendance is only recorded on weekdays.']);
});

test('a blocked item clears once the server record matches it (read-only check)', async () => {
  const w = workflow({ findTimeIn: async () => ({ data: { attendance_id: 'srv', time_in: '2026-10-05T00:00:00Z' } }) });
  const r = await w.run([queued({ blocked_reason: 'x' })]);
  assert.equal(r.syncedCount, 1); assert.deepEqual(w.calls.removed, ['q1']);
});

test('a blocked time-out is skipped too, and a terminal time-out rejection blocks it', async () => {
  const w = workflow();
  await w.run([queued({ id: 't1', type: 'time_out' })]);
  assert.deepEqual(plain(w.calls.blocked), [['t1', 'nope']]);
  const w2 = workflow();
  const r = await w2.run([queued({ id: 't2', type: 'time_out', blocked_reason: 'nope' })]);
  assert.deepEqual(plain(r.errors), ['nope']); assert.equal(w2.calls.uploads, 0);
});

test('mobile sync replaces only a pending auto time-out; any other existing time-out is a conflict', async () => {
  const AUTO = loader({})('shared/attendanceDate.ts').AUTO_TIME_OUT_REASON;
  const run = async existing => {
    const w = workflow({ findTimeOut: async () => ({ data: existing }), updateTimeOut: async () => ({ updated: true }) });
    const r = await w.run([queued({ id: 't', type: 'time_out', captured_at: '2026-10-05T18:00:00Z' })]);
    return r.syncedCount;
  };
  const base = { attendance_id: 'srv', time_out: '2026-10-05T17:00:00Z' };
  assert.equal(await run({ ...base, verification_status: 'pending', time_out_flag_reason: AUTO }), 1);
  assert.equal(await run({ ...base, verification_status: 'approved', time_out_flag_reason: AUTO }), 0);
  assert.equal(await run({ ...base, verification_status: 'pending', time_out_flag_reason: null }), 0);
});
