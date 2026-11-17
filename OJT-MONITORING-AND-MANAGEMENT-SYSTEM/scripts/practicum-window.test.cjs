const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');

test('app rules: end date required, 5-month cap, month-end clamping', async () => {
  const { addMonthsClamped, practicumWindowError, validateSchedulePolicy, MAX_PRACTICUM_MONTHS } = await import('../shared/schedulePolicy.ts');
  assert.equal(MAX_PRACTICUM_MONTHS, 5);
  assert.equal(addMonthsClamped('2026-08-31', 5), '2027-01-31');
  assert.equal(addMonthsClamped('2026-09-30', 5), '2027-02-28');
  assert.equal(addMonthsClamped('2027-09-30', 5), '2028-02-29', 'leap year');
  assert.equal(addMonthsClamped('2026-11-10', 5), '2027-04-10');
  assert.equal(addMonthsClamped('2026-12-15', 5), '2027-05-15', 'crosses the year');
  assert.equal(practicumWindowError('2026-11-10', '2027-04-10'), null);
  assert.match(practicumWindowError('2026-11-10', '2027-04-11'), /at most 5 months.*2027-04-10/);
  assert.equal(practicumWindowError('2026-11-10', null), null, 'end date is optional');

  const base = { work_days: [1, 2, 3, 4, 5], time_in: '08:00', time_out: '17:00', lunch_break_minutes: 60, lunch_break_start: '12:00', start_date: '2026-11-10' };
  assert.equal(validateSchedulePolicy({ ...base, end_date: '2027-04-10' }).ok, true);
  assert.equal(validateSchedulePolicy({ ...base, end_date: '2027-04-11' }).ok, false);
  assert.equal(validateSchedulePolicy({ ...base }).ok, true, 'no end date is allowed for any modality');
});

test('app rules: schedule must be able to finish the required hours inside the window', async () => {
  const { validateScheduleFeasibility } = await import('../shared/schedulePolicy.ts');
  const win = { start_date: '2026-11-10', end_date: '2027-04-10', work_days: [1, 2, 3, 4, 5] };
  assert.equal(validateScheduleFeasibility({ ...win, daily_hours: 8, required_hours: 486 }).ok, true);
  assert.equal(validateScheduleFeasibility({ ...win, daily_hours: 4, required_hours: 240 }).ok, true, 'BS-CPE at 4h/day fits');
  const tooShort = validateScheduleFeasibility({ ...win, daily_hours: 3, required_hours: 486 });
  assert.equal(tooShort.ok, false, 'BSIT at 3h/day cannot reach 486 hours in 5 months');
  assert.match(tooShort.message, /486 hours are required/);
  assert.equal(validateScheduleFeasibility({ ...win, work_days: [1], daily_hours: 8, required_hours: 300 }).ok, false, 'one day a week is too little');
  const open = { start_date: '2026-11-10', work_days: [1, 2, 3, 4, 5] };
  assert.equal(validateScheduleFeasibility({ ...open, daily_hours: 8, required_hours: 486 }).ok, true, 'no end date: checked against the 5-month cap');
  assert.equal(validateScheduleFeasibility({ ...open, daily_hours: 3, required_hours: 486 }).ok, false);
});

test('database: the same cap is enforced on schedules and assignments', async () => {
  const root = path.join(__dirname, '..');
  const migration = fs.readFileSync(path.join(root, 'supabase/migrations/20261108000200_practicum_window_cap.sql'), 'utf8');
  const { addMonthsClamped } = await import('../shared/schedulePolicy.ts');
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
    CREATE TABLE public.practicum_schedules(schedule_id serial PRIMARY KEY, start_date date NOT NULL, end_date date, note text);
    CREATE TABLE public.student_assignments(assignment_id serial PRIMARY KEY, start_date date NOT NULL, end_date date, assignment_status text, note text);
    CREATE FUNCTION public.ojt_security_revision() RETURNS integer LANGUAGE sql AS $$ SELECT 44 $$;
    INSERT INTO public.practicum_schedules(start_date, end_date) VALUES ('2026-01-01', '2026-09-01');
    INSERT INTO public.student_assignments(start_date, end_date, assignment_status) VALUES ('2026-01-01', '2026-09-01', 'active');
  `);
  await db.exec(migration);
  await db.exec(migration); // reapplying must be safe
  await db.exec(fs.readFileSync(path.join(root, 'supabase/migrations/20261109000100_practicum_end_date_optional.sql'), 'utf8'));

  for (const start of ['2026-08-31', '2026-09-30', '2027-09-30', '2026-11-10', '2026-12-15', '2026-01-31']) {
    const { rows } = await db.query(`SELECT (($1::date + interval '5 months')::date)::text AS d`, [start]);
    assert.equal(rows[0].d, addMonthsClamped(start, 5), `database and app agree on ${start} + 5 months`);
  }

  for (const table of ['practicum_schedules', 'student_assignments']) {
    const status = table === 'student_assignments' ? ", 'active'" : '';
    const cols = table === 'student_assignments' ? '(start_date, end_date, assignment_status)' : '(start_date, end_date)';
    const ins = (s, e) => db.exec(`INSERT INTO public.${table}${cols} VALUES ('${s}', ${e ? `'${e}'` : 'NULL'}${status})`);
    await ins('2026-11-10', '2027-04-10');
    await ins('2026-08-31', '2027-01-31');
    await ins('2026-09-30', '2027-02-28');
    await assert.rejects(ins('2026-11-10', '2027-04-11'), /at most 5 months/);
    await assert.rejects(ins('2026-09-30', '2027-03-01'), /latest end date is 2027-02-28/);
    await ins('2026-11-10', null); // open-ended is allowed
    await assert.rejects(db.exec(`UPDATE public.${table} SET end_date = '2027-12-31' WHERE start_date = '2026-11-10'`), /at most 5 months/);
  }

  // Legacy rows that are already over the cap stay editable for everything except their dates, and can be closed.
  await db.exec(`UPDATE public.practicum_schedules SET note = 'x' WHERE start_date = '2026-01-01'`);
  await db.exec(`UPDATE public.student_assignments SET note = 'x' WHERE start_date = '2026-01-01'`);
  await db.exec(`UPDATE public.student_assignments SET assignment_status = 'reassigned', end_date = '2026-11-08' WHERE start_date = '2026-01-01'`);
  await db.exec(`INSERT INTO public.student_assignments(start_date, end_date, assignment_status) VALUES ('2026-01-01', '2026-12-31', 'completed')`);
});
