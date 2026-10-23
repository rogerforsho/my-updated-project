// Isolated PostgreSQL check: incident reports are visible only to the reporting student and the
// Coordinator granted that student's department; Supervisors and Admins get nothing.
const { PGlite } = require('@electric-sql/pglite');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

async function main() {
  const root = path.join(__dirname, '..');
  const file = '20261024001100_confidential_incident_reports.sql';
  const migration = fs.readFileSync(path.join(root, 'database/migrations', file), 'utf8');
  assert.equal(fs.readFileSync(path.join(root, 'supabase/migrations', file), 'utf8'), migration, 'migration copies must match');
  const db = new PGlite();
  const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  await db.exec(`
    CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
    CREATE SCHEMA auth; CREATE SCHEMA private;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    CREATE TABLE public.users(user_id uuid PRIMARY KEY, role text, account_status text);
    CREATE TABLE public.students(student_id uuid PRIMARY KEY, user_id uuid, course text);
    CREATE TABLE public.staff_capability_grants(user_id uuid, capability text, department_scope text, revoked_at timestamptz);
    CREATE TABLE public.notifications(receiver_user_id uuid, message text, status text, notification_date timestamptz);
    CREATE FUNCTION public.course_department(text) RETURNS text LANGUAGE sql IMMUTABLE AS
      $$ SELECT CASE WHEN upper($1) LIKE '%BSIT%' THEN 'ICS' ELSE 'IBE' END $$;
    CREATE FUNCTION private.get_my_role() RETURNS text LANGUAGE sql SECURITY DEFINER STABLE
      SET search_path=public SET row_security=off AS
      $$ SELECT role FROM public.users WHERE user_id=auth.uid() AND account_status='active' $$;
    CREATE FUNCTION private.get_my_student_id() RETURNS uuid LANGUAGE sql SECURITY DEFINER STABLE
      SET search_path=public SET row_security=off AS
      $$ SELECT student_id FROM public.students WHERE user_id=auth.uid() $$;
    CREATE FUNCTION private.staff_has_student(uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE
      SET search_path=public SET row_security=off AS $$
        SELECT EXISTS(SELECT 1 FROM public.students s
          JOIN public.staff_capability_grants g ON g.department_scope=public.course_department(s.course)
          WHERE s.student_id=$1 AND g.user_id=auth.uid() AND g.capability='academic_workflows' AND g.revoked_at IS NULL)
      $$;
    GRANT USAGE ON SCHEMA auth, private TO authenticated;
    GRANT EXECUTE ON FUNCTION auth.uid(), private.get_my_role(), private.get_my_student_id(), private.staff_has_student(uuid) TO authenticated;
    GRANT SELECT ON public.users, public.students TO authenticated;
    INSERT INTO public.users VALUES
      ('${id(1)}','Student','active'), ('${id(2)}','Student','active'),
      ('${id(3)}','Coordinator','active'), ('${id(4)}','Coordinator','active'),
      ('${id(5)}','Supervisor','active'), ('${id(6)}','Admin','active');
    INSERT INTO public.students VALUES ('${id(11)}','${id(1)}','BSIT'), ('${id(12)}','${id(2)}','BSBA');
    INSERT INTO public.staff_capability_grants VALUES
      ('${id(3)}','academic_workflows','ICS',NULL), ('${id(4)}','academic_workflows','IBE',NULL),
      ('${id(5)}','academic_workflows','ICS',NULL);
  `);
  await db.exec(migration);
  await db.exec(migration);

  const count = async uid => {
    await db.exec(`SET ROLE authenticated; SET request.jwt.claim.sub='${uid}'`);
    try { return (await db.query('SELECT count(*)::int AS n FROM public.incident_reports')).rows[0].n; }
    finally { await db.exec('RESET ROLE'); }
  };
  const asUser = async (uid, sql) => {
    await db.exec(`SET ROLE authenticated; SET request.jwt.claim.sub='${uid}'`);
    try { return await db.query(sql); } finally { await db.exec('RESET ROLE'); }
  };
  const insert = (uid, studentId, extra = '') => asUser(uid, `INSERT INTO public.incident_reports(student_id, submitted_by, category, description)
    VALUES ('${studentId}', '${uid}', 'harassment', 'A supervisor made repeated unwanted remarks.') ${extra}`);

  // A student reports only as themselves.
  await insert(id(1), id(11));
  await assert.rejects(() => insert(id(1), id(12)), /only for themselves/);
  await assert.rejects(() => insert(id(3), id(11)), /only for themselves|row-level security/);
  await assert.rejects(() => asUser(id(1), `INSERT INTO public.incident_reports(student_id, submitted_by, category, description)
    VALUES ('${id(11)}', '${id(1)}', 'harassment', 'short')`), /check/);
  await assert.rejects(() => asUser(id(1), `INSERT INTO public.incident_reports(student_id, submitted_by, category, description, status)
    VALUES ('${id(11)}', '${id(1)}', 'other', 'Trying to pre-close my own report.', 'closed')`), /check|only for themselves/);

  // Visibility: reporter and the department Coordinator only.
  assert.equal(await count(id(1)), 1);
  assert.equal(await count(id(3)), 1);
  assert.equal(await count(id(2)), 0, 'another student sees nothing');
  assert.equal(await count(id(4)), 0, 'Coordinator of another department sees nothing');
  assert.equal(await count(id(5)), 0, 'Supervisor sees nothing, even with a department grant');
  assert.equal(await count(id(6)), 0, 'Admin sees nothing');

  // Coordinator notified without details; the student cannot edit the report.
  const notice = (await db.query(`SELECT receiver_user_id, message FROM public.notifications`)).rows;
  assert.equal(notice.length, 1);
  assert.equal(notice[0].receiver_user_id, id(3));
  assert.doesNotMatch(notice[0].message, /harass|supervisor|remarks/i);
  assert.equal((await asUser(id(1), `UPDATE public.incident_reports SET status='closed' RETURNING incident_id`)).rows.length, 0);
  assert.equal((await asUser(id(1), `UPDATE public.incident_reports SET description='Edited after the fact.' RETURNING incident_id`)).rows.length, 0);
  assert.equal((await asUser(id(5), `UPDATE public.incident_reports SET status='acknowledged', reviewed_by=auth.uid() RETURNING incident_id`)).rows.length, 0);
  assert.equal((await asUser(id(4), `UPDATE public.incident_reports SET status='acknowledged', reviewed_by=auth.uid() RETURNING incident_id`)).rows.length, 0);

  // Coordinator workflow: acknowledge, then close with a response; closed reports stay closed.
  const ack = await asUser(id(3), `UPDATE public.incident_reports SET status='acknowledged', reviewed_by=auth.uid() RETURNING reviewed_at`);
  assert.ok(ack.rows[0].reviewed_at);
  await assert.rejects(() => asUser(id(3), `UPDATE public.incident_reports SET description='Rewritten', status='closed',
    coordinator_response='Done', reviewed_by=auth.uid()`), /move an open incident report forward/);
  await assert.rejects(() => asUser(id(3), `UPDATE public.incident_reports SET status='closed', reviewed_by=auth.uid()`), /check/);
  const closed = await asUser(id(3), `UPDATE public.incident_reports SET status='closed',
    coordinator_response='Met with the company and the supervisor was reminded of the code of conduct.', reviewed_by=auth.uid() RETURNING status`);
  assert.equal(closed.rows[0].status, 'closed');
  assert.equal((await asUser(id(3), `UPDATE public.incident_reports SET status='acknowledged', reviewed_by=auth.uid() RETURNING incident_id`)).rows.length, 0, 'closed reports cannot reopen');
  const studentView = (await asUser(id(1), 'SELECT status, coordinator_response FROM public.incident_reports')).rows[0];
  assert.equal(studentView.status, 'closed');
  assert.match(studentView.coordinator_response, /Met with the company/);
  const studentNotices = (await db.query(`SELECT message FROM public.notifications WHERE receiver_user_id='${id(1)}' ORDER BY notification_date`)).rows;
  assert.equal(studentNotices.length, 2);

  await db.close();
  console.log('PASS: incident reports are confidential to the student and department Coordinator, notified without details, and move forward only.');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
