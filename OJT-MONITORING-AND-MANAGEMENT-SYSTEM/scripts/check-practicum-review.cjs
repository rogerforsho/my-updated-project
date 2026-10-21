const { PGlite } = require('@electric-sql/pglite');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

async function main() {
  const root = path.join(__dirname, '..');
  const name = '20261022120000_atomic_practicum_schedule_review.sql';
  const migration = fs.readFileSync(path.join(root, 'database/migrations', name), 'utf8');
  assert.equal(fs.readFileSync(path.join(root, 'supabase/migrations', name), 'utf8'), migration);
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth; CREATE SCHEMA private;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    CREATE TABLE public.users(user_id uuid PRIMARY KEY, role text, account_status text);
    CREATE TABLE public.students(student_id uuid PRIMARY KEY, course text);
    CREATE TABLE public.staff_capability_grants(user_id uuid, department_scope text, capability text, revoked_at timestamptz);
    CREATE FUNCTION private.get_my_role() RETURNS text LANGUAGE sql STABLE AS $$
      SELECT role FROM public.users WHERE user_id = auth.uid() AND account_status = 'active' $$;
    CREATE FUNCTION private.staff_has_student(p_student_id uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
      SELECT EXISTS (SELECT 1 FROM public.students s JOIN public.staff_capability_grants g
        ON g.department_scope = s.course WHERE s.student_id = p_student_id
        AND g.user_id = auth.uid() AND g.capability = 'academic_workflows' AND g.revoked_at IS NULL) $$;
    CREATE TABLE public.companies(company_id uuid PRIMARY KEY, status text);
    CREATE TABLE public.company_branches(branch_id uuid PRIMARY KEY, company_id uuid, status text);
    CREATE TABLE public.supervisors(supervisor_id uuid PRIMARY KEY, user_id uuid, company_id uuid);
    CREATE TABLE public.practicum_schedules(schedule_id uuid PRIMARY KEY, student_id uuid, status text,
      company_id uuid, branch_id uuid, start_date date, end_date date, coordinator_feedback text,
      reviewed_by uuid, reviewed_at timestamptz, updated_at timestamptz);
    CREATE TABLE public.student_assignments(assignment_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      student_id uuid, company_id uuid, branch_id uuid, supervisor_id uuid,
      start_date date, end_date date, assignment_status text);
    CREATE UNIQUE INDEX one_active_assignment ON public.student_assignments(student_id)
      WHERE assignment_status = 'active';
    CREATE TABLE public.audit_logs(actor_user_id uuid, action text, entity_type text,
      entity_id uuid, details jsonb);
    CREATE FUNCTION public.ojt_security_revision() RETURNS integer LANGUAGE sql IMMUTABLE AS $$ SELECT 43 $$;
    INSERT INTO public.users VALUES
      ('${id(1)}','Coordinator','active'), ('${id(2)}','Coordinator','active'),
      ('${id(3)}','Supervisor','active'), ('${id(4)}','Student','active'),
      ('${id(5)}','Student','active'), ('${id(6)}','Supervisor','active');
    INSERT INTO public.students VALUES ('${id(11)}','ICS'), ('${id(12)}','IBE');
    INSERT INTO public.staff_capability_grants VALUES
      ('${id(1)}','ICS','academic_workflows',NULL),
      ('${id(2)}','IBE','academic_workflows',NULL);
    INSERT INTO public.companies VALUES ('${id(20)}','active'), ('${id(21)}','active');
    INSERT INTO public.company_branches VALUES
      ('${id(30)}','${id(20)}','active'), ('${id(31)}','${id(21)}','active');
    INSERT INTO public.supervisors VALUES
      ('${id(40)}','${id(3)}','${id(20)}'), ('${id(41)}','${id(6)}','${id(21)}');
    INSERT INTO public.practicum_schedules(schedule_id,student_id,status,start_date,end_date) VALUES
      ('${id(50)}','${id(11)}','pending','2026-10-22','2026-12-22'),
      ('${id(51)}','${id(12)}','pending','2026-10-22','2026-12-22');
  `);
  await db.exec(migration);
  assert.equal((await db.query('SELECT public.ojt_security_revision() AS revision')).rows[0].revision, 44);
  assert.equal((await db.query(`SELECT has_function_privilege('anon',
    'public.coordinator_review_practicum_schedule(uuid,text,uuid,uuid,uuid,text,date,date)','EXECUTE') AS allowed`)).rows[0].allowed, false);

  async function as(actor, schedule, company, branch, supervisor) {
    await db.query(`SELECT set_config('request.jwt.claim.sub','${id(actor)}',false)`);
    return db.query(`SELECT public.coordinator_review_practicum_schedule(
      '${id(schedule)}','approve','${id(company)}','${id(branch)}','${id(supervisor)}',
      NULL,'2026-10-22',NULL)`);
  }
  const state = async (schedule) => (await db.query(`SELECT status FROM public.practicum_schedules
    WHERE schedule_id='${id(schedule)}'`)).rows[0].status;
  const assignmentCount = async () => (await db.query('SELECT count(*)::int AS n FROM public.student_assignments')).rows[0].n;

  await assert.rejects(() => as(4, 50, 20, 30, 40), /active OJT Coordinator/);
  await assert.rejects(() => as(2, 50, 20, 30, 40), /outside the Coordinator department/);
  await assert.rejects(() => as(1, 50, 20, 30, 41), /active company branch and its active Supervisor/);
  assert.equal(await state(50), 'pending');
  assert.equal(await assignmentCount(), 0);

  await as(1, 50, 20, 30, 40);
  assert.equal(await state(50), 'approved');
  assert.equal(await assignmentCount(), 1);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM public.audit_logs')).rows[0].n, 1);
  await assert.rejects(() => as(1, 50, 20, 30, 40), /already decided/);

  await db.query(`INSERT INTO public.student_assignments
    (student_id,company_id,branch_id,supervisor_id,start_date,assignment_status)
    VALUES ('${id(12)}','${id(21)}','${id(31)}','${id(41)}','2026-10-22','active')`);
  await assert.rejects(() => as(2, 51, 20, 30, 40), /Existing placement differs/);
  assert.equal(await state(51), 'pending');
  assert.equal(await assignmentCount(), 2);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM public.audit_logs')).rows[0].n, 1);
  await db.close();
  console.log('Atomic practicum review: role, department, invalid Supervisor, success, duplicate, and conflicting placement checks passed.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
