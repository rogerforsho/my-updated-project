// Isolated PostgreSQL check: chat attachments and student tags only work inside an eligible
// Coordinator/Supervisor placement, and attachment paths must be server-written chat/<sender>/ files.
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

const C1 = '00000000-0000-4000-8000-0000000000c1';
const S1 = '00000000-0000-4000-8000-0000000000a1';
const S2 = '00000000-0000-4000-8000-0000000000a2';
const OUTSIDER = '00000000-0000-4000-8000-0000000000d1';
const ST = n => `00000000-0000-4000-8000-00000000010${n}`;
const FILE = '11111111-1111-4111-8111-111111111111';

async function main() {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
    GRANT ALL ON SCHEMA public TO anon, authenticated, service_role;
    CREATE SCHEMA auth; CREATE SCHEMA storage;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.uid', true), '')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
    CREATE TABLE storage.objects (bucket_id text, name text);
    CREATE FUNCTION public.ojt_security_revision() RETURNS integer LANGUAGE sql AS $$ SELECT 44 $$;
    CREATE FUNCTION public.course_department(c text) RETURNS text LANGUAGE sql AS
      $$ SELECT CASE WHEN c IN ('BSIT', 'BS-CPE') THEN 'ICS' WHEN c IN ('BSBA-HRM', 'BSENTREP') THEN 'IBE' END $$;
    CREATE TABLE public.users (user_id uuid PRIMARY KEY, full_name text, role text, account_status text);
    CREATE TABLE public.coordinators (user_id uuid PRIMARY KEY, department text);
    CREATE TABLE public.supervisors (supervisor_id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid);
    CREATE TABLE public.students (student_id uuid PRIMARY KEY, user_id uuid, student_number text, course text);
    CREATE TABLE public.student_assignments (student_id uuid, supervisor_id uuid, assignment_status text);
    CREATE TABLE public.staff_capability_grants (user_id uuid, capability text, department_scope text, revoked_at timestamptz);
    CREATE TABLE public.notifications (notification_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      sender_user_id uuid, receiver_user_id uuid, message text, status text NOT NULL DEFAULT 'unread');
  `);
  await db.exec(read('database', '035_coordinator_supervisor_chat.sql'));
  // Latest eligibility rule (20261019211849_four_account_roles.sql).
  await db.exec(`
    CREATE OR REPLACE FUNCTION public.chat_pair_is_eligible(p_coordinator_user_id uuid, p_supervisor_user_id uuid)
    RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public SET row_security = off AS $$
      SELECT EXISTS (
        SELECT 1 FROM public.users cu
        JOIN public.coordinators c ON c.user_id = cu.user_id
        JOIN public.staff_capability_grants g ON g.user_id = cu.user_id AND g.capability = 'academic_workflows' AND g.revoked_at IS NULL
        JOIN public.users su ON su.user_id = p_supervisor_user_id
        JOIN public.supervisors sp ON sp.user_id = su.user_id
        JOIN public.student_assignments sa ON sa.supervisor_id = sp.supervisor_id AND sa.assignment_status = 'active'
        JOIN public.students s ON s.student_id = sa.student_id
        WHERE cu.user_id = p_coordinator_user_id AND cu.role = 'Coordinator' AND cu.account_status = 'active'
          AND su.role = 'Supervisor' AND su.account_status = 'active'
          AND g.department_scope = public.course_department(s.course));
    $$;
  `);
  await db.exec(migration('20261024001000_chat_attachments_and_student_tags.sql'));

  await db.exec(`
    INSERT INTO public.users VALUES
      ('${C1}', 'Coord One', 'Coordinator', 'active'), ('${S1}', 'Super One', 'Supervisor', 'active'),
      ('${S2}', 'Super Two', 'Supervisor', 'active'), ('${OUTSIDER}', 'Outsider', 'Supervisor', 'active'),
      ('${ST(1)}', 'Ana Cruz', 'Student', 'active'), ('${ST(2)}', 'Ben Lee', 'Student', 'active'), ('${ST(3)}', 'Cy Dee', 'Student', 'active');
    INSERT INTO public.coordinators VALUES ('${C1}', 'ICS');
    INSERT INTO public.staff_capability_grants VALUES ('${C1}', 'academic_workflows', 'ICS', NULL);
    INSERT INTO public.supervisors(supervisor_id, user_id) VALUES
      ('00000000-0000-4000-8000-0000000000b1', '${S1}'), ('00000000-0000-4000-8000-0000000000b2', '${S2}'),
      ('00000000-0000-4000-8000-0000000000b3', '${OUTSIDER}');
    INSERT INTO public.students VALUES
      ('${ST(1)}', '${ST(1)}', '2021-0001', 'BSIT'), ('${ST(2)}', '${ST(2)}', '2021-0002', 'BSIT'), ('${ST(3)}', '${ST(3)}', '2021-0003', 'BSBA-HRM');
    INSERT INTO public.student_assignments VALUES
      ('${ST(1)}', '00000000-0000-4000-8000-0000000000b1', 'active'),
      ('${ST(3)}', '00000000-0000-4000-8000-0000000000b1', 'active'),
      ('${ST(2)}', '00000000-0000-4000-8000-0000000000b2', 'active');
    INSERT INTO storage.objects VALUES ('private-documents', 'chat/${C1}/${FILE}.pdf'), ('private-documents', 'chat/${S1}/${FILE}.png'),
      ('private-documents', 'chat-pending/${C1}/${FILE}.pdf');
  `);

  assert.equal((await db.query(`SELECT count(*)::int AS n, max(pronargs)::int AS args FROM pg_proc WHERE proname = 'send_chat_message'`)).rows[0].args, 5);
  assert.equal((await db.query(`SELECT count(*)::int AS n FROM pg_proc WHERE proname = 'send_chat_message'`)).rows[0].n, 1);

  const as = async (uid, sql) => {
    await db.exec(`SET ROLE authenticated; SELECT set_config('test.uid', '${uid}', false)`);
    try { return await db.query(sql); } finally { await db.exec('RESET ROLE'); }
  };
  const send = (uid, counterpart, text, attachment = 'NULL', name = 'NULL', tag = 'NULL') =>
    as(uid, `SELECT * FROM public.send_chat_message('${counterpart}', ${text}, ${attachment}, ${name}, ${tag})`);
  const lit = value => `'${value}'`;

  // Plain text still works through the two-argument call style.
  await as(C1, `SELECT * FROM public.send_chat_message('${S1}', 'hello')`);

  // Tags: only students of this pair's placement inside the coordinator's department.
  await send(C1, S1, lit('about Ana'), 'NULL', 'NULL', lit(ST(1)));
  const tagged = (await db.query(`SELECT tagged_student_id, tagged_student_label FROM public.chat_messages WHERE content = 'about Ana'`)).rows[0];
  assert.equal(tagged.tagged_student_id, ST(1));
  assert.equal(tagged.tagged_student_label, 'Ana Cruz (2021-0001)');
  await assert.rejects(() => send(C1, S1, lit('x'), 'NULL', 'NULL', lit(ST(2))), /cannot be tagged/);
  await assert.rejects(() => send(C1, S1, lit('x'), 'NULL', 'NULL', lit(ST(3))), /cannot be tagged/);
  await assert.rejects(() => send(C1, S2, lit('x'), 'NULL', 'NULL', lit(ST(1))), /cannot be tagged/);
  await send(C1, S2, lit('about Ben'), 'NULL', 'NULL', lit(ST(2)));
  await assert.rejects(() => send(OUTSIDER, C1, lit('x')), /not eligible/);

  const taggable = async (uid, counterpart) =>
    (await as(uid, `SELECT tag_student_number FROM public.list_chat_taggable_students('${counterpart}')`)).rows.map(row => row.tag_student_number);
  assert.equal(JSON.stringify(await taggable(C1, S1)), JSON.stringify(['2021-0001']));
  assert.equal(JSON.stringify(await taggable(S1, C1)), JSON.stringify(['2021-0001']));
  assert.equal(JSON.stringify(await taggable(C1, S2)), JSON.stringify(['2021-0002']));
  assert.equal((await taggable(OUTSIDER, C1)).length, 0);

  // Attachments: only existing server-written chat/<sender>/<uuid>.<ext> files.
  await send(C1, S1, lit(''), lit(`chat/${C1}/${FILE}.pdf`), lit('Plan.pdf'));
  const attached = (await db.query(`SELECT content, attachment_path, attachment_name FROM public.chat_messages WHERE attachment_name = 'Plan.pdf'`)).rows[0];
  assert.equal(attached.content, '');
  assert.equal(attached.attachment_path, `chat/${C1}/${FILE}.pdf`);
  await send(S1, C1, lit('see photo'), lit(`chat/${S1}/${FILE}.png`), lit('Site.png'));
  await assert.rejects(() => send(S1, C1, lit('x'), lit(`chat/${C1}/${FILE}.pdf`), lit('Stolen.pdf')), /Invalid chat attachment/);
  await assert.rejects(() => send(C1, S1, lit('x'), lit(`chat-pending/${C1}/${FILE}.pdf`), lit('Pending.pdf')), /Invalid chat attachment/);
  await assert.rejects(() => send(C1, S1, lit('x'), lit(`chat/${C1}/22222222-2222-4222-8222-222222222222.pdf`), lit('Missing.pdf')), /Invalid chat attachment/);
  await assert.rejects(() => send(C1, S1, lit('x'), lit(`chat/${C1}/${FILE}.exe`), lit('Bad.exe')), /Invalid chat attachment/);
  await assert.rejects(() => send(C1, S1, lit('x'), lit(`chat/${C1}/${FILE}.pdf`), lit('a/b.pdf')), /Invalid chat attachment/);
  await assert.rejects(() => send(C1, S1, lit('x'), lit(`chat/${C1}/${FILE}.pdf`), 'NULL'), /Invalid chat attachment/);
  await assert.rejects(() => send(C1, S1, lit('x'), 'NULL', lit('Orphan.pdf')), /Invalid chat attachment/);
  await assert.rejects(() => send(C1, S1, lit('   ')), /Invalid chat message/);

  console.log('Chat attachment and student tag checks passed.');
  await db.close();
}
main().catch(e => { console.error(e); process.exit(1); });
