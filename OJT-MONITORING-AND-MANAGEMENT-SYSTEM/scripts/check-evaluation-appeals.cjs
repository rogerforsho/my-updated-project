// Isolated PostgreSQL check for immutable evaluations and department-scoped appeals.
const { PGlite } = require('@electric-sql/pglite');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

async function main() {
  const root = path.join(__dirname, '..');
  const migration = fs.readFileSync(path.join(root, 'database/migrations/20261020220000_evaluation_appeals.sql'), 'utf8');
  assert.equal(fs.readFileSync(path.join(root, 'supabase/migrations/20261020220000_evaluation_appeals.sql'), 'utf8'), migration);
  const db = new PGlite();
  const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  await db.exec(`
    CREATE ROLE anon NOLOGIN;
    CREATE ROLE authenticated NOLOGIN;
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE SCHEMA private;
    CREATE SCHEMA extensions;
    CREATE FUNCTION extensions.uuid_generate_v4() RETURNS uuid LANGUAGE sql VOLATILE AS $$ SELECT gen_random_uuid() $$;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    CREATE TABLE public.users(user_id uuid PRIMARY KEY, role text, account_status text);
    CREATE TABLE public.students(student_id uuid PRIMARY KEY, user_id uuid, course text);
    CREATE TABLE public.evaluations(evaluation_id uuid PRIMARY KEY, student_id uuid, performance_score numeric, evaluation_type text, feedback text);
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
    GRANT USAGE ON SCHEMA auth, private, extensions TO authenticated;
    GRANT EXECUTE ON FUNCTION auth.uid(), private.get_my_role(), private.get_my_student_id(), private.staff_has_student(uuid) TO authenticated;
    GRANT SELECT ON public.users, public.students TO authenticated;
    GRANT SELECT ON public.evaluations TO authenticated;
    INSERT INTO public.users VALUES
      ('${id(1)}','Student','active'),('${id(2)}','Student','active'),
      ('${id(3)}','Coordinator','active'),('${id(4)}','Coordinator','active');
    INSERT INTO public.students VALUES ('${id(11)}','${id(1)}','BSIT'),('${id(12)}','${id(2)}','BSBA');
    INSERT INTO public.evaluations VALUES
      ('${id(21)}','${id(11)}',60,'final','Original supervisor feedback'),
      ('${id(22)}','${id(12)}',55,'final','Other student feedback');
    INSERT INTO public.staff_capability_grants VALUES
      ('${id(3)}','academic_workflows','ICS',NULL),('${id(4)}','academic_workflows','IBE',NULL);
  `);
  await db.exec(migration);
  await db.exec(migration);

  await db.exec(`SET ROLE authenticated; SET request.jwt.claim.sub='${id(1)}'`);
  await db.query(`INSERT INTO public.evaluation_appeals(evaluation_id,student_id,submitted_by,appeal_reason,supporting_details)
    VALUES ('${id(21)}','${id(11)}','${id(1)}','The final rating does not reflect the submitted work.','My weekly reports show the completed project scope.')`);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM public.evaluation_appeals')).rows[0].n, 1);
  await assert.rejects(() => db.query(`INSERT INTO public.evaluation_appeals(evaluation_id,student_id,submitted_by,appeal_reason)
    VALUES ('${id(22)}','${id(11)}','${id(1)}','The final rating does not reflect my submitted work.')`), /Evaluation does not belong/);
  await assert.rejects(() => db.query(`INSERT INTO public.evaluation_appeals(evaluation_id,student_id,submitted_by,appeal_reason)
    VALUES ('${id(21)}','${id(11)}','${id(1)}','A second pending appeal must fail.')`), /duplicate key/);
  await assert.rejects(() => db.query(`UPDATE public.evaluations SET performance_score=99 WHERE evaluation_id='${id(21)}'`), /permission denied/);
  await db.exec('RESET ROLE');

  await db.exec(`SET ROLE authenticated; SET request.jwt.claim.sub='${id(3)}'`);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM public.evaluation_appeals')).rows[0].n, 1);
  const decision = await db.query(`UPDATE public.evaluation_appeals SET status='adjusted',resolved_score=82,
    decision_reason='Reviewed the additional evidence and rubric.',decided_by=auth.uid()
    WHERE evaluation_id='${id(21)}' RETURNING decided_at`);
  assert.ok(decision.rows[0].decided_at);
  const secondDecision = await db.query(`UPDATE public.evaluation_appeals SET status='upheld',resolved_score=NULL,
    decision_reason='Changed my mind.',decided_by=auth.uid() WHERE evaluation_id='${id(21)}' RETURNING appeal_id`);
  assert.equal(secondDecision.rows.length, 0, 'a decided appeal cannot be changed again');
  assert.equal(Number((await db.query(`SELECT performance_score FROM public.evaluations WHERE evaluation_id='${id(21)}'`)).rows[0].performance_score), 60);
  assert.equal(Number((await db.query(`SELECT resolved_score FROM public.evaluation_appeals WHERE evaluation_id='${id(21)}'`)).rows[0].resolved_score), 82);
  await db.exec('RESET ROLE');

  await db.exec(`SET ROLE authenticated; SET request.jwt.claim.sub='${id(4)}'`);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM public.evaluation_appeals')).rows[0].n, 0, 'other department cannot see this appeal');
  await db.exec('RESET ROLE');
  assert.equal((await db.query(`SELECT count(*)::int AS n FROM public.notifications WHERE receiver_user_id='${id(1)}'`)).rows[0].n, 1);
  await db.close();
  console.log('PASS: evaluation appeals are department-scoped, single-decision, notified, and preserve original evaluation scores.');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
