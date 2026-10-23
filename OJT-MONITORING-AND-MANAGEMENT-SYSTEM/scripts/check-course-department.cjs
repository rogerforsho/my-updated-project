// Isolated PostgreSQL check: a student row must map to ICS or IBE, otherwise no Coordinator could see it.
const { PGlite } = require('@electric-sql/pglite');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

async function main() {
  const root = path.join(__dirname, '..');
  const file = '20261024001200_student_course_department_required.sql';
  const migration = fs.readFileSync(path.join(root, 'database/migrations', file), 'utf8');
  assert.equal(fs.readFileSync(path.join(root, 'supabase/migrations', file), 'utf8'), migration, 'migration copies must match');
  const courseDepartment = fs.readFileSync(path.join(root, 'database/migrations/029_department_and_document_scope.sql'), 'utf8')
    .match(/CREATE OR REPLACE FUNCTION public\.course_department[\s\S]*?\$\$;/)[0];
  const { COURSE_DEPARTMENT } = await import('../shared/courses.ts'); // Node 23+ strips TS types natively

  const db = new PGlite();
  await db.exec(`CREATE TABLE public.students(student_id int PRIMARY KEY, course text);
    ${courseDepartment}
    INSERT INTO public.students VALUES (1, 'BS Nursing');`);
  await db.exec(migration);
  await db.exec(migration); // reapplying must be safe

  await db.exec(`INSERT INTO public.students VALUES (2, 'BSIT'), (3, 'BS-CPE'), (4, 'BSBA-HRM'), (5, 'BSENTREP')`);
  await assert.rejects(db.exec(`INSERT INTO public.students VALUES (6, 'BS Nursing')`), /students_course_has_department/);
  await assert.rejects(db.exec(`INSERT INTO public.students VALUES (7, NULL)`), /students_course_has_department/);
  await assert.rejects(db.exec(`UPDATE public.students SET course = 'Unknown' WHERE student_id = 2`), /students_course_has_department/);
  const legacy = await db.query(`SELECT course FROM public.students WHERE student_id = 1`);
  assert.equal(legacy.rows[0].course, 'BS Nursing', 'legacy rows stay loadable until fixed');

  // The app's course list must agree with the database mapping.
  for (const [course, department] of Object.entries(COURSE_DEPARTMENT)) {
    const { rows } = await db.query('SELECT public.course_department($1) AS d', [course]);
    assert.equal(rows[0].d, department, `${course} must map to ${department} in both app and database`);
  }
  console.log('PASS: students must have a course in ICS or IBE; legacy rows survive; app course mapping matches the database.');
}

main().catch(error => { console.error(error); process.exit(1); });
