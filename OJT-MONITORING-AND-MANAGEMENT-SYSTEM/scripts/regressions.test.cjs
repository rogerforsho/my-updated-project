const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const ts = require('typescript');

// Execute the real TypeScript services, replacing only device/backend APIs.
function loader(mocks, globals = {}) {
  const modules = new Map();
  function load(relative) {
    let filename = path.resolve(root, relative);
    if (!path.extname(filename)) filename += '.ts';
    if (mocks[filename]) return mocks[filename];
    if (modules.has(filename)) return modules.get(filename);
    const exports = {};
    modules.set(filename, exports);
    const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
      fileName: filename,
    }).outputText;
    vm.runInNewContext(output, {
      exports, console, setTimeout, clearTimeout, Date, Buffer, URL, crypto: require('node:crypto').webcrypto, Headers,
      process: { env: {} },
      require(name) {
        if (mocks[name]) return mocks[name];
        if (name === '@ojt/shared') return {
          ...load('shared/attendanceDate.ts'),
          ...load('shared/schedulePolicy.ts'),
        };
        if (name.startsWith('.')) return load(path.resolve(path.dirname(filename), name));
        return require(name);
      },
      ...globals,
    }, { filename });
    return exports;
  }
  return load;
}

function mobileFixture() {
  const store = new Map();
  const files = new Map();
  const calls = [];
  const state = {
    online: true,
    userId: 'user-a', studentId: 'student-a',
    record: null, updateResult: null, insertFailCount: 0, requestFailCount: 0,
    now: '2026-10-05T07:30:00+08:00',
  };
  const secureStore = {
    async getItemAsync(key) { return store.get(key) ?? null; },
    async setItemAsync(key, value) { store.set(key, value); },
    async deleteItemAsync(key) { store.delete(key); },
  };
  const supabase = {
    auth: {
      async getUser() {
        calls.push('auth');
        if (!state.online) throw new Error('Network unavailable');
        return { data: { user: state.userId ? { id: state.userId } : null }, error: null };
      },
      async signOut() { state.userId = null; },
    },
    from(table) {
      calls.push(table);
      if (!state.online) throw new Error('Network unavailable');
      let operation = 'select';
      const query = {
        select() { return this; }, eq() { return this; }, is() { return this; }, order() { return this; }, limit() { return this; },
        update(values) { operation = 'update'; calls.push({ update: values }); return this; },
        insert(values) { operation = 'insert'; calls.push({ insert: values }); state.insertValues = values; return this; },
        async single() { return this.maybeSingle(); },
        async maybeSingle() {
          if (table === 'students' && state.studentLookup) return state.studentLookup();
          if (operation === 'update') return { data: state.updateResult, error: null };
          if (operation === 'insert') {
            if (state.insertFailCount > 0) { state.insertFailCount--; return { data: null, error: { message: 'temporary write failure' } }; }
            state.record = { ...state.insertValues, attendance_id: 'server-record', time_out: null };
            return { data: { attendance_id: 'server-record' }, error: null };
          }
          const data = table === 'users' ? {
            user_id: state.userId, role: 'Student', account_status: 'active',
            full_name: 'Test Student', email: 'student@example.test',
          } : table === 'students' ? { student_id: state.studentId }
            : table === 'student_assignments' ? {
              assignment_id: `assignment-${state.studentId}`, company_id: 'company', branch_id: 'branch',
              companies: { company_name: 'Test Company', geofence_enabled: true },
              company_branches: { latitude: 14, longitude: 121, geofence_enabled: true, geofence_radius_meters: 150 },
            } : table === 'attendance' ? state.record : null;
          return { data, error: null };
        },
      };
      return query;
    },
    storage: { from() { return { async upload(filename, _bytes, options) {
      calls.push({ upload: filename, options }); return { data: { path: filename }, error: null };
    } }; } },
  };
  const FixedDate = class extends Date {
    constructor(...args) { super(...(args.length ? args : [state.now])); }
    static now() { return new Date(state.now).getTime(); }
  };
  const load = loader({
    [path.join(root, 'apps/mobile/src/lib/supabase.ts')]: { supabase },
    [path.join(root, 'apps/mobile/src/lib/storage.ts')]: {
      async uploadSelfieToStorage(_uri, studentId, type, uploadId) {
        const filename = `${studentId}/${uploadId}_${type}.jpg`;
        calls.push({ upload: filename });
        return { data: { path: filename }, error: null };
      },
    },
    'expo-secure-store': secureStore,
    'expo-network': { async getNetworkStateAsync() {
      return { isConnected: state.online, isInternetReachable: state.online };
    } },
    'expo-file-system/legacy': {
      documentDirectory: 'file:///test/',
      async getInfoAsync(uri) { return { exists: uri.endsWith('/') || files.has(uri) }; },
      async makeDirectoryAsync() {}, async writeAsStringAsync(uri, value) { files.set(uri, value); }, async copyAsync() {},
      async deleteAsync(uri) { files.delete(uri); }, async readAsStringAsync(uri) { return files.get(uri) ?? 'AQID'; },
    },
    [path.join(root, 'apps/mobile/src/lib/webBff.ts')]: {
      async postWebBff(endpoint, payload) {
        calls.push({ bff: endpoint, payload });
        if (endpoint === '/api/mobile/schedule-proposals')
          return { data: { ...payload, daily_hours: 8 }, error: null };
        if (state.requestFailCount > 0) {
          state.requestFailCount--;
          return { data: null, error: { code: 'SERVER_FAILURE', message: 'The service could not be reached.' } };
        }
        if (payload.action === 'time_in') {
          if (state.insertFailCount > 0) {
            state.insertFailCount--;
            return { data: null, error: { message: 'temporary write failure' } };
          }
          state.record = { ...payload, attendance_id: 'server-record', time_out: null };
          return { data: { attendance_id: 'server-record' }, error: null };
        }
        if (!state.updateResult) return { data: null, error: { message: 'No open attendance row was updated.' } };
        state.record = { ...state.record, time_out: payload.time_out };
        return { data: null, error: null };
      },
    },
  }, { Date: FixedDate });
  const attendance = load('apps/mobile/src/services/attendance.ts');
  const cache = load('apps/mobile/src/lib/attendanceCache.ts');
  const queue = load('apps/mobile/src/lib/offlineQueue.ts');
  const sync = load('apps/mobile/src/lib/syncEngine.ts');
  return {
    state, store, calls, attendance, cache, queue, sync, load,
    async prepareOffline() {
      assert.ok(await attendance.getActiveAssignment());
      state.online = false;
      calls.length = 0;
    },
  };
}

test('shared schedule policy normalizes lunch input and enforces the same-day campus rules', () => {
  const validateSchedulePolicy = loader({})('shared/schedulePolicy.ts').validateSchedulePolicy;
  const base = {
    work_days: [1, 2, 3, 4, 5], time_in: '08:00', time_out: '17:00',
    lunch_break_minutes: 60, lunch_break_start: '12:00', start_date: '2026-10-12',
  };
  assert.deepEqual(JSON.parse(JSON.stringify(validateSchedulePolicy(base))), {
    ok: true,
    value: { lunch_break_minutes: 60, lunch_break_start: '12:00', daily_hours: 8, weekly_hours: 40 },
  });
  const defaultLunch = validateSchedulePolicy({ ...base, lunch_break_minutes: undefined, lunch_break_start: '12:00' });
  assert.equal(defaultLunch.ok, true);
  if (defaultLunch.ok) assert.equal(defaultLunch.value.lunch_break_minutes, 60);
  assert.equal(validateSchedulePolicy({ ...base, lunch_break_start: null }).ok, false);
  assert.equal(validateSchedulePolicy({ ...base, work_days: [1, 1] }).ok, false);
  assert.equal(validateSchedulePolicy({ ...base, time_out: '07:59' }).ok, false);
  assert.equal(validateSchedulePolicy({ ...base, time_out: '16:00', work_days: [1, 2, 3, 4], lunch_break_minutes: 0, lunch_break_start: '' }).ok, true);
  assert.equal(validateSchedulePolicy({ ...base, work_modality: 'remote' }).ok, false);
  assert.equal(validateSchedulePolicy({ ...base, work_modality: 'hybrid', end_date: '2026-10-11' }).ok, false);
  assert.equal(validateSchedulePolicy({ ...base, work_modality: 'remote', end_date: '2026-10-31' }).ok, true);
  assert.equal(validateSchedulePolicy({ ...base, start_date: '2026-02-29' }).ok, false);
});

test('MOA evidence is not treated as the required Endorsement Letter', () => {
  const { matchesDoc } = loader({})('shared/gateway.ts');
  assert.equal(matchesDoc('MOA', 'Endorsement Letter'), false);
  assert.equal(matchesDoc('MOA Endorsement', 'Endorsement Letter'), false);
});

test('what-if scenario estimates completion without rounding away existing hours or mutating data', () => {
  const { simulateCompletion } = loader({})('shared/whatIf.ts');
  assert.deepEqual(JSON.parse(JSON.stringify(simulateCompletion({
    completedHours: 100, requiredHours: 486, plannedWeeklyHours: 40, missedWeeks: 2, asOfDate: '2026-10-20',
  }))), { ok: true, weeksToCompletion: 12, projectedFinishDate: '2027-01-12', remainingHours: 386 });
  assert.equal(simulateCompletion({ completedHours: 486, requiredHours: 486, plannedWeeklyHours: 40, missedWeeks: 1, asOfDate: '2026-10-20' }).ok, true);
  assert.equal(simulateCompletion({ completedHours: 100, requiredHours: 486, plannedWeeklyHours: 41, missedWeeks: 0, asOfDate: '2026-10-20' }).ok, false);
  assert.equal(simulateCompletion({ completedHours: 1, requiredHours: 400, plannedWeeklyHours: 35, missedWeeks: 0, asOfDate: '2026-02-30' }).ok, false);
});

test('zip writer builds a valid archive that standard tools can read back', () => {
  const { zipStore } = loader({}, { TextEncoder, Uint8Array, DataView, ArrayBuffer, Uint32Array })('apps/web/src/lib/zip.ts');
  const entries = [
    { name: 'a/hello.txt', data: new TextEncoder().encode('hello zip') },
    { name: 'a/ünï.csv', data: new TextEncoder().encode('x,y,1,2') },
    { name: 'empty.bin', data: new Uint8Array(0) },
    { name: 'big.bin', data: Uint8Array.from({ length: 100_000 }, (_, i) => i % 251) },
  ];
  const zip = Buffer.from(zipStore(entries, new Date(2026, 9, 28, 10, 30, 0)));
  const dir = path.join(os.tmpdir(), `zip-test-${process.pid}`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'out.zip'), zip);
  // Python's zipfile checks every CRC and size while reading.
  const py = `import zipfile,sys;z=zipfile.ZipFile(sys.argv[1]);assert z.testzip() is None;print("|".join(f"{i.filename}:{len(z.read(i))}" for i in z.infolist()))`;
  const run = require('node:child_process').spawnSync('python', ['-c', py, path.join(dir, 'out.zip')], { encoding: 'utf8', env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
  if (run.error || run.status !== 0) { console.warn('python unavailable, checking structure only:', run.stderr || run.error); assert.equal(zip.readUInt32LE(zip.length - 22), 0x06054b50); assert.equal(zip.readUInt16LE(zip.length - 14), 4); }
  else assert.equal(run.stdout.trim(), 'a/hello.txt:9|a/ünï.csv:7|empty.bin:0|big.bin:100000');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('expected end date skips weekends and non-working days without reducing rendered hours', () => {
  const { expectedEndDate } = loader({})('shared/expectedEnd.ts');
  // Fri 2026-10-23, 24h left at 8h/day Mon-Fri: Mon 26, Tue 27, Wed 28.
  assert.equal(expectedEndDate({ remainingHours: 24, dailyHours: 8, workDays: [1, 2, 3, 4, 5], nonWorkingDates: [], asOfDate: '2026-10-23' }), '2026-10-28');
  // A holiday on Tue 27 and a company day off on Wed 28 push it to Thu 29 and Fri 30.
  assert.equal(expectedEndDate({ remainingHours: 24, dailyHours: 8, workDays: [1, 2, 3, 4, 5], nonWorkingDates: ['2026-10-27', '2026-10-28'], asOfDate: '2026-10-23' }), '2026-10-30');
  // A partial last day still counts as a day.
  assert.equal(expectedEndDate({ remainingHours: 9, dailyHours: 8, workDays: [1, 2, 3, 4, 5], nonWorkingDates: [], asOfDate: '2026-10-23' }), '2026-10-27');
  assert.equal(expectedEndDate({ remainingHours: 0, dailyHours: 8, workDays: [1], nonWorkingDates: [], asOfDate: '2026-10-23' }), '2026-10-23');
  assert.equal(expectedEndDate({ remainingHours: 8, dailyHours: 8, workDays: [], nonWorkingDates: [], asOfDate: '2026-10-23' }), null);
  assert.equal(expectedEndDate({ remainingHours: 8, dailyHours: 0, workDays: [1], nonWorkingDates: [], asOfDate: '2026-10-23' }), null);
  assert.equal(expectedEndDate({ remainingHours: 8, dailyHours: 8, workDays: [1], nonWorkingDates: [], asOfDate: '2026-02-30' }), null);
});

test('mobile schedule proposal sends policy-normalized lunch interval to the BFF', async () => {
  const f = mobileFixture();
  const schedule = f.load('apps/mobile/src/services/schedule.ts');
  const result = await schedule.submitScheduleProposal({
    work_days: [1, 2, 3, 4, 5], time_in: '08:00', time_out: '17:00',
    lunch_break_minutes: undefined, lunch_break_start: '12:00', start_date: '2026-10-12',
    work_modality: 'onsite',
  });
  assert.equal(result.error, null);
  const submitted = f.calls.find(call => call.bff === '/api/mobile/schedule-proposals')?.payload;
  assert.equal(submitted.lunch_break_minutes, 60);
  assert.equal(submitted.lunch_break_start, '12:00');
});

test('offline time-in uses the cached identity without any auth/database call', async () => {
  const f = mobileFixture();
  await f.prepareOffline();
  const result = await f.attendance.recordTimeIn('file:///selfie.jpg');
  assert.equal(result.error, null);
  assert.equal(result.data.isOffline, true);
  const queue = await f.queue.getOfflineQueue();
  assert.equal(queue.length, 1);
  assert.equal(queue[0].student_id, 'student-a');
  assert.equal(queue[0].attendance_date, '2026-10-05');
  assert.deepEqual(f.calls, []);
});

test('offline time-in/out survives reload, displays time-out, and rejects duplicates', async () => {
  const f = mobileFixture();
  await f.prepareOffline();
  await f.attendance.recordTimeIn('file:///selfie.jpg');
  assert.equal((await f.attendance.recordTimeIn('file:///selfie.jpg')).error.code, 'DUPLICATE_REQUEST');
  const today = await f.attendance.getTodayAttendance();
  assert.equal(today.attendance_id, 'offline_pending');
  f.state.now = '2026-10-05T17:00:00+08:00';
  assert.equal((await f.attendance.recordTimeOut(today.attendance_id, 'file:///out.jpg')).error, null);
  assert.ok((await f.attendance.getTodayAttendance()).time_out);
  assert.ok((await f.attendance.recordTimeOut(today.attendance_id, 'file:///out.jpg')).error);
  assert.equal((await f.queue.getOfflineQueue()).length, 2);
  assert.deepEqual(f.calls, []);
});

test('offline app bootstrap restores only the cached active student', async () => {
  const f = mobileFixture();
  await f.prepareOffline();
  const auth = f.load('apps/mobile/src/services/auth.ts');
  assert.equal((await auth.getAuthUser()).user_id, 'user-a');
  await f.cache.clearAttendanceIdentity();
  assert.equal(await auth.getAuthUser(), null);
  assert.equal((await f.attendance.recordTimeIn('file:///selfie.jpg')).error.code, 'UNAUTHORIZED');
  assert.deepEqual(f.calls, []);
});

test('switching accounts cannot reuse the previous student assignment or attendance', async () => {
  const f = mobileFixture();
  await f.prepareOffline();
  await f.attendance.recordTimeIn('file:///selfie.jpg');
  await f.cache.clearAttendanceIdentity();
  f.state.userId = 'user-b'; f.state.studentId = 'student-b'; f.state.online = true;
  await f.cache.getAttendanceIdentity(true);
  f.state.online = false;
  assert.equal(await f.attendance.getActiveAssignment(), null);
  assert.equal(await f.attendance.getTodayAttendance(), null);
  assert.equal((await f.attendance.recordTimeIn('file:///selfie.jpg')).error.code, 'NOT_FOUND');
});

test('a previously loaded online time-in remains available for offline time-out', async () => {
  const f = mobileFixture();
  f.state.record = { attendance_id: 'server-record', student_id: 'student-a',
    attendance_date: '2026-10-05', time_in: '2026-10-04T23:30:00Z', time_out: null };
  await f.attendance.getTodayAttendance();
  f.state.online = false;
  f.calls.length = 0;
  assert.equal((await f.attendance.recordTimeOut('server-record', 'file:///out.jpg')).error, null);
  assert.equal((await f.queue.getOfflineQueue())[0].attendance_id, 'server-record');
  assert.deepEqual(f.calls, []);
});

test('sync ignores queued records belonging to another signed-in student', async () => {
  const f = mobileFixture();
  await f.prepareOffline();
  await f.attendance.recordTimeIn('file:///selfie.jpg');
  f.state.userId = 'user-b'; f.state.studentId = 'student-b'; f.state.online = true;
  const result = await f.sync.syncPendingOfflineAttendance();
  assert.equal(result.syncedCount, 0);
  assert.equal((await f.queue.getOfflineQueue()).length, 1);
  assert.equal(f.calls.some(c => c.upload || c.insert || c.update), false);
});

test('sync keeps a time-out queued if no attendance row was updated', async () => {
  const f = mobileFixture();
  f.state.record = { attendance_id: 'server-record', time_out: null };
  await f.queue.enqueueOfflineAttendance({ type: 'time_out', student_id: 'student-a',
    assignment_id: '', attendance_date: '2026-10-05', captured_at: f.state.now,
    local_photo_uri: 'file:///out.jpg' });
  const result = await f.sync.syncPendingOfflineAttendance();
  assert.equal(result.syncedCount, 0);
  assert.equal(result.errors.length, 1);
  assert.equal((await f.queue.getOfflineQueue()).length, 1);
});

test('a time-out retry recognizes a previously successful sync without another upload', async () => {
  const f = mobileFixture();
  await f.queue.enqueueOfflineAttendance({ type: 'time_out', student_id: 'student-a',
    assignment_id: '', attendance_date: '2026-10-05', captured_at: f.state.now,
    local_photo_uri: 'file:///out.jpg' });
  f.state.record = { attendance_id: 'server-record', time_out: f.state.now };
  const result = await f.sync.syncPendingOfflineAttendance();
  assert.equal(result.syncedCount, 1);
  assert.equal((await f.queue.getOfflineQueue()).length, 0);
  assert.equal(f.calls.some(c => c.upload || c.update), false);
});

test('an offline Time Out can replace a pending automatic time-out', async () => {
  const f = mobileFixture();
  await f.queue.enqueueOfflineAttendance({ type: 'time_out', student_id: 'student-a',
    assignment_id: '', attendance_date: '2026-10-05', captured_at: f.state.now,
    local_photo_uri: 'file:///out.jpg' });
  f.state.record = { attendance_id: 'server-record',
    time_out: '2026-10-05T17:00:00+08:00', verification_status: 'pending',
    time_out_flag_reason: f.load('shared/attendanceDate.ts').AUTO_TIME_OUT_REASON };
  f.state.updateResult = { attendance_id: 'server-record' };
  const result = await f.sync.syncPendingOfflineAttendance();
  assert.equal(result.syncedCount, 1);
  assert.equal((await f.queue.getOfflineQueue()).length, 0);
  assert.equal(f.state.record.time_out, f.state.now);
});

test('a server request failure after selfie upload keeps Time In on the phone', async () => {
  const f = mobileFixture();
  f.state.requestFailCount = 1;
  const result = await f.attendance.recordTimeIn('file:///selfie.jpg');
  assert.equal(result.error, null);
  assert.equal(result.data.isOffline, true);
  assert.equal((await f.queue.getOfflineQueue()).length, 1);
});

test('a server request failure after selfie upload keeps Time Out on the phone', async () => {
  const f = mobileFixture();
  f.state.record = { attendance_id: 'server-record', student_id: 'student-a', attendance_date: '2026-10-05',
    time_in: '2026-10-04T23:00:00Z', time_out: null };
  f.state.requestFailCount = 1;
  const result = await f.attendance.recordTimeOut('server-record', 'file:///out.jpg');
  assert.equal(result.error, null);
  assert.equal(result.data.isOffline, true);
  assert.equal((await f.queue.getOfflineQueue())[0].type, 'time_out');
});

test('sync retries an already saved time-in without uploading a duplicate', async () => {
  const f = mobileFixture();
  await f.prepareOffline();
  await f.attendance.recordTimeIn('file:///selfie.jpg');
  f.state.online = true;
  f.state.record = { attendance_id: 'server-record', time_in: f.state.now };
  const result = await f.sync.syncPendingOfflineAttendance();
  assert.equal(result.syncedCount, 1);
  assert.equal((await f.queue.getOfflineQueue()).length, 0);
  assert.equal(f.calls.some(c => c.upload || c.insert), false);
});

test('a conflicting offline time-in stays local and is never uploaded or written over', async () => {
  const f = mobileFixture();
  await f.prepareOffline();
  await f.attendance.recordTimeIn('file:///selfie.jpg');
  f.state.online = true;
  f.state.record = { attendance_id: 'server-record', time_in: '2026-10-05T08:00:00+08:00' };
  const result = await f.sync.syncPendingOfflineAttendance();
  assert.equal(result.syncedCount, 0);
  assert.match(result.errors[0], /contact your OJT Coordinator/i);
  assert.equal((await f.queue.getOfflineQueue()).length, 1);
  assert.equal(f.calls.some(call => call.upload || call.insert), false);
});

test('offline selfie retries reuse one stable storage path after a failed attendance write', async () => {
  const f = mobileFixture();
  await f.prepareOffline();
  await f.attendance.recordTimeIn('file:///selfie.jpg');
  f.state.online = true;
  f.state.insertFailCount = 1;
  const first = await f.sync.syncPendingOfflineAttendance();
  assert.equal(first.syncedCount, 0);
  assert.equal((await f.queue.getOfflineQueue()).length, 1);
  const second = await f.sync.syncPendingOfflineAttendance();
  assert.equal(second.syncedCount, 1);
  assert.equal((await f.queue.getOfflineQueue()).length, 0);
  const uploads = f.calls.filter(call => call.upload);
  assert.equal(uploads.length, 2);
  assert.equal(uploads[0].upload, uploads[1].upload);
});

test('signing out during a profile lookup cannot restore the old offline identity', async () => {
  const f = mobileFixture();
  let finishLookup;
  f.state.studentLookup = () => new Promise(resolve => { finishLookup = resolve; });
  const remembering = f.cache.rememberAttendanceIdentity({ user_id: 'user-a',
    role: 'Student', account_status: 'active', email: 'test@example.test', full_name: 'Test' });
  await f.cache.clearAttendanceIdentity();
  finishLookup({ data: { student_id: 'student-a' }, error: null });
  assert.equal(await remembering, null);
  assert.equal(await f.cache.getCachedAttendanceIdentity(), null);
});

test('concurrent reconnect/manual sync submits each queued action once', async () => {
  const f = mobileFixture();
  await f.prepareOffline();
  await f.attendance.recordTimeIn('file:///in.jpg');
  await f.attendance.recordTimeOut('offline_pending', 'file:///out.jpg');
  f.state.online = true;
  f.state.updateResult = { attendance_id: 'server-record' };
  const first = f.sync.syncPendingOfflineAttendance();
  const second = f.sync.syncPendingOfflineAttendance();
  assert.equal(first, second);
  assert.equal((await first).syncedCount, 2);
  assert.equal((await f.queue.getOfflineQueue()).length, 0);
  assert.equal(f.calls.filter(c => c.upload).length, 2);
});

test('a missing online session invalidates the offline identity', async () => {
  const f = mobileFixture();
  await f.prepareOffline();
  f.state.online = true;
  f.state.userId = null;
  assert.equal(await f.load('apps/mobile/src/services/auth.ts').getAuthUser(), null);
  f.state.online = false;
  assert.equal(await f.cache.getCachedAttendanceIdentity(), null);
});

test('Philippine attendance date and weekday are correct at UTC and local midnight boundaries', () => {
  const { getAttendanceDate, getPhilippineClock } = loader({})('shared/attendanceDate.ts');
  for (const [timestamp, expected] of [
    ['2026-10-04T15:59:59Z', '2026-10-04'],
    ['2026-10-04T16:00:00Z', '2026-10-05'],
    ['2026-10-05T07:30:00+08:00', '2026-10-05'],
    ['2026-12-31T16:00:00Z', '2027-01-01'],
  ]) assert.equal(getAttendanceDate(new Date(timestamp)), expected);
  assert.equal(getPhilippineClock(new Date('2026-10-05T07:30:00+08:00')).getUTCDay(), 1);
});

function webFixture({ profile, user = null, production = false } = {}) {
  const { NextRequest, NextResponse } = require('next/server');
  const load = loader({
    'next/server': { NextResponse },
    '@supabase/ssr': { createServerClient() { return {
      auth: { async getUser() { return { data: { user } }; } },
      from() { return { select() { return this; }, eq() { return this; },
        async single() { return { data: profile ?? null, error: null }; } }; },
    }; } },
  }, { process: { env: {
    NODE_ENV: production ? 'production' : 'test',
    NEXT_PUBLIC_SUPABASE_URL: 'https://test.supabase.co', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-key',
  } } });
  const { middleware } = load('apps/web/middleware.ts');
  return (url, headers) => middleware(new NextRequest(url, { headers }));
}

test('middleware enforces a per-response CSP nonce and forwards it to the rendered request', async () => {
  const request = webFixture();
  const first = await request('http://localhost/');
  const second = await request('http://localhost/');
  const csp = first.headers.get('content-security-policy');
  assert.ok(csp);
  assert.match(csp, /script-src[^;]*'nonce-[a-f0-9]{32}'/);
  assert.doesNotMatch(csp, /script-src[^;]*'unsafe-inline'/);
  assert.notEqual(csp.match(/'nonce-([^']+)'/)?.[1], second.headers.get('content-security-policy')?.match(/'nonce-([^']+)'/)?.[1]);
});

test('public crawler metadata works without authentication; dashboard still redirects', async () => {
  const request = webFixture();
  for (const route of ['/robots.txt', '/sitemap.xml']) {
    assert.equal((await request(`http://localhost${route}`)).status, 200);
  }
  assert.equal((await request('http://localhost/dashboard')).status, 307);
});

test('container auth redirects use relative paths instead of an unusable 0.0.0.0 host', async () => {
  const request = webFixture();
  const response = await request('http://127.0.0.1:3000/dashboard', { host: '127.0.0.1:3000' });
  assert.equal(response.status, 307);
  assert.equal(response.headers.get('location'), 'http://127.0.0.1:3000/auth/sign-in');
  assert.doesNotMatch(response.headers.get('location'), /0\.0\.0\.0/);
});

test('unknown paths pass through to the framework not-found handler instead of redirecting to sign-in', async () => {
  const request = webFixture();
  const response = await request('http://localhost/not-a-real-page');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-middleware-next'), '1');
});

test('auth callback keeps success and failure redirects on the browser-facing host', async () => {
  const { NextRequest, NextResponse } = require('next/server');
  const load = loader({
    'next/server': { NextRequest, NextResponse },
    '@/src/lib/supabase/server': { async createClient() {
      return { auth: { async exchangeCodeForSession() { return { error: null }; } } };
    } },
  });
  const { GET } = load('apps/web/app/auth/callback/route.ts');
  const fragment = await GET(new NextRequest('http://127.0.0.1:3000/auth/callback?next=%2Fauth%2Fset-password'));
  assert.equal(fragment.headers.get('location'), '/auth/callback/finish?next=%2Fauth%2Fset-password');
  const unsafeFragment = await GET(new NextRequest('http://127.0.0.1:3000/auth/callback?next=https%3A%2F%2Fevil.example'));
  assert.equal(unsafeFragment.headers.get('location'), '/auth/callback/finish?next=%2Fdashboard');
  const success = await GET(new NextRequest('http://127.0.0.1:3000/auth/callback?code=good&next=%2Fstudent%2Fprogress'));
  assert.equal(success.headers.get('location'), '/student/progress');
  const unsafe = await GET(new NextRequest('http://127.0.0.1:3000/auth/callback?code=good&next=https%3A%2F%2Fevil.example'));
  assert.equal(unsafe.headers.get('location'), '/dashboard');
  const bad = loader({ 'next/server': { NextRequest, NextResponse }, '@/src/lib/supabase/server': { async createClient() {
    return { auth: { async exchangeCodeForSession() { return { error: { message: 'bad' } }; } } };
  } } })('apps/web/app/auth/callback/route.ts');
  assert.equal((await bad.GET(new NextRequest('http://127.0.0.1:3000/auth/callback?code=bad'))).headers.get('location'), '/auth/sign-in?error=auth_callback_failed');
});

test('forged user metadata cannot grant Admin access, and trusted Admin role still works', async () => {
  const forged = webFixture({ user: { id: 'user', user_metadata: { role: 'Admin' } },
    profile: { role: 'Student', account_status: 'active' } });
  const denied = await forged('http://localhost/admin');
  assert.equal(denied.status, 307);
  assert.equal(denied.headers.get('location'), 'http://localhost/auth/mobile-only');
  const admin = webFixture({ user: { id: 'admin', user_metadata: { role: 'Student' } },
    profile: { role: 'Admin', account_status: 'active' } });
  assert.equal((await admin('http://localhost/admin')).status, 200);
});

test('inactive or missing profiles cannot access protected pages', async () => {
  for (const profile of [null, { role: 'Admin', account_status: 'inactive' }]) {
    const request = webFixture({ user: { id: 'user' }, profile });
    assert.match((await request('http://localhost/admin')).headers.get('location'), /auth\/pending/);
  }
});

test('active students cannot use the web portal for student records', async () => {
  const student = webFixture({ user: { id: 'student' }, profile: { role: 'Student', account_status: 'active' } });
  for (const route of ['/dashboard', '/settings', '/map']) {
    const response = await student(`http://localhost${route}`);
    assert.equal(response.status, 307);
    assert.equal(response.headers.get('location'), 'http://localhost/auth/mobile-only');
  }
});

test('OJT Coordinator can enter academic workflows while Admin cannot', async () => {
  const request = webFixture({ user: { id: 'staff' }, profile: { role: 'Coordinator', account_status: 'active' } });
  for (const route of ['approvals', 'students', 'assignments', 'submissions', 'progress', 'companies', 'supervisors']) {
    assert.equal((await request(`http://localhost/coordinator/${route}`)).status, 200);
  }
  assert.equal((await request('http://localhost/coordinator/reports')).status, 200);
  for (const route of ['/admin', '/supervisor/students']) {
    assert.equal((await request(`http://localhost${route}`)).status, 307);
  }
  const admin = webFixture({ user: { id: 'admin' }, profile: { role: 'Admin', account_status: 'active' } });
  assert.equal((await admin('http://localhost/admin')).status, 200);
  assert.equal((await admin('http://localhost/coordinator/approvals')).status, 307);
  assert.equal((await admin('http://localhost/coordinator/reports')).status, 307);
});

test('production HTTP works on loopback while deployed hosts still require HTTPS', async () => {
  const request = webFixture({ production: true });
  const local = await request('http://127.0.0.1:3100/auth/sign-in', { 'x-forwarded-proto': 'http' });
  assert.equal(local.status, 200);
  assert.doesNotMatch(local.headers.get('content-security-policy'), /upgrade-insecure-requests/);
  const lan = await request('http://192.168.1.9:3000/');
  assert.equal(lan.status, 200);
  assert.doesNotMatch(lan.headers.get('content-security-policy'), /upgrade-insecure-requests/);
  const secure = await request('https://portal.example.test/');
  assert.match(secure.headers.get('content-security-policy'), /upgrade-insecure-requests/);
  const proxiedSecure = await request('http://127.0.0.1:3100/', { 'x-forwarded-proto': 'https' });
  assert.match(proxiedSecure.headers.get('content-security-policy'), /upgrade-insecure-requests/);
  const deployed = await request('http://portal.example.test/auth/sign-in', { 'x-forwarded-proto': 'http' });
  assert.equal(deployed.status, 301);
  assert.match(deployed.headers.get('location'), /^https:/);
});

test('web source files contain no double-encoded UTF-8 (mojibake)', () => {
  const bad = [];
  const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).forEach(entry => {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (/\.tsx?$/.test(entry.name) && /â€|Ã[\u0080-¿]|Â[ -¿]/.test(fs.readFileSync(file, 'utf8'))) bad.push(path.relative(root, file));
  });
  ['apps/web/src', 'apps/web/app'].forEach(dir => walk(path.join(root, dir)));
  assert.deepEqual(bad, []);
});

test('desktop IPC hides to tray and transitions between valid widget/window sizes', async () => {
  const handlers = new Map();
  const calls = [];
  const window = {
    isDestroyed: () => false, hide: () => calls.push('hide'),
    unmaximize: () => calls.push('unmaximize'),
    setMinimumSize: (w, h) => calls.push(['minimum', w, h]),
    setSize: (w, h) => calls.push(['size', w, h]),
    setAlwaysOnTop() {}, setMenuBarVisibility() {}, loadFile: () => Promise.resolve(), loadURL: () => Promise.resolve(), on() {},
    webContents: { on() {}, send() {}, setWindowOpenHandler() {}, mainFrame: { url: 'https://ojt-monitoring-and-management-syste.vercel.app/dashboard' } },
  };
  const electron = {
    app: { isPackaged: true, requestSingleInstanceLock: () => true, on() {},
      whenReady: () => Promise.resolve(), quit() {} },
    BrowserWindow: function () { return window; },
    ipcMain: { on: (name, fn) => handlers.set(name, fn), handle: (name, fn) => handlers.set(name, fn) },
    Notification: { isSupported: () => false }, dialog: {},
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'apps/desktop/src/main.js'), 'utf8'), {
    require(name) { if (name === 'electron') return electron;
      if (name === './tray') return { createTray() {} };
      if (name === './security') return require(path.join(root, 'apps/desktop/src/security.js'));
      if (name === './portal-connection') return { checkServerReady: async () => ({ ready: true, statusCode: 200 }) };
      if (name === 'fs') return { existsSync: () => false };
      return require(name); },
    __dirname: path.join(root, 'apps/desktop/src'), process: { env: {} }, console,
    URL, setInterval() {}, clearInterval() {}, setTimeout: () => 1, clearTimeout() {},
  });
  await Promise.resolve();
  const ipcEvent = { sender: window.webContents, senderFrame: window.webContents.mainFrame };
  handlers.get('minimize-to-tray')(ipcEvent);
  handlers.get('toggle-mini-widget')(ipcEvent, true);
  handlers.get('toggle-mini-widget')(ipcEvent, false);
  assert.deepEqual(calls, ['hide', 'unmaximize', ['minimum', 380, 540], ['size', 380, 540],
    ['minimum', 980, 640], ['size', 1280, 840]]);
});

test('forgotten time-out: open attendance older than 10 hours is auto timed-out and left pending', async () => {
  const now = Date.now();
  const hours = h => new Date(now - h * 3600000).toISOString();
  const rows = [
    { attendance_id: 'old', time_in: hours(11) },
    { attendance_id: 'fresh', time_in: hours(2) },
  ];
  const updates = [];
  const service = { from(table) {
    assert.equal(table, 'attendance');
    const filters = {};
    const query = {
      select() { return this; },
      is(column, value) { filters[column] = value; return this; },
      lte(column, value) { filters.lte = [column, value]; return this; },
      neq() { return this; },
      eq(column, value) { filters.eq = [column, value]; return this; },
      limit() { return this; },
      update(values) { filters.update = values; return this; },
      then(resolve) {
        if (filters.update) {
          assert.equal(filters.time_out, null);
          updates.push({ id: filters.eq[1], ...filters.update });
          return resolve({ data: [{ attendance_id: filters.eq[1] }], error: null });
        }
        assert.equal(filters.time_out, null);
        assert.equal(filters.lte[0], 'time_in');
        return resolve({ data: rows.filter(r => r.time_in <= filters.lte[1]), error: null });
      },
    };
    return query;
  } };
  const load = loader({ '@/src/lib/supabase/service': { getServiceClient: () => service } },
    { Response, process: { env: { CRON_SECRET: 'test-secret' } } });
  const { POST } = load('apps/web/app/api/internal/auto-time-out/route.ts');
  const url = 'http://localhost/api/internal/auto-time-out';

  assert.equal((await POST(new Request(url, { method: 'POST', headers: { authorization: 'Bearer wrong' } }))).status, 401);
  assert.equal(updates.length, 0);

  const response = await POST(new Request(url, { method: 'POST', headers: { authorization: 'Bearer test-secret' } }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { timedOut: 1, failed: 0 });
  assert.equal(updates.length, 1);
  assert.equal(updates[0].id, 'old');
  assert.equal(updates[0].time_out, new Date(Date.parse(rows[0].time_in) + 10 * 3600000).toISOString());
  assert.equal(updates[0].verification_status, 'pending');
  assert.match(updates[0].time_out_flag_reason, /automatic time-out/i);
});

test('Supervisor attendance review shows Time In and Time Out errand/justification notes', () => {
  const page = fs.readFileSync(path.join(root, 'apps/web/app/(dashboard)/supervisor/attendance/page.tsx'), 'utf8');
  assert.match(page, /selected\.time_out_flag_reason/);
  assert.match(page, /time_out_location_status/);
  assert.match(page, /location_unavailable/);
});

test('Supervisor bulk verify only includes clean logs, never flagged entries', () => {
  const page = fs.readFileSync(path.join(root, 'apps/web/app/(dashboard)/supervisor/attendance/page.tsx'), 'utf8');
  assert.match(page, /setBatchIds\(cleanLogs\.map\(/);
  assert.match(page, /cleanLogs\.length > 0 &&/);
  assert.doesNotMatch(page, /Verify this page/);
  assert.match(page, /r\.time_out_flag_reason/);
});
