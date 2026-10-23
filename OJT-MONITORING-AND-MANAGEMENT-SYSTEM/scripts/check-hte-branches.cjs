const { PGlite } = require('@electric-sql/pglite');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const ids = Array.from({ length: 10 }, (_, i) => `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`);
async function main() {
  const root = path.join(__dirname, '..');
  const migration = fs.readFileSync(path.join(root, 'database/migrations/20261020230000_hte_branches_and_requests.sql'), 'utf8');
  assert.equal(fs.readFileSync(path.join(root, 'supabase/migrations/20261020230000_hte_branches_and_requests.sql'), 'utf8'), migration);
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
    CREATE SCHEMA extensions; CREATE FUNCTION extensions.uuid_generate_v4() RETURNS uuid LANGUAGE sql AS 'SELECT gen_random_uuid()';
    CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    CREATE SCHEMA private;
    CREATE TABLE public.users(user_id uuid PRIMARY KEY, role text, account_status text);
    CREATE TABLE public.students(student_id uuid PRIMARY KEY, user_id uuid UNIQUE REFERENCES public.users(user_id), course text NOT NULL);
    CREATE TABLE public.staff_capability_grants(user_id uuid, capability text, department_scope text, revoked_at timestamptz);
    CREATE FUNCTION private.get_my_role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT role FROM public.users WHERE user_id = auth.uid() $$;
    CREATE FUNCTION private.get_my_student_id() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT student_id FROM public.students WHERE user_id = auth.uid() $$;
    CREATE FUNCTION private.course_department(p_course text) RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT CASE WHEN p_course = 'ICS' THEN 'ICS' ELSE 'IBE' END $$;
    CREATE FUNCTION private.staff_has_course(p_course text) RETURNS boolean LANGUAGE sql STABLE AS $$
      SELECT EXISTS (SELECT 1 FROM public.staff_capability_grants g WHERE g.user_id = auth.uid()
        AND g.capability = 'academic_workflows' AND g.revoked_at IS NULL
        AND g.department_scope = private.course_department(p_course))
    $$;
    CREATE FUNCTION private.staff_has_student(p_id uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
      SELECT private.get_my_role() = 'Coordinator' AND EXISTS (
        SELECT 1 FROM public.students s WHERE s.student_id = p_id AND private.staff_has_course(s.course)
      )
    $$;
    GRANT USAGE ON SCHEMA auth, private TO authenticated;
    GRANT EXECUTE ON FUNCTION auth.uid(), private.get_my_role(), private.get_my_student_id(), private.course_department(text), private.staff_has_course(text), private.staff_has_student(uuid) TO authenticated;
    GRANT SELECT ON public.users, public.students, public.staff_capability_grants TO authenticated;
    CREATE TABLE public.companies(
      company_id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(), company_name text NOT NULL, address text NOT NULL,
      contact_person text NOT NULL, contact_email text NOT NULL, contact_number text NOT NULL, status text NOT NULL,
      latitude numeric, longitude numeric, geofence_radius_meters integer DEFAULT 150, geofence_enabled boolean DEFAULT false
    );
    CREATE TABLE public.student_assignments(
      assignment_id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(), student_id uuid NOT NULL REFERENCES public.students(student_id),
      company_id uuid NOT NULL REFERENCES public.companies(company_id), branch_id uuid, supervisor_id uuid NOT NULL,
      start_date date NOT NULL, end_date date, assignment_status text NOT NULL, created_at timestamptz DEFAULT now()
    );
    CREATE FUNCTION private.student_owns_company_branch(p_branch_id uuid, p_company_id uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE
      SET search_path = public SET row_security = off AS $$
        SELECT private.get_my_role()='Student' AND EXISTS (SELECT 1 FROM public.student_assignments sa
          WHERE sa.student_id=private.get_my_student_id() AND sa.branch_id=p_branch_id AND sa.company_id=p_company_id)
      $$;
    GRANT EXECUTE ON FUNCTION private.student_owns_company_branch(uuid, uuid) TO authenticated;
    CREATE TABLE public.supervisors(supervisor_id uuid PRIMARY KEY, user_id uuid NOT NULL);
    INSERT INTO public.supervisors VALUES ('${ids[4]}','${ids[5]}');
    CREATE FUNCTION private.get_my_supervisor_id() RETURNS uuid LANGUAGE sql SECURITY DEFINER STABLE
      SET search_path = public SET row_security = off AS $$
      SELECT supervisor_id FROM public.supervisors WHERE user_id=auth.uid()
    $$;
    CREATE FUNCTION private.supervisor_has_active_student(p_id uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE
      SET search_path = public SET row_security = off AS $$
        SELECT EXISTS (SELECT 1 FROM public.student_assignments sa JOIN public.supervisors sp ON sp.supervisor_id=sa.supervisor_id
          WHERE sa.student_id=p_id AND sa.assignment_status='active' AND sp.user_id=auth.uid())
      $$;
    GRANT EXECUTE ON FUNCTION private.supervisor_has_active_student(uuid), private.get_my_supervisor_id() TO authenticated;
    CREATE TABLE public.practicum_schedules(
      schedule_id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(), student_id uuid NOT NULL REFERENCES public.students(student_id),
      company_id uuid REFERENCES public.companies(company_id), start_date date NOT NULL, work_modality text DEFAULT 'on_site', status text DEFAULT 'pending'
    );
    CREATE TABLE public.notifications(receiver_user_id uuid, message text, status text, notification_date timestamptz);
    CREATE TABLE public.audit_logs(actor_user_id uuid, action text, entity_type text, entity_id text, details jsonb);
    INSERT INTO public.users VALUES
      ('${ids[0]}','Student','active'), ('${ids[1]}','Coordinator','active'), ('${ids[5]}','Supervisor','active'), ('${ids[6]}','Admin','active'), ('${ids[7]}','Coordinator','active');
    INSERT INTO public.students VALUES ('${ids[2]}','${ids[0]}','ICS'), ('${ids[8]}','${ids[7]}','IBE');
    INSERT INTO public.staff_capability_grants VALUES ('${ids[1]}','academic_workflows','ICS',NULL), ('${ids[7]}','academic_workflows','IBE',NULL);
    INSERT INTO public.companies(company_id,company_name,address,contact_person,contact_email,contact_number,status)
      VALUES ('${ids[3]}','Legacy HTE','1 Legacy Road','Legacy Contact','legacy@example.test','0000','active');
    INSERT INTO public.student_assignments(student_id,company_id,supervisor_id,start_date,assignment_status)
      VALUES ('${ids[8]}','${ids[3]}','${ids[4]}','2026-10-01','active');
    INSERT INTO public.companies(company_id,company_name,address,contact_person,contact_email,contact_number,status)
      VALUES ('${ids[4]}','ICS-only HTE','4 ICS Road','ICS Contact','ics@example.test','4444','active');
    INSERT INTO public.student_assignments(student_id,company_id,supervisor_id,start_date,assignment_status)
      VALUES ('${ids[2]}','${ids[4]}','${ids[7]}','2026-10-01','active');
    INSERT INTO public.companies(company_id,company_name,address,contact_person,contact_email,contact_number,status)
      VALUES ('${ids[9]}','Shared HTE','9 Shared Road','Shared Contact','shared@example.test','9999','active');
    INSERT INTO public.student_assignments(student_id,company_id,supervisor_id,start_date,assignment_status)
      VALUES ('${ids[2]}','${ids[9]}','${ids[4]}','2026-10-01','active'), ('${ids[8]}','${ids[9]}','${ids[4]}','2026-10-01','active');
    INSERT INTO public.practicum_schedules(student_id,company_id,start_date,status)
      VALUES ('${ids[2]}','${ids[4]}','2026-10-01','pending');
    GRANT SELECT ON public.companies, public.student_assignments TO authenticated;
  `);
  await db.exec(migration);
  const serviceReadMigration = fs.readdirSync(path.join(root, 'supabase/migrations')).find(name => name.endsWith('_attendance_branch_service_read.sql'));
  assert.ok(serviceReadMigration);
  const serviceReadSql = fs.readFileSync(path.join(root, 'supabase/migrations', serviceReadMigration), 'utf8');
  assert.equal(serviceReadSql, fs.readFileSync(path.join(root, 'database/migrations', serviceReadMigration), 'utf8'));
  await db.exec(serviceReadSql);
  await db.exec(serviceReadSql);
  assert.equal((await db.query("SELECT has_table_privilege('service_role', 'public.company_branches', 'SELECT') AS allowed")).rows[0].allowed, true);
  assert.equal((await db.query("SELECT has_table_privilege('service_role', 'public.company_branches', 'UPDATE') AS allowed")).rows[0].allowed, false);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM public.company_branches')).rows[0].n, 3);
  assert.equal((await db.query('SELECT branch_id IS NOT NULL AS ok FROM public.student_assignments')).rows[0].ok, true);
  await db.exec(`UPDATE public.companies SET address='Updated legacy address', latitude=14.7, longitude=121.1, geofence_enabled=true WHERE company_id='${ids[3]}'`);
  const syncedBranch = await db.query(`SELECT address, latitude, geofence_enabled FROM public.company_branches WHERE company_id='${ids[3]}' AND is_primary`);
  assert.equal(syncedBranch.rows[0].address, 'Updated legacy address');
  assert.equal(Number(syncedBranch.rows[0].latitude), 14.7);
  assert.equal(syncedBranch.rows[0].geofence_enabled, true);
  const sharedBranch = (await db.query(`SELECT branch_id FROM public.company_branches WHERE company_id='${ids[3]}' AND is_primary`)).rows[0].branch_id;
  const icsBranch = (await db.query(`SELECT branch_id FROM public.company_branches WHERE company_id='${ids[4]}' AND is_primary`)).rows[0].branch_id;
  const mixedBranch = (await db.query(`SELECT branch_id FROM public.company_branches WHERE company_id='${ids[9]}' AND is_primary`)).rows[0].branch_id;
  await db.exec(`ALTER TABLE public.student_assignments ENABLE ROW LEVEL SECURITY;
    CREATE POLICY assignment_scope_test ON public.student_assignments FOR SELECT TO authenticated USING (private.staff_has_student(student_id));
    CREATE POLICY assignment_supervisor_scope_test ON public.student_assignments FOR SELECT TO authenticated USING (private.supervisor_has_active_student(student_id));`);
  await db.exec(`SELECT set_config('request.jwt.claim.sub','${ids[1]}',false); SET ROLE authenticated;`);
  assert.equal((await db.query(`SELECT count(*)::int AS n FROM public.company_branches WHERE branch_id='${sharedBranch}'`)).rows[0].n, 0);
  await db.exec(`UPDATE public.company_branches SET address='ICS overwrite' WHERE branch_id='${sharedBranch}'`);
  await db.exec('RESET ROLE');
  assert.equal((await db.query(`SELECT address FROM public.company_branches WHERE branch_id='${sharedBranch}'`)).rows[0].address, 'Updated legacy address');
  await db.exec('SET ROLE authenticated');
  await db.exec(`UPDATE public.company_branches SET address='ICS scoped edit' WHERE branch_id='${icsBranch}'`);
  assert.equal((await db.query(`SELECT address FROM public.company_branches WHERE branch_id='${icsBranch}'`)).rows[0].address, 'ICS scoped edit');
  await db.exec(`UPDATE public.company_branches SET address='ICS mixed overwrite' WHERE branch_id='${mixedBranch}'`);
  await db.exec('RESET ROLE');
  assert.equal((await db.query(`SELECT address FROM public.company_branches WHERE branch_id='${mixedBranch}'`)).rows[0].address, '9 Shared Road');
  const scopedSchedule = await db.query(`INSERT INTO public.practicum_schedules(student_id,company_id,start_date,status)
    VALUES ('${ids[2]}','${ids[9]}','2026-10-01','pending') RETURNING schedule_id`);
  await db.exec(`SELECT set_config('request.jwt.claim.sub','${ids[1]}',false); SET ROLE authenticated;`);
  const branchInsert = await db.query(`INSERT INTO public.company_branches(company_id,branch_name,address)
    VALUES ('${ids[9]}','ICS Annex','10 Shared Road') RETURNING branch_id`);
  const unassignedBranch = branchInsert.rows[0].branch_id;
  await db.exec(`UPDATE public.company_branches SET address='Pending placement edit' WHERE branch_id='${unassignedBranch}'; RESET ROLE;`);
  assert.equal((await db.query(`SELECT address FROM public.company_branches WHERE branch_id='${unassignedBranch}'`)).rows[0].address, 'Pending placement edit');
  await db.query(`DELETE FROM public.practicum_schedules WHERE schedule_id='${scopedSchedule.rows[0].schedule_id}'`);
  await db.exec(`SELECT set_config('request.jwt.claim.sub','${ids[1]}',false); SET ROLE authenticated;`);
  assert.equal((await db.query(`SELECT private.coordinator_can_manage_company_branch('${unassignedBranch}','${ids[9]}') AS ok`)).rows[0].ok, false);
  await db.exec(`UPDATE public.company_branches SET address='No placement edit' WHERE branch_id='${unassignedBranch}'; RESET ROLE;`);
  assert.equal((await db.query(`SELECT address FROM public.company_branches WHERE branch_id='${unassignedBranch}'`)).rows[0].address, 'Pending placement edit');
  await db.exec(`SELECT set_config('request.jwt.claim.sub','${ids[1]}',false); SET ROLE authenticated;`);
  await db.exec(`RESET ROLE; SELECT set_config('request.jwt.claim.sub','${ids[7]}',false); SET ROLE authenticated;`);
  assert.equal((await db.query(`SELECT count(*)::int AS n FROM public.company_branches WHERE branch_id='${sharedBranch}'`)).rows[0].n, 1);
  await db.exec('RESET ROLE');
  await db.exec(`SELECT set_config('request.jwt.claim.sub','${ids[0]}',false); SET ROLE authenticated;`);
  assert.equal((await db.query(`SELECT count(*)::int AS n FROM public.company_branches WHERE branch_id='${icsBranch}'`)).rows[0].n, 1);
  assert.equal((await db.query(`SELECT count(*)::int AS n FROM public.company_branches WHERE branch_id='${mixedBranch}'`)).rows[0].n, 1);
  assert.equal((await db.query(`SELECT count(*)::int AS n FROM public.company_branches WHERE branch_id='${sharedBranch}'`)).rows[0].n, 0);
  await db.exec(`RESET ROLE; SELECT set_config('request.jwt.claim.sub','${ids[5]}',false); SET ROLE authenticated;`);
  assert.equal((await db.query(`SELECT count(*)::int AS n FROM public.company_branches WHERE branch_id='${sharedBranch}'`)).rows[0].n, 1);
  assert.equal((await db.query(`SELECT count(*)::int AS n FROM public.company_branches WHERE branch_id='${icsBranch}'`)).rows[0].n, 0);
  await db.exec('RESET ROLE');
  await db.exec(`UPDATE public.student_assignments SET assignment_status='completed' WHERE student_id='${ids[8]}' AND company_id='${ids[3]}'`);
  await db.exec(`SELECT set_config('request.jwt.claim.sub','${ids[5]}',false); SET ROLE authenticated;`);
  assert.equal((await db.query(`SELECT count(*)::int AS n FROM public.company_branches WHERE branch_id='${sharedBranch}'`)).rows[0].n, 0);
  await db.exec('RESET ROLE');
  assert.equal((await db.query("SELECT has_table_privilege('authenticated','public.company_requests','UPDATE') AS ok")).rows[0].ok, false);
  await db.exec(`SELECT set_config('request.jwt.claim.sub','${ids[0]}',false); SET ROLE authenticated;`);
  const inserted = await db.query(`INSERT INTO public.company_requests(
      student_id,submitted_by,requested_company_name,company_address,contact_person,contact_email,contact_number,requested_branch_name,branch_address,business_permit_path
    ) VALUES ('${ids[2]}','${ids[0]}','New HTE','2 New Road','New Contact','new@example.test','123456','North Branch','3 North Road','${ids[0]}/reports/permit.pdf') RETURNING request_id`);
  const requestId = inserted.rows[0].request_id;
  assert.equal((await db.query(`SELECT count(*)::int AS n FROM public.company_requests WHERE request_id='${requestId}'`)).rows[0].n, 1);
  await assert.rejects(() => db.exec(`UPDATE public.company_requests SET status='rejected' WHERE request_id='${requestId}'`));
  await db.exec(`SELECT set_config('request.jwt.claim.sub','${ids[5]}',false);`);
  assert.equal((await db.query(`SELECT count(*)::int AS n FROM public.company_requests WHERE request_id='${requestId}'`)).rows[0].n, 0);
  await db.exec(`SELECT set_config('request.jwt.claim.sub','${ids[6]}',false);`);
  assert.equal((await db.query(`SELECT count(*)::int AS n FROM public.company_requests WHERE request_id='${requestId}'`)).rows[0].n, 0);
  await db.exec(`RESET ROLE; SELECT set_config('request.jwt.claim.sub','${ids[1]}',false); SET ROLE authenticated;`);
  const decision = await db.query(`SELECT public.review_company_request('${requestId}','approve',NULL,14.7315,121.115,150) AS result`);
  assert.equal(decision.rows[0].result, 'ok');
  await db.exec('RESET ROLE');
  const approved = await db.query(`SELECT status, company_id, branch_id FROM public.company_requests WHERE request_id='${requestId}'`);
  assert.equal(approved.rows[0].status, 'approved');
  assert.ok(approved.rows[0].company_id && approved.rows[0].branch_id);
  await assert.rejects(() => db.exec(`INSERT INTO public.student_assignments(student_id,company_id,branch_id,supervisor_id,start_date,assignment_status) VALUES ('${ids[2]}','${ids[3]}','${approved.rows[0].branch_id}','${ids[4]}','2026-10-02','active')`), /student_assignments_company_branch_fkey/);
  assert.equal((await db.query(`SELECT count(*)::int AS n FROM public.notifications WHERE receiver_user_id='${ids[0]}'`)).rows[0].n, 1);
  assert.equal((await db.query(`SELECT count(*)::int AS n FROM public.audit_logs WHERE action='HTE_REQUEST_APPROVE'`)).rows[0].n, 1);
  // Radius 30..50 migration: clamps legacy rows, then enforces the range in the table and the RPC.
  const radiusMigration = fs.readFileSync(path.join(root, 'database/migrations/20261024000700_limit_geofence_radius_30_50.sql'), 'utf8');
  assert.equal(fs.readFileSync(path.join(root, 'supabase/migrations/20261024000700_limit_geofence_radius_30_50.sql'), 'utf8'), radiusMigration);
  await db.exec(`UPDATE public.companies SET geofence_radius_meters = 60 WHERE company_id='${ids[3]}';
    UPDATE public.company_branches SET geofence_radius_meters = 4000 WHERE company_id='${ids[4]}' AND is_primary;`);
  await db.exec(radiusMigration);
  assert.equal((await db.query(`SELECT geofence_radius_meters AS r FROM public.companies WHERE company_id='${ids[3]}'`)).rows[0].r, 50);
  assert.equal((await db.query(`SELECT geofence_radius_meters AS r FROM public.company_branches WHERE company_id='${ids[4]}' AND is_primary`)).rows[0].r, 50);
  assert.equal((await db.query(`SELECT count(*)::int AS n FROM public.company_branches WHERE geofence_radius_meters NOT BETWEEN 30 AND 50`)).rows[0].n, 0);
  for (const bad of [29, 51]) await assert.rejects(() => db.exec(`UPDATE public.company_branches SET geofence_radius_meters = ${bad} WHERE company_id='${ids[4]}'`), /geofence_radius_meters_check/);
  for (const ok of [30, 40, 50]) await db.exec(`UPDATE public.company_branches SET geofence_radius_meters = ${ok} WHERE company_id='${ids[4]}'`);
  const defaults = await db.query(`SELECT table_name, column_default FROM information_schema.columns WHERE table_schema='public' AND column_name='geofence_radius_meters' AND table_name IN ('companies','company_branches')`);
  assert.equal(defaults.rows.length, 2);
  for (const row of defaults.rows) assert.equal(row.column_default, '50', `${row.table_name} default`);
  assert.match((await db.query(`SELECT pg_get_functiondef('public.review_company_request(uuid,text,text,numeric,numeric,integer)'::regprocedure) AS d`)).rows[0].d, /p_radius NOT BETWEEN 30 AND 50/);
  await db.close();
  console.log('PASS: HTE branch migration backfills assignments, restricts request decisions to the audited RPC, and keeps student evidence paths owned.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
