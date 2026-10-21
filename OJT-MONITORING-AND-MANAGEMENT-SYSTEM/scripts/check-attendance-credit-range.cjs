// Isolated PostgreSQL regression check for the assignment-date credit guard.
const { PGlite } = require('@electric-sql/pglite');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

async function main() {
  const db = new PGlite();
  const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  const migration = path.join(__dirname, '../database/migrations/20261019070000_attendance_assignment_date_credit_guard.sql');
  const mirror = path.join(__dirname, '../supabase/migrations/20261019070000_attendance_assignment_date_credit_guard.sql');
  const sql = fs.readFileSync(migration, 'utf8');
  assert.equal(fs.readFileSync(mirror, 'utf8'), sql, 'Supabase and database migrations must stay identical');

  await db.exec(`
    CREATE ROLE anon NOLOGIN;
    CREATE ROLE authenticated NOLOGIN;
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
    CREATE TABLE public.student_assignments (
      assignment_id uuid, student_id uuid, start_date date NOT NULL, end_date date
    );
    CREATE TABLE public.attendance (
      attendance_id uuid DEFAULT gen_random_uuid(), assignment_id uuid, student_id uuid,
      attendance_date date, time_in timestamptz, time_out timestamptz,
      verification_status text, credited_hours numeric
    );
    CREATE FUNCTION public.ojt_security_revision() RETURNS integer LANGUAGE sql STABLE AS $$ SELECT 39 $$;
    CREATE FUNCTION public.snapshot_attendance_credited_hours() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.verification_status = 'verified' AND NEW.time_out IS NOT NULL THEN
        NEW.credited_hours := extract(epoch FROM (NEW.time_out - NEW.time_in)) / 3600.0;
      END IF;
      RETURN NEW;
    END;
    $$;
    CREATE TRIGGER snapshot_attendance_credited_hours
      BEFORE INSERT OR UPDATE OF assignment_id, student_id, credited_hours
      ON public.attendance FOR EACH ROW EXECUTE FUNCTION public.snapshot_attendance_credited_hours();
    INSERT INTO public.student_assignments VALUES ('${id(1)}', '${id(2)}', '2026-10-20', '2026-10-31');
    INSERT INTO public.attendance(assignment_id, student_id, attendance_date, time_in, time_out, verification_status)
    VALUES ('${id(1)}', '${id(2)}', '2026-10-19', '2026-10-19 08:00+08', '2026-10-19 17:00+08', 'verified');
  `);

  await db.exec(sql);
  const rows = (await db.query('SELECT attendance_date::text AS attendance_date, credited_hours FROM public.attendance ORDER BY attendance_date')).rows;
  assert.deepEqual(rows.map(row => ({ ...row, credited_hours: Number(row.credited_hours) })), [
    { attendance_date: '2026-10-19', credited_hours: 0 },
  ], 'migration must correct existing out-of-range credits');

  await db.query(`
    INSERT INTO public.attendance(assignment_id, student_id, attendance_date, time_in, time_out, verification_status)
    VALUES ($1, $2, $3, $4, $5, 'verified'),
      ($6, $2, $7, $4, $5, 'verified')
  `, [id(1), id(2), '2026-10-21', '2026-10-21 08:00+08', '2026-10-21 17:00+08', id(3), '2026-10-21']);
  const newRows = (await db.query('SELECT assignment_id, credited_hours FROM public.attendance ORDER BY attendance_date, assignment_id')).rows;
  assert.deepEqual(newRows.map(row => ({ ...row, credited_hours: Number(row.credited_hours) })), [
    { assignment_id: id(1), credited_hours: 0 },
    { assignment_id: id(1), credited_hours: 9 },
    { assignment_id: id(3), credited_hours: 0 },
  ]);
  assert.equal(Number((await db.query('SELECT public.ojt_security_revision() AS revision')).rows[0].revision), 40);

  await db.close();
  console.log('PASS: assignment-range guard prevents and corrects out-of-range verified attendance credits.');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
