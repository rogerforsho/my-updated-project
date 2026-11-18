// Isolated PostgreSQL check: HTE evaluations are readable by the student and the department's
// Coordinator only, and are written by the service role, never by a signed-in client.
const { PGlite } = require('@electric-sql/pglite');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

async function main() {
  const migration = fs.readFileSync(path.join(__dirname, '..', 'supabase/migrations/20261118000200_hte_evaluations.sql'), 'utf8');
  const db = new PGlite();
  const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  const ratings = JSON.stringify(Object.fromEntries(['A1', 'A2', 'A3', 'B1', 'B2', 'B3', 'C1', 'C2', 'C3', 'D1', 'D2'].map(k => [k, 4])));
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
    CREATE TABLE public.companies(company_id uuid PRIMARY KEY);
    CREATE TABLE public.company_branches(branch_id uuid PRIMARY KEY);
    CREATE TABLE public.staff_capability_grants(user_id uuid, capability text, department_scope text, revoked_at timestamptz);
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
    GRANT USAGE ON SCHEMA auth, private, extensions TO authenticated, service_role;
    GRANT EXECUTE ON FUNCTION auth.uid(), private.get_my_role(), private.get_my_student_id(), private.staff_has_student(uuid) TO authenticated;
    GRANT SELECT ON public.users, public.students TO authenticated;
    INSERT INTO public.users VALUES
      ('${id(1)}','Student','active'),('${id(2)}','Student','active'),
      ('${id(3)}','Coordinator','active'),('${id(4)}','Coordinator','active'),('${id(5)}','Supervisor','active');
    INSERT INTO public.students VALUES ('${id(11)}','${id(1)}','BSIT'),('${id(12)}','${id(2)}','BSBA');
    INSERT INTO public.staff_capability_grants VALUES
      ('${id(3)}','academic_workflows','ICS',NULL),('${id(4)}','academic_workflows','IBE',NULL);
    INSERT INTO public.companies VALUES ('${id(31)}');
    INSERT INTO public.company_branches VALUES ('${id(41)}');
  `);
  await db.exec(migration);
  await db.exec(migration); // re-running must be safe

  const insert = student => `INSERT INTO public.hte_evaluations(student_id,company_id,branch_id,department_assigned,field_of_training,ratings,total_score,comments)
    VALUES ('${student}','${id(31)}','${id(41)}','IT Department','Web development','${ratings}',80,'Great placement')`;

  await db.exec('SET ROLE service_role');
  await db.query(insert(id(11)));
  await db.query(insert(id(12)));
  await assert.rejects(() => db.query(insert(id(11))), /duplicate key/, 'one evaluation per student');
  await assert.rejects(() => db.query(insert(id(11)).replace("80,'Great", "101,'Great")), /check constraint/, 'score is capped at 100');
  await db.exec('RESET ROLE');

  const visible = async user => {
    await db.exec(`SET ROLE authenticated; SET request.jwt.claim.sub='${user}'`);
    const n = (await db.query('SELECT count(*)::int AS n FROM public.hte_evaluations')).rows[0].n;
    await db.exec('RESET ROLE');
    return n;
  };
  assert.equal(await visible(id(1)), 1, 'student sees only their own evaluation');
  assert.equal(await visible(id(2)), 1, 'the other student sees only theirs');
  assert.equal(await visible(id(3)), 1, 'ICS Coordinator sees the BSIT student only');
  assert.equal(await visible(id(4)), 1, 'IBE Coordinator sees the BSBA student only');
  assert.equal(await visible(id(5)), 0, 'Supervisor sees none');

  await db.exec(`SET ROLE authenticated; SET request.jwt.claim.sub='${id(1)}'`);
  await assert.rejects(() => db.query(insert(id(11))), /permission denied/, 'clients cannot insert');
  await assert.rejects(() => db.query(`UPDATE public.hte_evaluations SET total_score=100`), /permission denied/, 'clients cannot edit');
  await assert.rejects(() => db.query(`DELETE FROM public.hte_evaluations`), /permission denied/, 'clients cannot delete');
  await db.exec('RESET ROLE');

  await db.close();
  console.log('PASS: HTE evaluations are readable by the student and department Coordinator only, written by the service role only.');
}

main().catch(error => { console.error(error); process.exit(1); });
