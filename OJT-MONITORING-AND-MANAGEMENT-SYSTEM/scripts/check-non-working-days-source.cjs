const { PGlite } = require('@electric-sql/pglite');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const migrations = path.join(root, 'supabase/migrations');

async function rejects(db, sql, code) {
  await assert.rejects(() => db.exec(sql), (e) => (code ? e.code === code : true), `expected failure: ${sql}`);
}

async function main() {
  // Only the non-working-days section of the base migration; the rest of that file is company intake.
  const base = fs.readFileSync(path.join(migrations, '20261028000100_non_working_days_and_company_intake.sql'), 'utf8');
  const start = base.indexOf('CREATE TABLE IF NOT EXISTS public.non_working_days');
  const end = base.indexOf('Company intake control'); // the leftover "-- ───" before it is just a SQL comment
  assert.ok(start > 0 && end > start, 'base migration layout changed; update this check');
  const baseSection = base.slice(start, end);
  const addSource = fs.readFileSync(path.join(migrations, '20261117000100_non_working_days_source.sql'), 'utf8');

  const db = new PGlite();
  await db.exec(`
    CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
    CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    CREATE SCHEMA private;
    CREATE TABLE public.users(user_id uuid PRIMARY KEY, role text);
    CREATE TABLE public.companies(company_id uuid PRIMARY KEY DEFAULT gen_random_uuid());
    CREATE TABLE public.staff_capability_grants(user_id uuid, capability text, department_scope text, revoked_at timestamptz);
    CREATE FUNCTION private.get_my_role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT role FROM public.users WHERE user_id = auth.uid() $$;
  `);
  await db.exec(baseSection);

  // A hand-entered row that exists before the migration must become 'manual'.
  await db.exec(`INSERT INTO public.non_working_days (day_date, scope, label) VALUES ('2026-06-12', 'global', 'Independence Day')`);
  await db.exec(addSource);
  await db.exec(addSource); // re-running must not fail

  const manual = await db.query(`SELECT source FROM public.non_working_days WHERE day_date = '2026-06-12'`);
  assert.equal(manual.rows[0].source, 'manual', 'existing rows become manual');

  await db.exec(`INSERT INTO public.non_working_days (day_date, scope, label) VALUES ('2026-08-21', 'global', 'New row')`);
  assert.equal((await db.query(`SELECT source FROM public.non_working_days WHERE day_date = '2026-08-21'`)).rows[0].source, 'manual', 'default is manual');

  await db.exec(`INSERT INTO public.non_working_days (day_date, scope, label, source) VALUES ('2026-12-25', 'global', 'Christmas', 'nager')`);
  await rejects(db, `INSERT INTO public.non_working_days (day_date, scope, label, source) VALUES ('2026-12-26', 'global', 'Bad', 'other')`, '23514');
  await rejects(db, `INSERT INTO public.non_working_days (day_date, scope, label, source) VALUES ('2026-12-27', 'global', 'Bad', NULL)`, '23502');

  // The importer's skip rule: a year is imported when it has a 'nager' row.
  const imported = await db.query(`SELECT count(*)::int AS n FROM public.non_working_days WHERE scope='global' AND source='nager' AND day_date BETWEEN '2026-01-01' AND '2026-12-31'`);
  assert.equal(imported.rows[0].n, 1);

  // A nager global day and a department day on the same date can coexist.
  await db.exec(`INSERT INTO public.non_working_days (day_date, scope, department, label) VALUES ('2026-12-25', 'department', 'ICS', 'Dept day')`);
  // But the same global date twice is still blocked, whatever the source.
  await rejects(db, `INSERT INTO public.non_working_days (day_date, scope, label, source) VALUES ('2026-12-25', 'global', 'Dup', 'manual')`, '23505');

  console.log('non_working_days source checks passed');
}

main().catch((e) => { console.error(e); process.exit(1); });
