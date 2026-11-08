// Isolated PostgreSQL check: required practicum hours follow the program (BSIT 486, BS-CPE 240, BSBA-HRM 300, BSENTREP 300).
const { PGlite } = require('@electric-sql/pglite');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

async function main() {
  const root = path.join(__dirname, '..');
  const migration = fs.readFileSync(path.join(root, 'supabase/migrations/20261108000100_required_hours_per_program.sql'), 'utf8');
  const { REQUIRED_HOURS_BY_COURSE, requiredHoursForCourse, resolveRequiredHours } = await import('../shared/courses.ts'); // Node 23+ strips TS types natively

  assert.deepEqual(REQUIRED_HOURS_BY_COURSE, { BSIT: 486, 'BS-CPE': 240, 'BSBA-HRM': 300, BSENTREP: 300 });
  assert.equal(resolveRequiredHours(null, 'BS-CPE'), 240);
  assert.equal(resolveRequiredHours(250, 'BS-CPE'), 250, "a student's own value wins");
  assert.equal(resolveRequiredHours(null, 'BS Nursing'), 486, 'legacy unknown course keeps the old default');

  assert.equal(requiredHoursForCourse('BSCPE'), 240, 'legacy BSCPE spelling');
  assert.equal(requiredHoursForCourse('BSA'), null, 'BSA has no program hours');
  assert.equal(requiredHoursForCourse(undefined), null);

  const db = new PGlite();
  const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  await db.exec(`
    CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
    CREATE SCHEMA private;
    CREATE TABLE public.students(student_id uuid PRIMARY KEY, course text, required_hours int);
    CREATE TABLE public.certificates(student_id uuid);
    CREATE TABLE public.internship_progress(student_id uuid PRIMARY KEY, completed_hours numeric, remaining_hours numeric, progress_status text, updated_at timestamptz);
    CREATE FUNCTION public.ojt_security_revision() RETURNS integer LANGUAGE sql AS $$ SELECT 44 $$;
    INSERT INTO public.students VALUES
      ('${id(1)}', 'BSIT', 486), ('${id(2)}', 'BS-CPE', 486), ('${id(3)}', 'BSBA-HRM', NULL), ('${id(4)}', 'BSENTREP', 486),
      ('${id(5)}', 'BS-CPE', 486), ('${id(6)}', 'BS-CPE', 300), ('${id(7)}', 'BS Nursing', NULL);
    INSERT INTO public.certificates VALUES ('${id(5)}');
    INSERT INTO public.internship_progress VALUES
      ('${id(2)}', 250, 236, 'in_progress', now()), ('${id(5)}', 486, 0, 'completed', now());
    SET check_function_bodies = off;
  `);
  await db.exec(migration);
  await db.exec(migration); // reapplying must be safe

  // The database mapping must agree with the app mapping, including legacy spellings and unknown courses.
  for (const course of ['BSIT', 'BS-CPE', 'BSCpE', 'BSCPE', 'BSBA-HRM', 'BSA', 'BS Accountancy', 'BSENTREP', 'BSEntrep', 'Computer Engineering', 'BS Nursing', '  ', '', null, undefined]) {
    const { rows } = await db.query('SELECT public.required_hours_for_course($1) AS h', [course]);
    assert.equal(rows[0].h, requiredHoursForCourse(course), `required hours for ${JSON.stringify(course)} must match the app`);
  }

  const hours = async n => (await db.query('SELECT required_hours FROM public.students WHERE student_id = $1', [id(n)])).rows[0].required_hours;
  assert.equal(await hours(1), 486, 'BSIT unchanged');
  assert.equal(await hours(2), 240, 'BS-CPE on the old 486 default is corrected');
  assert.equal(await hours(3), 300, 'empty value is filled from the program');
  assert.equal(await hours(4), 300, 'BSENTREP on the old 486 default is corrected');
  assert.equal(await hours(5), 486, 'completed (certified) students are left alone');
  assert.equal(await hours(6), 300, 'a value set on purpose is not overwritten');
  assert.equal(await hours(7), null, 'a course with no program stays empty');

  const progress = (await db.query(`SELECT * FROM public.internship_progress WHERE student_id = $1`, [id(2)])).rows[0];
  assert.equal(Number(progress.remaining_hours), 0, 'progress snapshot is recomputed for the new requirement');
  assert.equal(progress.progress_status, 'completed', '250 of 240 hours is complete');
  assert.equal((await db.query(`SELECT progress_status FROM public.internship_progress WHERE student_id = $1`, [id(5)])).rows[0].progress_status, 'completed');

  await db.exec(`INSERT INTO public.students(student_id, course) VALUES ('${id(8)}', 'BS-CPE'), ('${id(9)}', 'BSIT')`);
  assert.equal(await hours(8), 240, 'new BS-CPE student gets 240');
  assert.equal(await hours(9), 486, 'new BSIT student gets 486');
  await db.exec(`INSERT INTO public.students VALUES ('${id(10)}', 'BS-CPE', 999)`);
  assert.equal(await hours(10), 999, 'an explicit value is kept on insert');

  await db.exec(`UPDATE public.students SET course = 'BSBA-HRM' WHERE student_id = '${id(8)}'`);
  assert.equal(await hours(8), 300, 'changing course moves a default value to the new program');
  await db.exec(`UPDATE public.students SET course = 'BSIT' WHERE student_id = '${id(10)}'`);
  assert.equal(await hours(10), 999, 'a value set on purpose survives a course change');

  console.log('PASS: required hours follow the program in the database and the app; existing students corrected; certified students untouched.');
}

main().catch(error => { console.error(error); process.exit(1); });
