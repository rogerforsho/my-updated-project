// Isolated PostgreSQL check: department group chat and Coordinator documents only reach members of
// the same department, and only service_role RPCs can write.
const { PGlite } = require('@electric-sql/pglite');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const migration = ['20261118000400_group_chat_and_documents.sql', '20261118000600_group_chat_client_id.sql']
  .map(f => fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', f), 'utf8')).join('\n');

const id = n => `00000000-0000-4000-8000-0000000000${n}`;
const ICS_COORD = id('c1'), IBE_COORD = id('c2');
const ICS_A = id('a1'), ICS_B = id('a2'), IBE_A = id('a3'), INACTIVE = id('a4');
const FILE = '11111111-1111-4111-8111-111111111111';

async function main() {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
    GRANT ALL ON SCHEMA public TO anon, authenticated, service_role;
    CREATE SCHEMA auth; CREATE SCHEMA storage;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.uid', true), '')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
    GRANT USAGE ON SCHEMA storage TO anon, authenticated, service_role;
    CREATE TABLE storage.objects (bucket_id text, name text);
    GRANT SELECT ON storage.objects TO service_role;
    CREATE FUNCTION public.course_department(c text) RETURNS text LANGUAGE sql AS
      $$ SELECT CASE WHEN c IN ('BSIT', 'BS-CPE') THEN 'ICS' WHEN c IN ('BSBA-HRM', 'BSENTREP') THEN 'IBE' END $$;
    CREATE TABLE public.users (user_id uuid PRIMARY KEY, full_name text, role text, account_status text);
    CREATE TABLE public.students (student_id uuid PRIMARY KEY, user_id uuid, course text);
    CREATE TABLE public.staff_capability_grants (user_id uuid, capability text, department_scope text, revoked_at timestamptz);
    CREATE TABLE public.notifications (notification_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      sender_user_id uuid, receiver_user_id uuid, message text, status text NOT NULL DEFAULT 'unread');
  `);
  await db.exec(migration);
  await db.exec(`
    INSERT INTO public.users VALUES
      ('${ICS_COORD}', 'Ics Coord', 'Coordinator', 'active'), ('${IBE_COORD}', 'Ibe Coord', 'Coordinator', 'active'),
      ('${ICS_A}', 'Ana', 'Student', 'active'), ('${ICS_B}', 'Ben', 'Student', 'active'),
      ('${IBE_A}', 'Cy', 'Student', 'active'), ('${INACTIVE}', 'Dee', 'Student', 'inactive');
    INSERT INTO public.staff_capability_grants VALUES
      ('${ICS_COORD}', 'academic_workflows', 'ICS', NULL), ('${IBE_COORD}', 'academic_workflows', 'IBE', NULL);
    INSERT INTO public.students VALUES
      ('${ICS_A}', '${ICS_A}', 'BSIT'), ('${ICS_B}', '${ICS_B}', 'BS-CPE'),
      ('${IBE_A}', '${IBE_A}', 'BSBA-HRM'), ('${INACTIVE}', '${INACTIVE}', 'BSIT');
    INSERT INTO storage.objects VALUES ('private-documents', 'chat/${ICS_COORD}/${FILE}.pdf');
  `);

  const as = async (uid, sql) => {
    await db.exec(`SET ROLE authenticated; SELECT set_config('test.uid', '${uid}', false)`);
    try { return await db.query(sql); } finally { await db.exec('RESET ROLE'); }
  };
  const post = (sender, dept, text, clientId) =>
    db.query(`SELECT * FROM public.post_group_chat_message('${sender}', '${dept}', '${text}'${clientId ? `, '${clientId}'` : ''})`);
  const send = (sender, dept, ids, path = `chat/${ICS_COORD}/${FILE}.pdf`) =>
    db.query(`SELECT * FROM public.send_coordinator_document('${sender}', '${dept}', 'Syllabus', '${path}', 'Syllabus.pdf', ${ids})`);
  const visible = async (uid, table) => (await as(uid, `SELECT count(*)::int AS n FROM public.${table}`)).rows[0].n;

  // ---- group chat
  await post(ICS_COORD, 'ICS', 'hello ICS');
  await post(ICS_A, 'ICS', 'hi coordinator');
  await post(IBE_COORD, 'IBE', 'hello IBE');
  await assert.rejects(() => post(IBE_COORD, 'ICS', 'x'), /Not a member/);
  await assert.rejects(() => post(IBE_A, 'ICS', 'x'), /Not a member/);
  await assert.rejects(() => post(INACTIVE, 'ICS', 'x'), /Not a member/);
  await assert.rejects(() => post(ICS_A, 'ICS', '   '), /Invalid group chat message/);
  await assert.rejects(() => post(ICS_A, 'XYZ', 'x'), /Invalid group chat message/);

  assert.equal(await visible(ICS_A, 'group_chat_messages'), 2);
  assert.equal(await visible(ICS_COORD, 'group_chat_messages'), 2);
  assert.equal(await visible(IBE_A, 'group_chat_messages'), 1);
  assert.equal(await visible(INACTIVE, 'group_chat_messages'), 0);
  await assert.rejects(() => as(ICS_A, `INSERT INTO public.group_chat_messages(department, sender_user_id, sender_name, sender_role, content)
    VALUES ('ICS', '${ICS_A}', 'Ana', 'Student', 'direct')`), /permission denied/);
  await assert.rejects(() => as(ICS_A, `SELECT public.post_group_chat_message('${ICS_A}', 'ICS', 'x')`), /permission denied/);

  // A retried offline message (same client_id) is stored once and returns the same row.
  const CID = '33333333-3333-4333-8333-333333333333', CID2 = '44444444-4444-4444-8444-444444444444';
  const first = (await post(ICS_A, 'ICS', 'sent offline', CID)).rows[0];
  const retry = (await post(ICS_A, 'ICS', 'sent offline', CID)).rows[0];
  assert.equal(retry.message_id, first.message_id);
  await post(ICS_A, 'ICS', 'another', CID2);
  await post(ICS_A, 'ICS', 'no id');
  await post(ICS_A, 'ICS', 'no id');
  assert.equal(await visible(ICS_A, 'group_chat_messages'), 2 + 1 + 1 + 2);
  // The same client_id from another sender is a different message.
  assert.notEqual((await post(ICS_B, 'ICS', 'sent offline', CID)).rows[0].message_id, first.message_id);

  // ---- documents
  await assert.rejects(() => send(ICS_A, 'ICS', 'NULL'), /Only a Coordinator/);
  await assert.rejects(() => send(IBE_COORD, 'ICS', 'NULL'), /Only a Coordinator/);
  await assert.rejects(() => send(ICS_COORD, 'ICS', 'NULL', `chat/${ICS_COORD}/22222222-2222-4222-8222-222222222222.pdf`), /Invalid document file/);
  await assert.rejects(() => send(ICS_COORD, 'ICS', 'NULL', `chat/${IBE_COORD}/${FILE}.pdf`), /Invalid document file/);
  await assert.rejects(() => send(ICS_COORD, 'ICS', `ARRAY['${IBE_A}']::uuid[]`), /active students of this department/);
  await assert.rejects(() => send(ICS_COORD, 'ICS', `ARRAY['${INACTIVE}']::uuid[]`), /active students of this department/);
  await assert.rejects(() => send(ICS_COORD, 'ICS', `ARRAY[]::uuid[]`), /active students of this department/);

  // One chosen student: only they see it.
  const one = (await send(ICS_COORD, 'ICS', `ARRAY['${ICS_A}']::uuid[]`)).rows[0];
  assert.equal(one.recipient_count, 1);
  assert.equal(await visible(ICS_A, 'coordinator_documents'), 1);
  assert.equal(await visible(ICS_B, 'coordinator_documents'), 0);
  assert.equal(await visible(IBE_A, 'coordinator_documents'), 0);
  assert.equal(await visible(IBE_COORD, 'coordinator_documents'), 0);
  assert.equal(await visible(ICS_COORD, 'coordinator_documents'), 1);
  assert.equal(await visible(ICS_B, 'coordinator_document_recipients'), 0);
  assert.equal(await visible(ICS_COORD, 'coordinator_document_recipients'), 1);

  // Whole department: every active ICS student, one notification each.
  const all = (await send(ICS_COORD, 'ICS', 'NULL')).rows[0];
  assert.equal(all.recipient_count, 2);
  assert.equal(await visible(ICS_B, 'coordinator_documents'), 1);
  assert.equal((await db.query(`SELECT count(*)::int AS n FROM public.notifications WHERE message LIKE 'New document%'`)).rows[0].n, 3);
  assert.equal((await db.query(`SELECT count(*)::int AS n FROM public.notifications WHERE receiver_user_id = '${IBE_A}'`)).rows[0].n, 0);
  await assert.rejects(() => as(ICS_COORD, `INSERT INTO public.coordinator_documents(department, title, file_path, file_name, sent_by)
    VALUES ('ICS', 't', 'chat/x', 'x.pdf', '${ICS_COORD}')`), /permission denied/);

  console.log('Group chat and Coordinator document checks passed.');
  await db.close();
}
main().catch(e => { console.error(e); process.exit(1); });
