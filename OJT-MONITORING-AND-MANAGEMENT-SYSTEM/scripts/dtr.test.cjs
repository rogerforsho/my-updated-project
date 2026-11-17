const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const load = () => import('../apps/web/src/lib/dtr.ts');
const sched = { dailyHours: 8, lunchStart: '12:00', lunchMinutes: 60 };
// 09:00-18:00 Manila is 01:00-10:00 UTC
const row = (date, inUtc, outUtc, hours, late = 'on_time') => ({
  date, time_in: inUtc && `${date}T${inUtc}:00Z`, time_out: outUtc && `${date}T${outUtc}:00Z`, hours, late,
});

test('one row per calendar day, weekends flagged', async () => {
  const { buildDtrMonth } = await load();
  const { days } = buildDtrMonth([], '2026-11', sched);
  assert.equal(days.length, 30);
  assert.equal(days[0].weekend, true); // 1 Nov 2026 is a Sunday
  assert.equal(days[1].weekend, false);
});

test('a full day splits at lunch and has no undertime', async () => {
  const { buildDtrMonth } = await load();
  const { days } = buildDtrMonth([row('2026-11-11', '01:00', '10:00', 8)], '2026-11', sched);
  assert.deepEqual(
    [days[10].amIn, days[10].amOut, days[10].pmIn, days[10].pmOut, days[10].underMinutes],
    ['09:00', '12:00', '13:00', '18:00', 0],
  );
});

test('an early time-out is undertime against the daily hours', async () => {
  const { buildDtrMonth } = await load();
  const { days, totalUnderMinutes, totalHours } = buildDtrMonth([row('2026-11-11', '01:00', '09:00', 7)], '2026-11', sched);
  assert.equal(days[10].underMinutes, 60);
  assert.equal(totalUnderMinutes, 60);
  assert.equal(totalHours, 7);
});

test('time-out before lunch ends leaves the afternoon blank', async () => {
  const { buildDtrMonth } = await load();
  const { days } = buildDtrMonth([row('2026-11-11', '01:00', '03:30', 3.5)], '2026-11', sched);
  assert.deepEqual([days[10].amOut, days[10].pmIn, days[10].pmOut], ['11:30', '', '']);
});

test('without a lunch interval only arrival and departure are filled', async () => {
  const { buildDtrMonth } = await load();
  const { days } = buildDtrMonth([row('2026-11-11', '01:00', '10:00', 9)], '2026-11', { dailyHours: 8, lunchStart: null, lunchMinutes: 0 });
  assert.deepEqual([days[10].amIn, days[10].amOut, days[10].pmIn, days[10].pmOut], ['09:00', '', '', '18:00']);
});

test('absent rows are labelled and carry no undertime; missing time-out stays blank', async () => {
  const { buildDtrMonth } = await load();
  const { days } = buildDtrMonth([row('2026-11-12', null, null, 0, 'absent'), row('2026-11-13', '01:00', null, null)], '2026-11', sched);
  assert.equal(days[11].status, 'Absent');
  assert.equal(days[11].underMinutes, null);
  assert.equal(days[12].pmOut, '');
  assert.equal(days[12].underMinutes, null);
});

test('the attendance page offers the DTR download next to the CSV one', () => {
  const page = fs.readFileSync(path.join(__dirname, '../apps/web/app/(dashboard)/coordinator/attendance/page.tsx'), 'utf8');
  assert.match(page, /Download DTR/);
  assert.match(page, /DtrSheet/);
});

test('the DTR data path is coordinator-only', () => {
  const svc = fs.readFileSync(path.join(__dirname, '../apps/web/src/services/timecard.ts'), 'utf8');
  const fn = svc.slice(svc.indexOf('export async function getDtr'));
  assert.ok(fn.length > 0, 'getDtr missing');
  assert.match(fn, /coordinator\(\)/);
});

test('every timecard row has its own DTR button, no student filter needed', () => {
  const page = fs.readFileSync(path.join(__dirname, '../apps/web/app/(dashboard)/coordinator/attendance/page.tsx'), 'utf8');
  assert.match(page, /onClick=\{\(\) => setDtrStudentId\(r\.student_id\)\}/);
  assert.doesNotMatch(page, /showDtr && student/);
});
