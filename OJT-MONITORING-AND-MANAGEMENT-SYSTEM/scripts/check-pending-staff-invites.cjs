// Isolated PostgreSQL check: server-registered staff emails bypass student checks; nobody else can.
const { PGlite } = require('@electric-sql/pglite');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

async function main() {
  const file = '20261024000500_pending_staff_invites.sql';
  const sql = fs.readFileSync(path.join(__dirname, '../database/migrations', file), 'utf8');
  assert.equal(fs.readFileSync(path.join(__dirname, '../supabase/migrations', file), 'utf8'), sql, 'migration copies must match');
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
    GRANT ALL ON SCHEMA public TO anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;
    CREATE SCHEMA auth; CREATE SCHEMA storage;
    CREATE TABLE storage.objects (bucket_id text, name text);
    CREATE TABLE auth.users (id uuid DEFAULT gen_random_uuid(), email text,
      raw_user_meta_data jsonb NOT NULL DEFAULT '{}', raw_app_meta_data jsonb NOT NULL DEFAULT '{}');
    CREATE FUNCTION public.ojt_security_revision() RETURNS integer LANGUAGE sql AS $$ SELECT 44 $$;
    CREATE FUNCTION public.course_department(c text) RETURNS text LANGUAGE sql AS $$ SELECT NULL::text $$;
  `);
  await db.exec(sql);
  await db.exec('CREATE TRIGGER validate_new_student_registration BEFORE INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.validate_new_student_registration()');

  const insert = email => db.exec(`INSERT INTO auth.users(email) VALUES ('${email}')`);
  await assert.rejects(() => insert('staff@example.test'), /fourth-year/);
  await db.exec(`INSERT INTO public.pending_staff_invites(email) VALUES ('staff@example.test')`);
  await insert('Staff@Example.test');
  await assert.rejects(() => insert('other@example.test'), /fourth-year/);
  await db.exec(`UPDATE public.pending_staff_invites SET created_at = now() - interval '10 minutes'`);
  await assert.rejects(() => insert('staff@example.test'), /fourth-year/);

  for (const role of ['anon', 'authenticated']) {
    await db.exec(`SET ROLE ${role}`);
    await assert.rejects(() => db.exec(`INSERT INTO public.pending_staff_invites(email) VALUES ('evil@example.test')`), /permission denied/);
    await db.exec('RESET ROLE');
  }
  console.log('Pending staff invite checks passed.');
  await db.close();
}
main().catch(e => { console.error(e); process.exit(1); });
