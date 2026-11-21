// Isolated PostgreSQL check: clearance needs the student's HTE evaluation as well as hours, approved final report and passing final evaluation.
const { PGlite } = require('@electric-sql/pglite');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

async function main() {
  const root = path.join(__dirname, '..');
  const migration = fs.readFileSync(path.join(root, 'supabase/migrations/20261119000100_clearance_requires_hte_evaluation.sql'), 'utf8');
  const db = new PGlite();
  const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  await db.exec(`
    CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
    CREATE SCHEMA private;
    CREATE TABLE public.students(student_id uuid PRIMARY KEY, course text, required_hours int);
    CREATE TABLE public.internship_progress(student_id uuid PRIMARY KEY, completed_hours numeric);
    CREATE TABLE public.evaluations(evaluation_id uuid PRIMARY KEY DEFAULT gen_random_uuid(), student_id uuid, evaluation_type text, performance_score numeric, evaluation_date date DEFAULT current_date);
    CREATE TABLE public.evaluation_appeals(evaluation_id uuid, student_id uuid, status text, resolved_score numeric, created_at timestamptz DEFAULT now());
    CREATE TABLE public.reports(student_id uuid, report_type text, status text);
    CREATE TABLE public.hte_evaluations(hte_evaluation_id uuid PRIMARY KEY DEFAULT gen_random_uuid(), student_id uuid UNIQUE);
    CREATE FUNCTION public.required_hours_for_course(c text) RETURNS integer LANGUAGE sql IMMUTABLE AS $$ SELECT 486 $$;
    INSERT INTO public.students VALUES ('${id(1)}', 'BSIT', 486);
    INSERT INTO public.internship_progress VALUES ('${id(1)}', 486);
    INSERT INTO public.reports VALUES ('${id(1)}', 'final_report', 'approved');
    INSERT INTO public.evaluations(student_id, evaluation_type, performance_score) VALUES ('${id(1)}', 'final', 90);
  `);
  await db.exec(migration);
  await db.exec(migration); // reapplying must be safe

  const clear = async () => (await db.query('SELECT private.student_clearance_met($1) AS ok', [id(1)])).rows[0].ok;
  assert.equal(await clear(), false, 'no HTE evaluation blocks clearance');
  await db.exec(`INSERT INTO public.hte_evaluations(student_id) VALUES ('${id(1)}')`);
  assert.equal(await clear(), true, 'with the HTE evaluation the other three gateways clear');
  await db.exec(`UPDATE public.reports SET status = 'submitted'`);
  assert.equal(await clear(), false, 'the final report is still required');

  console.log('PASS: clearance requires the student HTE evaluation.');
}

main().catch(error => { console.error(error); process.exit(1); });
