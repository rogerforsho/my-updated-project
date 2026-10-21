// Isolated regression check for the final Auth trigger; never connects to Supabase.
const { PGlite } = require('@electric-sql/pglite');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

async function main() {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon NOLOGIN;
    CREATE ROLE authenticated NOLOGIN;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users (
      id uuid PRIMARY KEY,
      email text,
      raw_user_meta_data jsonb NOT NULL DEFAULT '{}',
      raw_app_meta_data jsonb NOT NULL DEFAULT '{}'
    );
    CREATE TABLE public.users (
      user_id uuid PRIMARY KEY,
      full_name text,
      email text,
      role text NOT NULL,
      account_status text NOT NULL,
      account_category text
    );
    ALTER TABLE public.users ADD CONSTRAINT users_role_check
      CHECK (role IN ('Student', 'Coordinator', 'Supervisor', 'Admin'));
    CREATE TABLE public.students (
      student_id uuid DEFAULT gen_random_uuid(),
      user_id uuid PRIMARY KEY,
      student_number text,
      course text,
      year_level integer,
      status text,
      id_card_path text
    );
  `);

  const migration = fs.readFileSync(path.join(__dirname, '../database/migrations/20261020120000_safe_account_creation_and_role_labels.sql'), 'utf8');
  assert.equal(
    fs.readFileSync(path.join(__dirname, '../supabase/migrations/20261020120000_safe_account_creation_and_role_labels.sql'), 'utf8'),
    migration,
    'Supabase and database migration copies must match'
  );
  await db.exec(migration);
  await db.exec(`
    CREATE TRIGGER on_auth_user_created
      AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();
    INSERT INTO public.users(user_id, full_name, email, role, account_status)
      VALUES ('00000000-0000-4000-8000-000000000001', 'Existing Student', 'student@example.edu', 'Student', 'active');
    INSERT INTO public.students(user_id, student_number, course, year_level, status)
      VALUES ('00000000-0000-4000-8000-000000000001', '2026-00001', 'BSIT', 4, 'active');
  `);

  await assert.rejects(() => db.exec(`
    INSERT INTO auth.users(id, email)
      VALUES ('00000000-0000-4000-8000-000000000002', 'STUDENT@example.edu');
  `), /Account email is already in use/);

  const preserved = (await db.query(`
    SELECT u.user_id::text AS user_id, u.email, s.student_number
    FROM public.users u JOIN public.students s USING (user_id)
  `)).rows;
  assert.deepEqual(preserved, [{
    user_id: '00000000-0000-4000-8000-000000000001',
    email: 'student@example.edu',
    student_number: '2026-00001',
  }]);
  assert.equal((await db.query('SELECT count(*)::int AS count FROM auth.users')).rows[0].count, 0);

  await db.close();
  console.log('PASS: duplicate Auth email is rejected without deleting or changing the existing profile or student data.');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
