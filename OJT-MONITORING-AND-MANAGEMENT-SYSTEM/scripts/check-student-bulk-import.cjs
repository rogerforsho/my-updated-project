// Isolated PostgreSQL check: student_import invites skip only the ID-card check,
// and the must-change-password migration accepts the two new rate-limit actions.
const { PGlite } = require('@electric-sql/pglite');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const read = (dir, file) => fs.readFileSync(path.join(__dirname, '..', dir, 'migrations', file), 'utf8');
const migration = file => {
  const sql = read('database', file);
  assert.equal(read('supabase', file), sql, 'migration copies must match');
  return sql;
};

async function main() {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
    GRANT ALL ON SCHEMA public TO anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;
    CREATE SCHEMA auth; CREATE SCHEMA storage;
    CREATE TABLE storage.objects (bucket_id text, name text);
    CREATE TABLE auth.users (id uuid DEFAULT gen_random_uuid(), email text,
      raw_user_meta_data jsonb NOT NULL DEFAULT '{}', raw_app_meta_data jsonb NOT NULL DEFAULT '{}');
    CREATE TABLE public.users (user_id uuid PRIMARY KEY DEFAULT gen_random_uuid());
    CREATE TABLE public.audit_logs (actor_user_id uuid, action text, entity_type text, details jsonb);
    CREATE TABLE public.auth_rate_limits (action text, subject_hash text, window_start timestamptz, attempts integer,
      PRIMARY KEY (action, subject_hash, window_start));
    CREATE FUNCTION public.ojt_security_revision() RETURNS integer LANGUAGE sql AS $$ SELECT 44 $$;
    CREATE FUNCTION public.course_department(c text) RETURNS text LANGUAGE sql AS
      $$ SELECT CASE WHEN c IN ('BSIT', 'BS-CPE') THEN 'ICS' WHEN c IN ('BSBA-HRM', 'BSENTREP') THEN 'IBE' END $$;
  `);
  await db.exec(migration('20261024000500_pending_staff_invites.sql'));
  await db.exec(migration('20261024000800_student_must_change_password.sql'));
  await db.exec(migration('20261024000900_student_bulk_import.sql'));
  await db.exec('CREATE TRIGGER validate_new_student_registration BEFORE INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.validate_new_student_registration()');

  const hash = 'a'.repeat(64);
  for (const action of ['password_reset_admin', 'student_import'])
    assert.equal((await db.query(`SELECT public.claim_auth_rate_limit('${action}', '${hash}', 5, 60) AS ok`)).rows[0].ok, true);
  await assert.rejects(() => db.query(`SELECT public.claim_auth_rate_limit('bogus', '${hash}', 5, 60)`), /Invalid rate limit/);
  await db.exec('INSERT INTO public.users DEFAULT VALUES');
  assert.equal((await db.query('SELECT must_change_password FROM public.users')).rows[0].must_change_password, false);

  const insert = (email, course = 'BSIT', year = '4') => db.exec(
    `INSERT INTO auth.users(email, raw_user_meta_data) VALUES ('${email}', '{"course":"${course}","year_level":"${year}"}')`);
  const invite = (email, kind) => db.exec(`INSERT INTO public.pending_staff_invites(email, kind) VALUES ('${email}', '${kind}')`);

  await assert.rejects(() => insert('plain@example.test'), /both sides of the student ID/);
  await invite('imported@example.test', 'student_import');
  await insert('Imported@Example.test');
  await invite('year3@example.test', 'student_import');
  await assert.rejects(() => insert('year3@example.test', 'BSIT', '3'), /fourth-year/);
  await invite('other-course@example.test', 'student_import');
  await assert.rejects(() => insert('other-course@example.test', 'BSN'), /fourth-year/);
  await invite('staff@example.test', 'staff');
  await insert('staff@example.test', 'NONE', '1');
  await db.exec(`UPDATE public.pending_staff_invites SET created_at = now() - interval '10 minutes'`);
  await assert.rejects(() => insert('imported@example.test'), /both sides of the student ID/);
  await assert.rejects(() => invite('x@example.test', 'other'), /check/);

  console.log('Student bulk import checks passed.');
  await db.close();
}
main().catch(e => { console.error(e); process.exit(1); });
