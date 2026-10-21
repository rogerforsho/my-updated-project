// Isolated PostgreSQL checks for forward-only workflow corrections.
const { PGlite } = require('@electric-sql/pglite');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

async function main() {
  const root = path.join(__dirname, '..');
  const registrationMigration = fs.readFileSync(path.join(root, 'database/migrations/20261020200000_coordinator_registration_copy.sql'), 'utf8');
  assert.equal(fs.readFileSync(path.join(root, 'supabase/migrations/20261020200000_coordinator_registration_copy.sql'), 'utf8'), registrationMigration);
  const scheduleMigration = fs.readFileSync(path.join(root, 'database/migrations/20261020210000_finite_offsite_schedule_dates.sql'), 'utf8');
  assert.equal(fs.readFileSync(path.join(root, 'supabase/migrations/20261020210000_finite_offsite_schedule_dates.sql'), 'utf8'), scheduleMigration);
  const academicYearMigration = fs.readFileSync(path.join(root, 'database/migrations/20261021145644_remove_certificate_academic_year_default.sql'), 'utf8');
  assert.equal(fs.readFileSync(path.join(root, 'supabase/migrations/20261021145644_remove_certificate_academic_year_default.sql'), 'utf8'), academicYearMigration);

  const db = new PGlite();
  await db.exec(`
    CREATE SCHEMA private;
    CREATE TABLE public.notifications(message text);
    CREATE FUNCTION private.resubmit_student_registration(uuid, text, text, text, integer, text, text)
    RETURNS void LANGUAGE plpgsql AS $$
    BEGIN INSERT INTO public.notifications VALUES ('OJT Staff review'); END;
    $$;
  `);
  await db.exec(registrationMigration);
  await db.query('SELECT private.resubmit_student_registration(NULL, NULL, NULL, NULL, NULL, NULL, NULL)');
  assert.equal((await db.query('SELECT message FROM public.notifications')).rows[0].message, 'OJT Coordinator review');
  await db.close();

  const scheduleDb = new PGlite();
  await scheduleDb.exec(`
    CREATE TABLE public.practicum_schedules (
      schedule_id integer,
      work_modality text NOT NULL CHECK (work_modality IN ('on_site', 'hybrid', 'remote')),
      start_date date NOT NULL,
      end_date date
    );
    INSERT INTO public.practicum_schedules VALUES (1, 'remote', '2026-10-20', NULL);
  `);
  await assert.rejects(() => scheduleDb.exec(scheduleMigration), /existing schedule\(s\) need Coordinator review and correction first/);
  await scheduleDb.exec('ROLLBACK');
  assert.equal((await scheduleDb.query(`SELECT count(*)::int AS count FROM pg_constraint WHERE conname = 'practicum_schedules_offsite_finite'`)).rows[0].count, 0);
  await scheduleDb.exec("UPDATE public.practicum_schedules SET end_date = '2026-12-20'");
  await scheduleDb.exec(scheduleMigration);
  await assert.rejects(() => scheduleDb.exec("INSERT INTO public.practicum_schedules VALUES (2, 'hybrid', '2026-10-20', NULL)"), /practicum_schedules_offsite_finite/);
  await assert.rejects(() => scheduleDb.exec("INSERT INTO public.practicum_schedules VALUES (3, 'on_site', '2026-10-20', '2026-10-19')"), /practicum_schedules_valid_date_range/);
  await scheduleDb.close();

  const certificateDb = new PGlite();
  await certificateDb.exec("CREATE TABLE public.certificates (academic_year text NOT NULL DEFAULT '2025-2026')");
  await certificateDb.exec(academicYearMigration);
  await certificateDb.exec(academicYearMigration);
  assert.equal((await certificateDb.query("SELECT column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'certificates' AND column_name = 'academic_year'")).rows[0].column_default, null);
  await assert.rejects(() => certificateDb.exec('INSERT INTO public.certificates DEFAULT VALUES'), /null value in column "academic_year"/);
  await certificateDb.exec("INSERT INTO public.certificates (academic_year) VALUES ('2026-2027')");
  await certificateDb.close();
  console.log('PASS: Coordinator registration, schedule, and certificate academic-year migrations preserve valid data and enforce safe future writes.');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
