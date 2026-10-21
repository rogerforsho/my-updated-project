// Isolated PostgreSQL regression check for the registration resubmission RPC.
const { PGlite } = require('@electric-sql/pglite');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

async function main() {
  const db = new PGlite();
  const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  const migration = path.join(__dirname, '../database/migrations/20261019054700_student_registration_resubmission.sql');
  const mirror = path.join(__dirname, '../supabase/migrations/20261019054700_student_registration_resubmission.sql');
  const sql = fs.readFileSync(migration, 'utf8');
  assert.equal(fs.readFileSync(mirror, 'utf8'), sql, 'Supabase and database migrations must stay identical');

  await db.exec(`
    CREATE ROLE anon NOLOGIN;
    CREATE ROLE authenticated NOLOGIN;
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
    CREATE SCHEMA private;
    CREATE SCHEMA storage;
    CREATE TABLE public.users (
      user_id uuid PRIMARY KEY, full_name text, role text, account_status text, updated_at timestamptz
    );
    CREATE TABLE public.students (
      student_id uuid PRIMARY KEY, user_id uuid UNIQUE, student_number text UNIQUE, course text,
      year_level integer, id_card_path text, id_card_front_path text, id_card_back_path text
    );
    CREATE TABLE storage.objects (bucket_id text, name text UNIQUE);
    CREATE TABLE public.audit_logs (
      actor_user_id uuid, action text, entity_type text, entity_id text, details jsonb
    );
    CREATE TABLE public.notifications (
      receiver_user_id uuid, message text, status text, notification_date timestamptz
    );
    CREATE FUNCTION public.course_department(text) RETURNS text LANGUAGE sql IMMUTABLE AS
      $$ SELECT CASE WHEN nullif(trim($1), '') IS NULL THEN NULL ELSE 'ICS' END $$;
    CREATE FUNCTION public.ojt_security_revision() RETURNS integer LANGUAGE sql STABLE AS $$ SELECT 38 $$;
    INSERT INTO public.users(user_id, full_name, role, account_status) VALUES
      ('${id(1)}', 'Rejected Student', 'Student', 'rejected'),
      ('${id(2)}', 'Existing Student', 'Student', 'active'),
      ('${id(3)}', 'Second Rejected Student', 'Student', 'rejected');
    INSERT INTO public.students(student_id, user_id, student_number, course, year_level) VALUES
      ('${id(11)}', '${id(1)}', 'OLD-1', 'BSIT', 4),
      ('${id(12)}', '${id(2)}', 'TAKEN', 'BSIT', 4),
      ('${id(13)}', '${id(3)}', 'OLD-3', 'BSIT', 4);
  `);

  await db.exec(sql);
  const front1 = `id-cards/2026123456_${'a'.repeat(24)}_front.jpg`;
  const back1 = `id-cards/2026123456_${'a'.repeat(24)}_back.jpg`;
  const front3 = `id-cards/2026123457_${'b'.repeat(24)}_front.jpg`;
  const back3 = `id-cards/2026123457_${'b'.repeat(24)}_back.jpg`;
  await db.query('INSERT INTO storage.objects(bucket_id, name) VALUES ($1, $2), ($1, $3), ($1, $4), ($1, $5)', [
    'private-documents', front1, back1, front3, back3,
  ]);

  assert.equal(Number((await db.query('SELECT public.ojt_security_revision() AS revision')).rows[0].revision), 39);
  assert.equal((await db.query(`SELECT has_function_privilege('service_role', 'public.resubmit_student_registration(uuid,text,text,text,integer,text,text)', 'EXECUTE') AS allowed`)).rows[0].allowed, true);
  assert.equal((await db.query(`SELECT has_function_privilege('authenticated', 'public.resubmit_student_registration(uuid,text,text,text,integer,text,text)', 'EXECUTE') AS allowed`)).rows[0].allowed, false);

  async function submit(userId, fullName, studentNumber, front, back) {
    await db.exec('RESET ROLE; SET ROLE service_role');
    const result = await db.query(
      'SELECT public.resubmit_student_registration($1::uuid, $2, $3, $4, 4, $5, $6) AS result',
      [userId, fullName, studentNumber, 'BSIT', front, back],
    );
    await db.exec('RESET ROLE');
    return result.rows[0].result;
  }

  assert.equal(await submit(id(1), 'Updated Student', 'NEW-1', front1, back1), 'ok');
  const updated = (await db.query(`
    SELECT u.full_name, u.account_status, s.student_number, s.id_card_front_path, s.id_card_back_path
    FROM public.users u JOIN public.students s USING (user_id) WHERE u.user_id = '${id(1)}'
  `)).rows[0];
  assert.deepEqual(updated, {
    full_name: 'Updated Student', account_status: 'pending', student_number: 'NEW-1',
    id_card_front_path: front1, id_card_back_path: back1,
  });
  assert.equal((await db.query(`SELECT count(*)::int AS count FROM public.audit_logs WHERE action = 'STUDENT_REGISTRATION_RESUBMITTED'`)).rows[0].count, 1);
  assert.equal((await db.query(`SELECT count(*)::int AS count FROM public.notifications WHERE receiver_user_id = '${id(1)}'`)).rows[0].count, 1);

  assert.equal(await submit(id(3), 'Duplicate Student', 'TAKEN', front3, back3), 'duplicate_student_number');
  assert.equal(await submit(id(3), 'Duplicate Student', 'NEW-3', front1, back3), 'invalid_documents');
  const unchanged = (await db.query(`
    SELECT u.full_name, u.account_status, s.student_number FROM public.users u
    JOIN public.students s USING (user_id) WHERE u.user_id = '${id(3)}'
  `)).rows[0];
  assert.deepEqual(unchanged, { full_name: 'Second Rejected Student', account_status: 'rejected', student_number: 'OLD-3' });
  assert.equal((await db.query('SELECT count(*)::int AS count FROM public.audit_logs')).rows[0].count, 1);
  assert.equal((await db.query('SELECT count(*)::int AS count FROM public.notifications')).rows[0].count, 1);
  assert.equal(await submit(id(2), 'Active Student', 'ACTIVE-2', front1, back1), 'not_found');

  await db.close();
  console.log('PASS: resubmission migration atomic updates, duplicate handling, eligibility, and grants.');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
