// Isolated PostgreSQL check: only a final evaluation exists, only after the required hours are finished, and clearance needs no midterm.
const { PGlite } = require('@electric-sql/pglite');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

async function main() {
  const root = path.join(__dirname, '..');
  const migration = fs.readFileSync(path.join(root, 'supabase/migrations/20261118000300_final_evaluation_only.sql'), 'utf8');
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
    CREATE FUNCTION public.ojt_security_revision() RETURNS integer LANGUAGE sql AS $$ SELECT 44 $$;
    CREATE FUNCTION public.required_hours_for_course(c text) RETURNS integer LANGUAGE sql IMMUTABLE AS $$ SELECT CASE WHEN c = 'BS-CPE' THEN 240 WHEN c = 'BSIT' THEN 486 END $$;
    INSERT INTO public.students VALUES ('${id(1)}', 'BSIT', 486), ('${id(2)}', 'BSIT', 486), ('${id(3)}', 'BS-CPE', NULL), ('${id(4)}', 'BSIT', 486);
    INSERT INTO public.internship_progress VALUES ('${id(1)}', 486), ('${id(2)}', 312), ('${id(3)}', 240);
    INSERT INTO public.reports VALUES ('${id(1)}', 'final_report', 'approved'), ('${id(2)}', 'final_report', 'approved'), ('${id(3)}', 'final_report', 'approved');
  `);
  await db.exec(migration);
  await db.exec(migration); // reapplying must be safe

  const insert = (student, type, score = 90) => db.query(
    `INSERT INTO public.evaluations(student_id, evaluation_type, performance_score) VALUES ($1, $2, $3)`, [id(student), type, score]);
  const clear = async n => (await db.query('SELECT private.student_clearance_met($1) AS ok', [id(n)])).rows[0].ok;

  await assert.rejects(insert(2, 'final'), /not finished the required practicum hours \(312 of 486/, 'short hours are rejected');
  await assert.rejects(insert(4, 'final'), /not finished/, 'a trainee with no progress row counts as 0 hours');
  await assert.rejects(insert(1, 'midterm'), /Only the final evaluation/, 'midterm is rejected even when hours are complete');
  await insert(1, 'final');
  await insert(3, 'final'); // BS-CPE: required hours come from the program (240), not 486

  assert.equal(await clear(1), true, 'hours + approved final report + passing final is enough, no midterm');
  assert.equal(await clear(3), true, 'program hours apply to clearance too');
  assert.equal(await clear(2), false, 'short hours still block clearance');

  await db.exec(`UPDATE public.evaluations SET performance_score = 74 WHERE student_id = '${id(1)}'`);
  assert.equal(await clear(1), false, 'a failing final blocks clearance');
  await db.exec(`INSERT INTO public.evaluation_appeals(evaluation_id, student_id, status) SELECT evaluation_id, student_id, 'pending' FROM public.evaluations WHERE student_id = '${id(1)}'`);
  await db.exec(`UPDATE public.evaluations SET performance_score = 90 WHERE student_id = '${id(1)}'`);
  assert.equal(await clear(1), false, 'a pending appeal blocks clearance');

  console.log('PASS: only final evaluations, only after required hours; clearance no longer needs a midterm.');
}

main().catch(error => { console.error(error); process.exit(1); });
