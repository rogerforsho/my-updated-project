// Isolated PostgreSQL check: a Coordinator granted only some programs (e.g. BSIT) sees and acts on those students only,
// a whole-department Coordinator is unchanged, and the department group chat stays shared.
const { PGlite } = require('@electric-sql/pglite');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

async function main() {
  const root = path.join(__dirname, '..');
  const read = name => fs.readFileSync(path.join(root, 'supabase/migrations', name), 'utf8');
  const db = new PGlite();
  const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  const ICS_ALL = id(901), BSIT_ONLY = id(902), IBE_ALL = id(903), ADMIN = id(904), SUPERVISOR = id(905);
  const BSIT_STUDENT = id(11), CPE_STUDENT = id(12), BSBA_STUDENT = id(13);
  const BSIT_USER = id(21), CPE_USER = id(22), BSBA_USER = id(23);
  const PDF = `chat/${BSIT_ONLY}/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.pdf`;
  const PDF_ALL = `chat/${ICS_ALL}/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.pdf`;

  await db.exec(`
    CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
    CREATE SCHEMA private; CREATE SCHEMA auth; CREATE SCHEMA storage;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.uid', true), '')::uuid $$;
    CREATE TABLE storage.objects(bucket_id text, name text);
    CREATE TABLE public.users(user_id uuid PRIMARY KEY, role text, account_status text DEFAULT 'active', full_name text);
    CREATE TABLE public.students(student_id uuid PRIMARY KEY, user_id uuid, course text, required_hours int);
    CREATE TABLE public.coordinators(user_id uuid PRIMARY KEY);
    CREATE TABLE public.supervisors(supervisor_id uuid PRIMARY KEY, user_id uuid);
    CREATE TABLE public.student_assignments(student_id uuid, supervisor_id uuid, assignment_status text);
    CREATE TABLE public.certificates(student_id uuid);
    CREATE TABLE public.internship_progress(student_id uuid PRIMARY KEY, completed_hours numeric, remaining_hours numeric, progress_status text, updated_at timestamptz);
    CREATE TABLE public.notifications(sender_user_id uuid, receiver_user_id uuid, message text, status text, notification_date timestamptz);
    CREATE TABLE public.reports(student_id uuid, report_type text);
    CREATE TABLE public.evaluation_appeals(student_id uuid);
    CREATE TABLE public.coordinator_documents(document_id uuid PRIMARY KEY DEFAULT gen_random_uuid(), department text, title text, file_path text, file_name text, sent_by uuid);
    CREATE TABLE public.coordinator_document_recipients(document_id uuid, student_user_id uuid);
    CREATE TABLE public.announcements(announcement_id uuid PRIMARY KEY DEFAULT gen_random_uuid(), title text, target_role text DEFAULT 'All', target_department text DEFAULT 'All');
    CREATE TABLE public.staff_capability_grants(
      user_id uuid, capability text, department_scope text, revoked_at timestamptz,
      CONSTRAINT dept_ok CHECK (department_scope IN ('ICS', 'IBE', '*')));
    CREATE FUNCTION public.ojt_security_revision() RETURNS integer LANGUAGE sql AS $$ SELECT 44 $$;
    CREATE FUNCTION public.course_department(p_course text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
      SELECT CASE WHEN upper(p_course) LIKE ANY (ARRAY['%BSIT%','%BS-CPE%','%BSCPE%']) THEN 'ICS'
                  WHEN upper(p_course) LIKE ANY (ARRAY['%BSBA%','%BSENTREP%']) THEN 'IBE' END $$;
    CREATE FUNCTION private.get_my_role() RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET row_security = off AS $$ SELECT role FROM public.users WHERE user_id = auth.uid() $$;
    CREATE FUNCTION private.is_supervisor_reviewed_type(t text) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
    -- The department-level helpers keep their real shape: they are deliberately not changed by the program migration.
    CREATE FUNCTION private.staff_has_department(p_department text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET row_security = off AS $$
      SELECT EXISTS (SELECT 1 FROM public.users u JOIN public.staff_capability_grants g ON g.user_id = u.user_id
        WHERE u.user_id = auth.uid() AND u.role = 'Coordinator' AND g.capability = 'academic_workflows' AND g.revoked_at IS NULL
          AND g.department_scope = upper(trim(p_department))) $$;
    CREATE FUNCTION private.staff_has_course(p_course text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET row_security = off AS $$
      SELECT private.staff_has_department(public.course_department(p_course)) $$;
    CREATE FUNCTION public.group_chat_has_member(p_user_id uuid, p_department text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET row_security = off AS $$
      SELECT EXISTS (SELECT 1 FROM public.users u JOIN public.staff_capability_grants g ON g.user_id = u.user_id
        WHERE u.user_id = p_user_id AND u.role = 'Coordinator' AND g.capability = 'academic_workflows' AND g.revoked_at IS NULL
          AND g.department_scope = upper(trim(p_department))) $$;
    GRANT USAGE ON SCHEMA auth, private TO authenticated, service_role;
    GRANT SELECT ON public.users, public.staff_capability_grants, public.students TO authenticated;
    GRANT ALL ON public.announcements TO authenticated;
    SET check_function_bodies = off;
  `);
  await db.exec(read('20261108000100_required_hours_per_program.sql'));
  await db.exec(read('20261122000100_coordinator_program_target_hours.sql'));

  await db.exec(`
    INSERT INTO public.users(user_id, role, full_name) VALUES
      ('${ICS_ALL}', 'Coordinator', 'ICS Coordinator'), ('${BSIT_ONLY}', 'Coordinator', 'BSIT Coordinator'), ('${IBE_ALL}', 'Coordinator', 'IBE Coordinator'),
      ('${ADMIN}', 'Admin', 'Admin'), ('${SUPERVISOR}', 'Supervisor', 'Supervisor'),
      ('${BSIT_USER}', 'Student', 'BSIT Student'), ('${CPE_USER}', 'Student', 'CPE Student'), ('${BSBA_USER}', 'Student', 'BSBA Student');
    INSERT INTO public.coordinators VALUES ('${ICS_ALL}'), ('${BSIT_ONLY}'), ('${IBE_ALL}');
    INSERT INTO public.students VALUES
      ('${BSIT_STUDENT}', '${BSIT_USER}', 'BSIT', 486), ('${CPE_STUDENT}', '${CPE_USER}', 'BS-CPE', 240), ('${BSBA_STUDENT}', '${BSBA_USER}', 'BSBA-HRM', 300);
    INSERT INTO public.supervisors VALUES ('${id(31)}', '${SUPERVISOR}'), ('${id(32)}', '${id(906)}');
    INSERT INTO public.users(user_id, role, full_name) VALUES ('${id(906)}', 'Supervisor', 'Second Supervisor');
    -- SUPERVISOR mentors the BS-CPE student only; the second Supervisor mentors the BSIT student.
    INSERT INTO public.student_assignments VALUES ('${CPE_STUDENT}', '${id(31)}', 'active'), ('${BSIT_STUDENT}', '${id(32)}', 'active');
    INSERT INTO storage.objects VALUES ('private-documents', '${PDF}'), ('private-documents', '${PDF_ALL}');
    INSERT INTO public.staff_capability_grants(user_id, capability, department_scope) VALUES
      ('${ICS_ALL}', 'academic_workflows', 'ICS'), ('${ICS_ALL}', 'department_reports', 'ICS'),
      ('${BSIT_ONLY}', 'academic_workflows', 'ICS'), ('${BSIT_ONLY}', 'department_reports', 'ICS'),
      ('${IBE_ALL}', 'academic_workflows', 'IBE'), ('${IBE_ALL}', 'department_reports', 'IBE');
    INSERT INTO public.announcements(title, target_department) VALUES ('Department-wide', 'ICS');
  `);

  const migration = read('20261123000100_coordinator_program_scope.sql');
  await db.exec(migration);
  await db.exec(migration); // reapplying must be safe

  const as = (uid, role = 'authenticated') => db.exec(`SET ROLE ${role}; SELECT set_config('test.uid', '${uid ?? ''}', false)`);
  const reset = () => db.exec(`RESET ROLE; SELECT set_config('test.uid', '', false)`);
  const scalar = async (sql, params) => Object.values((await db.query(sql, params)).rows[0])[0];
  await reset();
  await db.exec(`UPDATE public.staff_capability_grants SET program_scope = ARRAY['BSIT'] WHERE user_id = '${BSIT_ONLY}'`);

  // The column only accepts the programs of its own department, and never an empty list.
  for (const bad of [`('${ICS_ALL}', 'academic_workflows', 'ICS', ARRAY['BSENTREP'])`, `('${ICS_ALL}', 'academic_workflows', 'ICS', ARRAY[]::text[])`, `('${IBE_ALL}', 'academic_workflows', 'IBE', ARRAY['BSIT'])`]) {
    await assert.rejects(db.exec(`INSERT INTO public.staff_capability_grants(user_id, capability, department_scope, program_scope) VALUES ${bad}`), /program_scope_valid/);
  }
  await db.exec(`UPDATE public.staff_capability_grants SET program_scope = ARRAY['BS-CPE'] WHERE user_id = '${ICS_ALL}' AND capability = 'department_reports'`);
  await db.exec(`UPDATE public.staff_capability_grants SET program_scope = NULL WHERE user_id = '${ICS_ALL}'`);

  // The main switch: who covers which course.
  const covers = async (uid, course) => { await as(uid); const r = await scalar('SELECT private.staff_has_course($1)', [course]); await reset(); return r; };
  assert.equal(await covers(ICS_ALL, 'BSIT'), true, 'a whole-ICS Coordinator keeps BSIT');
  assert.equal(await covers(ICS_ALL, 'BS-CPE'), true, 'a whole-ICS Coordinator keeps BS-CPE');
  assert.equal(await covers(ICS_ALL, 'BSBA-HRM'), false);
  assert.equal(await covers(BSIT_ONLY, 'BSIT'), true);
  assert.equal(await covers(BSIT_ONLY, 'BS-CPE'), false, 'a BSIT-only Coordinator does not cover BS-CPE');
  assert.equal(await covers(BSIT_ONLY, 'BSBA-HRM'), false);
  assert.equal(await covers(IBE_ALL, 'BSBA-HRM'), true);
  assert.equal(await covers(ADMIN, 'BSIT'), false);

  // Target Hours follow the programs too.
  await as(BSIT_ONLY);
  assert.deepEqual((await db.query('SELECT course FROM public.program_target_hours ORDER BY course')).rows.map(r => r.course), ['BSIT'], 'sees only BSIT hours');
  await assert.rejects(db.query(`SELECT public.set_program_target_hours('BS-CPE', 250)`), /not granted/);
  assert.equal(await scalar(`SELECT public.count_students_following_target_hours('BS-CPE')`), 0);
  assert.equal(await scalar(`SELECT public.set_program_target_hours('BSIT', 500)`), 1, 'can set the BSIT hours');
  await as(ICS_ALL);
  assert.deepEqual((await db.query('SELECT course FROM public.program_target_hours ORDER BY course')).rows.map(r => r.course), ['BS-CPE', 'BSIT'], 'whole ICS still sees both');
  await reset();

  // Coordinator <-> Supervisor chat only through students of the Coordinator's programs.
  const eligible = async (coordinator, supervisor) => scalar('SELECT public.chat_pair_is_eligible($1, $2)', [coordinator, supervisor]);
  assert.equal(await eligible(ICS_ALL, SUPERVISOR), true, 'whole ICS can chat with the BS-CPE mentor');
  assert.equal(await eligible(BSIT_ONLY, SUPERVISOR), false, 'BSIT-only cannot chat with a mentor who has only BS-CPE students');
  assert.equal(await eligible(BSIT_ONLY, id(906)), true, 'BSIT-only can chat with the BSIT mentor');
  assert.equal(await scalar('SELECT public.chat_student_is_taggable($1, $2, $3)', [BSIT_ONLY, id(906), BSIT_STUDENT]), true);
  assert.equal(await scalar('SELECT public.chat_student_is_taggable($1, $2, $3)', [BSIT_ONLY, SUPERVISOR, CPE_STUDENT]), false);

  // Notifications reach only the Coordinators who cover the student.
  await db.exec(`
    CREATE TRIGGER t_report AFTER INSERT ON public.reports FOR EACH ROW EXECUTE FUNCTION public.notify_report_submitted();
    CREATE TRIGGER t_appeal AFTER INSERT ON public.evaluation_appeals FOR EACH ROW EXECUTE FUNCTION public.notify_evaluation_appeal();
    INSERT INTO public.reports VALUES ('${CPE_STUDENT}', 'Pre-deployment Requirements');
    INSERT INTO public.evaluation_appeals VALUES ('${CPE_STUDENT}');
  `);
  const notified = async () => (await db.query('SELECT DISTINCT receiver_user_id FROM public.notifications')).rows.map(r => r.receiver_user_id).sort();
  assert.deepEqual(await notified(), [ICS_ALL], 'a BS-CPE report and appeal notify the whole-ICS Coordinator, not the BSIT-only one');
  await db.exec(`DELETE FROM public.notifications; INSERT INTO public.reports VALUES ('${BSIT_STUDENT}', 'Pre-deployment Requirements')`);
  assert.deepEqual(await notified(), [ICS_ALL, BSIT_ONLY].sort(), 'a BSIT report notifies both ICS Coordinators');

  // Documents: "everyone" means the sender's programs; a student outside them is refused.
  const send = (sender, p, ids) => db.query(`SELECT * FROM public.send_coordinator_document($1, 'ICS', 'Memo', $2, 'memo.pdf', $3)`, [sender, p, ids]);
  const toAll = await send(BSIT_ONLY, PDF, null);
  assert.equal(toAll.rows[0].recipient_count, 1, 'a BSIT-only Coordinator reaches only BSIT students');
  assert.deepEqual((await db.query('SELECT student_user_id FROM public.coordinator_document_recipients')).rows.map(r => r.student_user_id), [BSIT_USER]);
  await assert.rejects(send(BSIT_ONLY, PDF, [CPE_USER]), /Recipients must be active students/, 'cannot name a BS-CPE student');
  assert.equal((await send(ICS_ALL, PDF_ALL, null)).rows[0].recipient_count, 2, 'a whole-ICS Coordinator reaches BSIT and BS-CPE');
  await assert.rejects(send(IBE_ALL, PDF_ALL, null), /Only a Coordinator of this department/, 'department rule unchanged');

  // The department group chat stays shared by the whole department.
  assert.equal(await scalar('SELECT public.group_chat_has_member($1, $2)', [BSIT_ONLY, 'ICS']), true, 'BSIT-only is still in the ICS group chat');
  assert.equal(await scalar('SELECT public.group_chat_has_member($1, $2)', [BSIT_ONLY, 'IBE']), false);

  // Announcements: a program-targeted row is visible only to that program's students and Coordinators.
  await db.exec(`
    ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
    CREATE POLICY open_read ON public.announcements FOR SELECT TO authenticated USING (true);
    CREATE POLICY open_write ON public.announcements FOR ALL TO authenticated USING (true) WITH CHECK (true);
    INSERT INTO public.announcements(title, target_department, target_program) VALUES ('BSIT only', 'ICS', 'BSIT'), ('CPE only', 'ICS', 'BS-CPE');
  `);
  const titles = async uid => { await as(uid); const r = (await db.query('SELECT title FROM public.announcements ORDER BY title')).rows.map(x => x.title); await reset(); return r; };
  assert.deepEqual(await titles(BSIT_USER), ['BSIT only', 'Department-wide'], 'a BSIT student does not see the BS-CPE announcement');
  assert.deepEqual(await titles(CPE_USER), ['CPE only', 'Department-wide']);
  assert.deepEqual(await titles(BSIT_ONLY), ['BSIT only', 'Department-wide']);
  assert.deepEqual(await titles(ICS_ALL), ['BSIT only', 'CPE only', 'Department-wide']);
  assert.deepEqual(await titles(ADMIN), ['BSIT only', 'CPE only', 'Department-wide']);
  await as(BSIT_ONLY);
  await assert.rejects(db.exec(`INSERT INTO public.announcements(title, target_department, target_program) VALUES ('Sneaky', 'ICS', 'BS-CPE')`), /row-level security/);
  await db.exec(`INSERT INTO public.announcements(title, target_department, target_program) VALUES ('Mine', 'ICS', 'BSIT')`);
  await reset();
  await assert.rejects(db.exec(`INSERT INTO public.announcements(title, target_program) VALUES ('Bad', 'BSA')`), /announcements_target_program_valid/);

  assert.equal(await scalar('SELECT public.ojt_security_revision()'), 46);
  console.log('PASS: a Coordinator limited to some programs sees, notifies and sends to those programs only; whole-department Coordinators and the department group chat are unchanged.');
}

main().catch(error => { console.error(error); process.exit(1); });
