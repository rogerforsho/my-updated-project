// Isolated PostgreSQL regression check for report review ownership.
const { PGlite } = require('@electric-sql/pglite');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

async function main() {
  const db = new PGlite();
  const migration = path.join(__dirname, '../database/migrations/20261020180000_supervisor_accomplishment_decisions.sql');
  const mirror = path.join(__dirname, '../supabase/migrations/20261020180000_supervisor_accomplishment_decisions.sql');
  const sql = fs.readFileSync(migration, 'utf8');
  const read = name => fs.readFileSync(path.join(__dirname, '../supabase/migrations', name), 'utf8');
  // Real assignment boundary: policy from 030, helper as moved to private by 20261016035254.
  const activeStudentFn = read('20261016035254_remediate_security_definer_api_findings.sql')
    .match(/CREATE OR REPLACE FUNCTION private\.supervisor_has_active_student[\s\S]*?\$\$;/)[0];
  const boundaries = read('030_authorization_write_boundaries.sql');
  const toPrivate = text => text.replace(/public\.(get_my_role|supervisor_has_active_student)/g, 'private.$1');
  const assignmentPolicy = toPrivate(boundaries.match(/CREATE POLICY supervisor_report_boundary[\s\S]*?;/)[0]);
  const activeAccountPolicy = toPrivate(boundaries.match(/'(CREATE POLICY active_account_boundary[^']*)'/)[1])
    .replace('%I', 'reports');
  assert.equal(fs.readFileSync(mirror, 'utf8'), sql, 'Supabase and database migration copies must match');

  await db.exec(`
    CREATE ROLE anon NOLOGIN;
    CREATE ROLE authenticated NOLOGIN;
    CREATE SCHEMA auth;
    CREATE SCHEMA private;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    CREATE TABLE public.users (user_id uuid PRIMARY KEY, role text NOT NULL, account_status text NOT NULL);
    CREATE TABLE public.reports (
      report_id uuid PRIMARY KEY, student_id uuid NOT NULL, report_type text NOT NULL, status text NOT NULL,
      supervisor_feedback text, supervisor_endorsed_at timestamptz, updated_at timestamptz
    );
    CREATE FUNCTION private.get_my_role() RETURNS text LANGUAGE sql STABLE AS
      $$ SELECT role FROM public.users WHERE user_id = auth.uid() AND account_status = 'active' $$;
    CREATE TABLE public.supervisors (supervisor_id uuid PRIMARY KEY, user_id uuid NOT NULL);
    CREATE TABLE public.student_assignments (student_id uuid NOT NULL, supervisor_id uuid NOT NULL, assignment_status text NOT NULL);
    CREATE FUNCTION private.get_my_supervisor_id() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT supervisor_id FROM public.supervisors WHERE user_id = auth.uid() $$;
    INSERT INTO public.users VALUES
      ('00000000-0000-4000-8000-000000000001', 'Supervisor', 'active'),
      ('00000000-0000-4000-8000-000000000002', 'Coordinator', 'active'),
      ('00000000-0000-4000-8000-000000000003', 'Supervisor', 'active'),
      ('00000000-0000-4000-8000-000000000004', 'Supervisor', 'inactive');
    INSERT INTO public.supervisors VALUES
      ('30000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001'),
      ('30000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000003'),
      ('30000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000004');
    INSERT INTO public.student_assignments VALUES
      ('20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'active'),
      ('20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000004', 'active'),
      ('20000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000001', 'completed');
    INSERT INTO public.reports(report_id, student_id, report_type, status) VALUES
      ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'Daily Journal', 'submitted'),
      ('10000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', 'Endorsement Letter', 'submitted'),
      ('10000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000001', 'Incident Report', 'submitted'),
      ('10000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000001', 'Weekly Progress', 'submitted'),
      ('10000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000002', 'Daily Journal', 'submitted'),
      ('10000000-0000-4000-8000-000000000006', '20000000-0000-4000-8000-000000000001', 'Accomplishment Report', 'submitted');
    ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
    CREATE POLICY fixture_supervisor_access ON public.reports FOR ALL TO authenticated USING (true) WITH CHECK (true);
    GRANT USAGE ON SCHEMA auth TO authenticated;
    GRANT USAGE ON SCHEMA private TO authenticated;
    GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
    GRANT EXECUTE ON FUNCTION private.get_my_role() TO authenticated;
    GRANT EXECUTE ON FUNCTION private.get_my_supervisor_id() TO authenticated;
    GRANT SELECT ON public.users, public.supervisors, public.student_assignments TO authenticated;
    GRANT SELECT, UPDATE ON public.reports TO authenticated;
  `);

  await db.exec(activeStudentFn);
  await db.exec(assignmentPolicy);
  await db.exec(activeAccountPolicy);
  await db.exec(sql);
  await db.exec(sql); // Migration should be safe to retry.
  await db.exec('CREATE TRIGGER guard_ojt_client_write BEFORE UPDATE ON public.reports FOR EACH ROW EXECUTE FUNCTION public.guard_ojt_client_write()');

  await db.exec("SET ROLE authenticated; SET request.jwt.claim.sub = '00000000-0000-4000-8000-000000000001'");
  const supervisorRows = (await db.query('SELECT report_type FROM public.reports ORDER BY report_type')).rows;
  assert.deepEqual(supervisorRows.map(row => row.report_type), ['Accomplishment Report', 'Daily Journal'],
    'Reports of a student whose assignment ended are hidden');
  const endedUpdate = await db.query(`UPDATE public.reports SET supervisor_decision='approved', supervisor_decided_by=auth.uid(),
    supervisor_decided_at=now(), supervisor_feedback='Late' WHERE report_id='10000000-0000-4000-8000-000000000005' RETURNING report_id`);
  assert.equal(endedUpdate.rows.length, 0, 'Supervisor of an ended assignment cannot decide');
  await db.query(`UPDATE public.reports SET supervisor_decision='approved', supervisor_decided_by=auth.uid(),
    supervisor_decided_at=now(), supervisor_feedback='Reviewed', supervisor_endorsed_at=now()
    WHERE report_type='Daily Journal'`);
  const returned = await db.query(`UPDATE public.reports SET supervisor_decision='returned', supervisor_decided_by=auth.uid(),
    supervisor_decided_at=now(), supervisor_feedback='Add task details' WHERE report_id='10000000-0000-4000-8000-000000000006'
    RETURNING supervisor_decision, supervisor_feedback`);
  assert.deepEqual(returned.rows, [{ supervisor_decision: 'returned', supervisor_feedback: 'Add task details' }],
    'Revision request is stored with its comment');
  await assert.rejects(() => db.query(`UPDATE public.reports SET supervisor_decision='returned', supervisor_decided_by=auth.uid(),
    supervisor_decided_at=now(), supervisor_feedback='Changed' WHERE report_type='Daily Journal'`));
  const weeklyUpdate = await db.query(`UPDATE public.reports SET supervisor_decision='approved', supervisor_decided_by=auth.uid(),
    supervisor_decided_at=now(), supervisor_feedback='Reviewed' WHERE report_type='Weekly Progress' RETURNING report_id`);
  assert.equal(weeklyUpdate.rows.length, 0, 'Supervisors cannot decide weekly progress items');
  const gatewayUpdate = await db.query(`UPDATE public.reports SET supervisor_decision='approved', supervisor_decided_by=auth.uid(),
    supervisor_decided_at=now() WHERE report_type='Endorsement Letter' RETURNING report_id`);
  assert.equal(gatewayUpdate.rows.length, 0, 'Supervisors cannot decide gateway documents');
  await db.exec('RESET ROLE');

  await db.exec("SET ROLE authenticated; SET request.jwt.claim.sub = '00000000-0000-4000-8000-000000000003'");
  assert.equal((await db.query('SELECT 1 FROM public.reports')).rows.length, 0, 'Unassigned Supervisor sees no reports');
  const unassigned = await db.query(`UPDATE public.reports SET supervisor_decision='approved', supervisor_decided_by=auth.uid(),
    supervisor_decided_at=now(), supervisor_feedback='x' WHERE report_id='10000000-0000-4000-8000-000000000006' RETURNING report_id`);
  assert.equal(unassigned.rows.length, 0, 'Unassigned Supervisor cannot decide');
  await db.exec('RESET ROLE');

  await db.exec("SET ROLE authenticated; SET request.jwt.claim.sub = '00000000-0000-4000-8000-000000000004'");
  assert.equal((await db.query('SELECT 1 FROM public.reports')).rows.length, 0, 'Inactive Supervisor account sees no reports');
  await db.exec('RESET ROLE');

  await db.exec("SET ROLE authenticated; SET request.jwt.claim.sub = '00000000-0000-4000-8000-000000000002'");
  const coordinatorRows = (await db.query('SELECT report_type FROM public.reports ORDER BY report_type')).rows;
  assert.deepEqual(coordinatorRows.map(row => row.report_type),
    ['Accomplishment Report', 'Daily Journal', 'Daily Journal', 'Endorsement Letter', 'Incident Report', 'Weekly Progress']);
  await db.close();
  console.log('PASS: Only the active Supervisor of an active assignment sees and approves/returns (with comment) daily reports; weekly progress, incidents, and gateway decisions stay with Coordinators.');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
