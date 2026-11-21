const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const file = path.resolve(__dirname, '..', 'shared', 'attendanceReminders.ts');
const exports_ = {};
new Function('exports', ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText)(exports_);
const { planAttendanceReminders } = exports_;

// 2026-11-23 is a Monday. Manila 06:00 = 22:00 UTC the day before.
const monday6am = new Date('2026-11-22T22:00:00Z');
const schedule = { status: 'approved', work_days: [1, 2, 3, 4, 5], time_in: '08:00:00', time_out: '17:00:00', start_date: '2026-11-01', end_date: null };
const plan = (over = {}) => planAttendanceReminders({ schedule, todayRecord: null, nonWorkingDates: [], now: monday6am, days: 1, ...over });
const kinds = (rs) => rs.map((r) => r.kind);

test('workday morning: time-in-soon at 07:50 and late at 08:15 Manila', () => {
  const rs = plan();
  assert.deepEqual(kinds(rs), ['time_in_soon', 'late']);
  assert.equal(rs[0].at.toISOString(), '2026-11-22T23:50:00.000Z');
  assert.equal(rs[1].at.toISOString(), '2026-11-23T00:15:00.000Z');
});

test('already timed in: no time-in reminders, time-out is planned', () => {
  const rs = plan({ todayRecord: { time_in: '2026-11-23T00:01:00Z', time_out: null } });
  assert.deepEqual(kinds(rs), ['time_out']);
  assert.equal(rs[0].at.toISOString(), '2026-11-23T09:00:00.000Z');
});

test('already timed out: nothing left today', () => {
  assert.deepEqual(plan({ todayRecord: { time_in: 'x', time_out: 'y' } }), []);
});

test('not timed in: no time-out reminder; times already passed are dropped', () => {
  assert.deepEqual(kinds(plan({ now: new Date('2026-11-23T00:05:00Z') })), ['late']);
});

test('weekend, holiday, outside the schedule dates and unapproved schedules give nothing', () => {
  // 2026-11-28 22:00 UTC is Sunday 06:00 in Manila.
  assert.deepEqual(plan({ now: new Date('2026-11-28T22:00:00Z') }), []);
  assert.deepEqual(plan({ nonWorkingDates: ['2026-11-23'] }), []);
  assert.deepEqual(plan({ schedule: { ...schedule, start_date: '2026-12-01' } }), []);
  assert.deepEqual(plan({ schedule: { ...schedule, end_date: '2026-11-20' } }), []);
  assert.deepEqual(plan({ schedule: { ...schedule, status: 'pending' } }), []);
  assert.deepEqual(plan({ schedule: null }), []);
});

test('Manila date, not UTC date, decides "today"', () => {
  // 23:30 UTC Sunday is already 07:30 Monday in Manila, so Monday's reminders are still ahead.
  const rs = plan({ now: new Date('2026-11-22T23:30:00Z') });
  assert.deepEqual(kinds(rs), ['time_in_soon', 'late']);
});

test('a week ahead: every workday gets two reminders, time-out only for today', () => {
  const rs = plan({ days: 7, todayRecord: { time_in: 'x', time_out: null } });
  assert.equal(rs.filter((r) => r.kind === 'time_out').length, 1);
  assert.equal(rs.filter((r) => r.kind === 'late').length, 4); // Tue-Fri; Sat and Sun are off
});
