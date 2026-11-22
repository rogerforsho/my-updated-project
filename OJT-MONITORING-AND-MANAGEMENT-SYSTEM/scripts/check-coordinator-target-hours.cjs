// Isolated PostgreSQL check: the Coordinator sets Target Hours per course; students on the old value follow, others stay.
const { PGlite } = require('@electric-sql/pglite');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

async function main() {
  const root = path.join(__dirname, '..');
  const read = name => fs.readFileSync(path.join(root, 'supabase/migrations', name), 'utf8');
  const { requiredHoursForCourse } = await import('../shared/courses.ts'); // Node 23+ strips TS types natively

  const db = new PGlite();
  const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  const ICS_COORD = id(901), IBE_COORD = id(902), ADMIN = id(903), STUDENT_USER = id(904);

  await db.exec(`
    CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
    CREATE SCHEMA private; CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.uid', true), '')::uuid $$;
    CREATE TABLE public.users(user_id uuid PRIMARY KEY, role text);
    CREATE TABLE public.students(student_id uuid PRIMARY KEY, course text, required_hours int);
    CREATE TABLE public.certificates(student_id uuid);
    CREATE TABLE public.internship_progress(student_id uuid PRIMARY KEY, completed_hours numeric, remaining_hours numeric, progress_status text, updated_at timestamptz);
    CREATE FUNCTION public.ojt_security_revision() RETURNS integer LANGUAGE sql AS $$ SELECT 44 $$;
    -- Stand-ins for the real helpers (029 and four_account_roles): department of a course, role and department grant of the caller.
    CREATE FUNCTION public.course_department(p_course text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
      SELECT CASE WHEN upper(p_course) LIKE ANY (ARRAY['%BSIT%','%BS-CPE%','%BSCPE%']) THEN 'ICS'
                  WHEN upper(p_course) LIKE ANY (ARRAY['%BSBA%','%BSENTREP%']) THEN 'IBE' END $$;
    CREATE TABLE public.test_grants(user_id uuid, department_scope text);
    CREATE FUNCTION private.get_my_role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT role FROM public.users WHERE user_id = auth.uid() $$;
    CREATE FUNCTION private.staff_has_department(p_department text) RETURNS boolean LANGUAGE sql STABLE AS $$
      SELECT EXISTS (SELECT 1 FROM public.users u JOIN public.test_grants g ON g.user_id = u.user_id
        WHERE u.user_id = auth.uid() AND u.role = 'Coordinator' AND g.department_scope = upper(trim(p_department))) $$;
    GRANT USAGE ON SCHEMA auth, private TO authenticated, service_role;
    INSERT INTO public.users VALUES ('${ICS_COORD}', 'Coordinator'), ('${IBE_COORD}', 'Coordinator'), ('${ADMIN}', 'Admin'), ('${STUDENT_USER}', 'Student');
    INSERT INTO public.test_grants VALUES ('${ICS_COORD}', 'ICS'), ('${IBE_COORD}', 'IBE');
    GRANT SELECT ON public.users, public.test_grants TO authenticated;
    SET check_function_bodies = off;
  `);
  await db.exec(read('20261108000100_required_hours_per_program.sql'));
  // 1 BSIT on default, 2 BS-CPE on default, 3 BS-CPE hand-set, 4 BS-CPE certified, 5 BS-CPE on default and already finished, 6 BSBA-HRM
  await db.exec(`
    INSERT INTO public.students VALUES
      ('${id(1)}', 'BSIT', 486), ('${id(2)}', 'BS-CPE', 240), ('${id(3)}', 'BS-CPE', 300), ('${id(4)}', 'BS-CPE', 240),
      ('${id(5)}', 'BSCPE', 240), ('${id(6)}', 'BSBA-HRM', 300);
    INSERT INTO public.certificates VALUES ('${id(4)}');
    INSERT INTO public.internship_progress VALUES
      ('${id(2)}', 100, 140, 'in_progress', now()), ('${id(4)}', 240, 0, 'completed', now()), ('${id(5)}', 245, 0, 'completed', now());
  `);
  const migration = read('20261122000100_coordinator_program_target_hours.sql');
  await db.exec(migration);
  await db.exec(migration); // reapplying must be safe

  const as = (uid, role = 'authenticated') => db.exec(`SET ROLE ${role}; SELECT set_config('test.uid', '${uid ?? ''}', false)`);
  const reset = () => db.exec(`RESET ROLE; SELECT set_config('test.uid', '', false)`);
  const hours = async n => (await db.query('SELECT required_hours FROM public.students WHERE student_id = $1', [id(n)])).rows[0].required_hours;
  const set = async (course, h) => (await db.query('SELECT public.set_program_target_hours($1, $2) AS moved', [course, h])).rows[0].moved;

  // Seed equals today's values, still unconfirmed, and the database agrees with the app mapping.
  const seeded = (await db.query('SELECT course, required_hours, confirmed_at FROM public.program_target_hours ORDER BY course')).rows;
  assert.deepEqual(seeded.map(r => [r.course, r.required_hours]), [['BS-CPE', 240], ['BSBA-HRM', 300], ['BSENTREP', 300], ['BSIT', 486]]);
  assert.ok(seeded.every(r => r.confirmed_at === null), 'seed rows are not confirmed');
  for (const course of ['BSIT', 'BS-CPE', 'BSCpE', 'BSCPE', 'BSBA-HRM', 'BSA', 'BSENTREP', 'Computer Engineering', 'BS Nursing', '', null]) {
    const { rows } = await db.query('SELECT public.required_hours_for_course($1) AS h', [course]);
    assert.equal(rows[0].h, requiredHoursForCourse(course), `seed hours for ${JSON.stringify(course)} must match the app`);
  }

  // Who may write.
  await as(STUDENT_USER);
  await assert.rejects(set('BS-CPE', 250), /not granted/, 'a student cannot set hours');
  await as(ADMIN);
  await assert.rejects(set('BS-CPE', 250), /not granted/, 'the Super Admin does not set academic rules');
  await as(IBE_COORD);
  await assert.rejects(set('BS-CPE', 250), /not granted/, 'an IBE Coordinator cannot set an ICS course');
  await as(null);
  await assert.rejects(set('BS-CPE', 250), /not granted/, 'no signed-in user is refused');
  await as(ICS_COORD);
  await assert.rejects(set('BS-CPE', 0), /between 1 and 840/);
  await assert.rejects(set('BS-CPE', 841), /between 1 and 840/);
  await assert.rejects(set('BSA', 300), /one of the four programs/);
  await assert.rejects(db.query(`UPDATE public.program_target_hours SET required_hours = 1`), /permission denied/, 'no direct writes');

  // Who may read.
  assert.deepEqual((await db.query('SELECT course FROM public.program_target_hours ORDER BY course')).rows.map(r => r.course), ['BS-CPE', 'BSIT'], 'an ICS Coordinator sees only ICS courses');
  await as(STUDENT_USER);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM public.program_target_hours')).rows[0].n, 0, 'a student sees nothing');

  // A save moves students on the old value, keeps hand-set and certified students, and recomputes progress.
  await as(ICS_COORD);
  assert.equal((await db.query(`SELECT public.count_students_following_target_hours('BS-CPE') AS n`)).rows[0].n, 2, 'preview counts students 2 and 5 only');
  assert.equal(await set('BS-CPE', 250), 2, 'two students followed');
  await reset();
  assert.equal(await hours(2), 250, 'default student moves');
  assert.equal(await hours(5), 250, 'legacy spelling BSCPE moves too');
  assert.equal(await hours(3), 300, 'a value set on purpose stays');
  assert.equal(await hours(4), 240, 'a certified student stays and the save still succeeds');
  assert.equal(await hours(1), 486, 'another course is untouched');
  const prog = async n => (await db.query('SELECT * FROM public.internship_progress WHERE student_id = $1', [id(n)])).rows[0];
  assert.equal(Number((await prog(2)).remaining_hours), 150, 'remaining hours recomputed');
  assert.equal((await prog(5)).progress_status, 'in_progress', '245 of 250 is no longer complete');
  assert.equal((await prog(4)).progress_status, 'completed', 'certified progress untouched');
  const row = (await db.query(`SELECT * FROM public.program_target_hours WHERE course = 'BS-CPE'`)).rows[0];
  assert.equal(row.required_hours, 250);
  assert.ok(row.confirmed_at, 'saving confirms the value');
  assert.equal(row.updated_by, ICS_COORD);

  // The seam the rest of the system uses now follows the table.
  assert.equal((await db.query(`SELECT public.required_hours_for_course('BS-CPE') AS h`)).rows[0].h, 250);
  await db.exec(`INSERT INTO public.students(student_id, course) VALUES ('${id(7)}', 'BS-CPE')`);
  assert.equal(await hours(7), 250, 'a new student gets the Coordinator value');
  await db.exec(`UPDATE public.students SET course = 'BSBA-HRM' WHERE student_id = '${id(7)}'`);
  assert.equal(await hours(7), 300, 'changing course moves a default value to the new program');

  // Saving the same value again moves nobody; an IBE Coordinator can set an IBE course and a legacy-named student follows.
  await as(ICS_COORD);
  assert.equal(await set('BS-CPE', 250), 0, 'same value moves nobody');
  await as(IBE_COORD);
  assert.equal(await set('BSBA-HRM', 320), 2, 'students 6 and 7 follow BSBA-HRM');
  await reset();
  assert.equal(await hours(6), 320);

  assert.equal(Number((await db.query('SELECT public.ojt_security_revision() AS r')).rows[0].r), 45);
  console.log('PASS: the Coordinator sets Target Hours per course; students on the old value follow, others stay.');
}

main().catch(error => { console.error(error); process.exit(1); });
