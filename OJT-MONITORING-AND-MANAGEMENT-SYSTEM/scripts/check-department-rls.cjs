// Isolated PostgreSQL policy regression harness. No network or .env loading.
// Supply @electric-sql/pglite through NODE_PATH or install it in a temporary prefix.
const { PGlite } = require('@electric-sql/pglite');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

async function main() {
  const db = new PGlite();
  const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  let checks = 0;
  await db.exec(`
    CREATE ROLE anon NOLOGIN;
    CREATE ROLE authenticated NOLOGIN;
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE SCHEMA storage;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    CREATE TABLE public.users (user_id uuid PRIMARY KEY, role text, account_status text);
    CREATE TABLE public.program_heads (user_id uuid, department_or_program text);
    CREATE TABLE public.students (student_id uuid PRIMARY KEY, user_id uuid, course text);
    CREATE TABLE public.supervisors (supervisor_id uuid, user_id uuid);
    CREATE TABLE public.student_assignments (student_id uuid, supervisor_id uuid, assignment_status text);
    CREATE TABLE public.attendance (student_id uuid);
    CREATE TABLE public.reports (student_id uuid);
    CREATE TABLE public.evaluations (student_id uuid);
    CREATE TABLE public.internship_progress (student_id uuid);
    CREATE TABLE public.certificates (student_id uuid);
    CREATE TABLE public.practicum_schedules (student_id uuid);
    CREATE TABLE storage.objects (bucket_id text, name text);
    CREATE FUNCTION public.get_my_role() RETURNS text LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public SET row_security = off AS
      $$ SELECT role FROM public.users WHERE user_id = auth.uid() AND account_status = 'active' $$;
    CREATE FUNCTION public.get_my_student_id() RETURNS uuid LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public SET row_security = off AS
      $$ SELECT student_id FROM public.students WHERE user_id = auth.uid() $$;
    INSERT INTO public.users VALUES
      ('${id(1)}', 'ProgramHead', 'active'), ('${id(2)}', 'ProgramHead', 'active'),
      ('${id(3)}', 'Supervisor', 'active'), ('${id(4)}', 'Student', 'active'),
      ('${id(5)}', 'Student', 'active'), ('${id(6)}', 'Admin', 'active'),
      ('${id(7)}', 'ProgramHead', 'active'), ('${id(8)}', 'Coordinator', 'active');
    INSERT INTO public.program_heads VALUES ('${id(1)}','ICS'), ('${id(2)}','IBE'), ('${id(7)}','ALL');
    INSERT INTO public.students VALUES ('${id(14)}','${id(4)}','BSIT'), ('${id(15)}','${id(5)}','BSENTREP');
    INSERT INTO public.supervisors VALUES ('${id(13)}','${id(3)}');
    INSERT INTO public.student_assignments VALUES ('${id(14)}','${id(13)}','active'), ('${id(15)}','${id(13)}','completed');
    INSERT INTO public.certificates VALUES ('${id(14)}'), ('${id(15)}');
    INSERT INTO public.reports VALUES ('${id(14)}'), ('${id(15)}');
    INSERT INTO public.evaluations VALUES ('${id(14)}'), ('${id(15)}');
    INSERT INTO public.practicum_schedules VALUES ('${id(14)}'), ('${id(15)}');
    INSERT INTO storage.objects VALUES
      ('private-documents','${id(4)}/report.pdf'), ('private-documents','${id(14)}/mobile.pdf'),
      ('private-documents','${id(5)}/report.pdf'), ('private-documents','${id(15)}/mobile.pdf');
    GRANT USAGE ON SCHEMA public, auth, storage TO authenticated, anon;
    GRANT ALL ON ALL TABLES IN SCHEMA public, storage TO authenticated, anon;
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
    CREATE POLICY legacy_broad_storage ON storage.objects FOR SELECT TO authenticated USING (true);
    CREATE POLICY public_verify_certificate ON public.certificates FOR SELECT USING (true);
  `);
  // Deliberately broad legacy policies verify that the new restrictive boundaries
  // still win. This is a minimal schema fixture, not a full migration-chain test.
  for (const table of ['users', 'students', 'student_assignments', 'attendance', 'reports', 'evaluations', 'internship_progress', 'certificates', 'practicum_schedules']) {
    await db.exec(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`);
    if (table === 'users') {
      await db.exec(`CREATE POLICY legacy_broad_read ON public.users FOR SELECT TO authenticated USING (true);
        CREATE POLICY coordinator_update_users ON public.users FOR UPDATE TO authenticated USING (public.get_my_role() IN ('Coordinator', 'Admin')) WITH CHECK (public.get_my_role() IN ('Coordinator', 'Admin'))`);
    } else if (table !== 'certificates') await db.exec(`CREATE POLICY legacy_broad_access ON public.${table} FOR ALL TO authenticated USING (true) WITH CHECK (true)`);
  }
  const sql = fs.readFileSync(path.join(__dirname, '../database/migrations/029_department_and_document_scope.sql'), 'utf8');
  await db.exec(sql);
  await db.exec(sql); // Idempotent retry.
  async function asUser(n, query) {
    await db.exec(`RESET ROLE; SET ROLE authenticated; SET request.jwt.claim.sub = '${id(n)}'`);
    return (await db.query(query)).rows;
  }
  async function count(n, table, expected) {
    const rows = await asUser(n, `SELECT count(*)::int AS n FROM ${table}`);
    assert.equal(rows[0].n, expected, `${n} / ${table}`);
    checks++;
  }
  for (const n of [1, 2]) {
    await count(n, 'public.students', 1);
    await count(n, 'public.certificates', 1);
    await count(n, 'public.users', 3); // own identity + own-department student + supervisor directory
    await count(n, 'storage.objects', 2); // user-id and student-id prefixes
    const ownStudent = n === 1 ? id(14) : id(15);
    const foreignStudent = n === 1 ? id(15) : id(14);
    const result = await asUser(n, `UPDATE public.students SET course = course RETURNING student_id`);
    assert.equal(result.length, 1); checks++;
    await assert.rejects(() => asUser(n, `UPDATE public.students SET course = '${n === 1 ? 'BSENTREP' : 'BSIT'}' WHERE student_id = '${ownStudent}'`)); checks++;
    await assert.rejects(() => asUser(n, `INSERT INTO public.reports VALUES ('${id(14)}')`)); checks++;
    for (const table of ['reports', 'evaluations', 'practicum_schedules']) {
      const changed = await asUser(n, `UPDATE public.${table} SET student_id = student_id RETURNING student_id`);
      assert.deepEqual(changed.map(row => row.student_id), [ownStudent]); checks++;
      await assert.rejects(() => asUser(n, `UPDATE public.${table} SET student_id = '${foreignStudent}' WHERE student_id = '${ownStudent}'`)); checks++;
    }
    await asUser(n, `INSERT INTO public.student_assignments VALUES ('${ownStudent}', '${id(13)}', 'active')`); checks++;
    await assert.rejects(() => asUser(n, `INSERT INTO public.student_assignments VALUES ('${foreignStudent}', '${id(13)}', 'active')`)); checks++;
    assert.equal((await asUser(n, 'UPDATE public.certificates SET student_id = student_id RETURNING student_id')).length, 0); checks++;
    assert.equal((await asUser(n, "UPDATE public.users SET role = 'Admin' RETURNING user_id")).length, 0); checks++;
    // Remove the extra fixtures as the database owner before testing storage.
    await db.exec(`RESET ROLE; DELETE FROM public.student_assignments WHERE ctid IN (SELECT ctid FROM public.student_assignments WHERE student_id = '${ownStudent}' ORDER BY ctid DESC LIMIT 1)`);
  }
  await count(7, 'public.students', 0);
  await count(7, 'storage.objects', 0);
  await count(3, 'storage.objects', 2); // completed assignment gives no access
  await count(4, 'storage.objects', 2);
  await count(4, 'public.certificates', 1);
  await count(6, 'storage.objects', 4);
  await count(8, 'storage.objects', 4);
  await count(6, 'public.certificates', 2);
  await db.exec(`RESET ROLE; UPDATE public.users SET account_status = 'inactive' WHERE user_id = '${id(3)}'`);
  await count(3, 'storage.objects', 0);
  await db.exec('RESET ROLE; SET ROLE anon');
  await assert.rejects(() => db.query('SELECT * FROM public.certificates')); checks++;
  await db.close();
  console.log(`PASS: ${checks} isolated PostgreSQL policy checks; migration applied twice; no remote database used.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
