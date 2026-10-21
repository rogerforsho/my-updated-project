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
    INSERT INTO public.users VALUES
      ('00000000-0000-4000-8000-000000000001', 'Supervisor', 'active'),
      ('00000000-0000-4000-8000-000000000002', 'Coordinator', 'active');
    INSERT INTO public.reports(report_id, student_id, report_type, status) VALUES
      ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'Daily Journal', 'submitted'),
      ('10000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', 'Endorsement Letter', 'submitted'),
      ('10000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000001', 'Incident Report', 'submitted'),
      ('10000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000001', 'Weekly Progress', 'submitted');
    ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
    CREATE POLICY fixture_supervisor_access ON public.reports FOR ALL TO authenticated USING (true) WITH CHECK (true);
    GRANT USAGE ON SCHEMA auth TO authenticated;
    GRANT USAGE ON SCHEMA private TO authenticated;
    GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
    GRANT EXECUTE ON FUNCTION private.get_my_role() TO authenticated;
    GRANT SELECT ON public.users TO authenticated;
    GRANT SELECT, UPDATE ON public.reports TO authenticated;
  `);

  await db.exec(sql);
  await db.exec(sql); // Migration should be safe to retry.
  await db.exec('CREATE TRIGGER guard_ojt_client_write BEFORE UPDATE ON public.reports FOR EACH ROW EXECUTE FUNCTION public.guard_ojt_client_write()');

  await db.exec("SET ROLE authenticated; SET request.jwt.claim.sub = '00000000-0000-4000-8000-000000000001'");
  const supervisorRows = (await db.query('SELECT report_type FROM public.reports ORDER BY report_type')).rows;
  assert.deepEqual(supervisorRows.map(row => row.report_type), ['Daily Journal']);
  await db.query(`UPDATE public.reports SET supervisor_decision='approved', supervisor_decided_by=auth.uid(),
    supervisor_decided_at=now(), supervisor_feedback='Reviewed', supervisor_endorsed_at=now()
    WHERE report_type='Daily Journal'`);
  await assert.rejects(() => db.query(`UPDATE public.reports SET supervisor_decision='returned', supervisor_decided_by=auth.uid(),
    supervisor_decided_at=now(), supervisor_feedback='Changed' WHERE report_type='Daily Journal'`));
  const weeklyUpdate = await db.query(`UPDATE public.reports SET supervisor_decision='approved', supervisor_decided_by=auth.uid(),
    supervisor_decided_at=now(), supervisor_feedback='Reviewed' WHERE report_type='Weekly Progress' RETURNING report_id`);
  assert.equal(weeklyUpdate.rows.length, 0, 'Supervisors cannot decide weekly progress items');
  const gatewayUpdate = await db.query(`UPDATE public.reports SET supervisor_decision='approved', supervisor_decided_by=auth.uid(),
    supervisor_decided_at=now() WHERE report_type='Endorsement Letter' RETURNING report_id`);
  assert.equal(gatewayUpdate.rows.length, 0, 'Supervisors cannot decide gateway documents');
  await db.exec('RESET ROLE');

  await db.exec("SET ROLE authenticated; SET request.jwt.claim.sub = '00000000-0000-4000-8000-000000000002'");
  const coordinatorRows = (await db.query('SELECT report_type FROM public.reports ORDER BY report_type')).rows;
  assert.deepEqual(coordinatorRows.map(row => row.report_type), ['Daily Journal', 'Endorsement Letter', 'Incident Report', 'Weekly Progress']);
  await db.close();
  console.log('PASS: Supervisors see and decide assigned daily reports only; weekly progress, incidents, and gateway decisions stay with Coordinators.');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
