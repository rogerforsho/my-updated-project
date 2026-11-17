// Seeds three demo Supervisors, each at their own company with one active ICS student, so a
// Coordinator's Messages page shows several conversations to choose from.
//
// A Supervisor only appears in Messages when chat_pair_is_eligible() is true: an active
// student_assignment whose course is in a department the Coordinator holds an
// academic_workflows grant for. Rows go in through the same tables the app uses.
//
// Dry run:  node --env-file=apps/web/.env.staging.local scripts/seed-staging-chat-demo.mjs
// Apply:    node --env-file=apps/web/.env.staging.local scripts/seed-staging-chat-demo.mjs --apply
// Remove:   node --env-file=apps/web/.env.staging.local scripts/seed-staging-chat-demo.mjs --undo
import { randomBytes, randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { createClient } from '@supabase/supabase-js';

const STAGING_HOST = 'xlkvjuwzcviicerpzdjz.supabase.co';
const TAG = 'chatdemo20261116';
const BUNDLE = 'Pre-deployment Requirements';

const apply = process.argv.includes('--apply');
const undo = process.argv.includes('--undo');
const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. Pass --env-file=apps/web/.env.staging.local.');
  process.exit(2);
}
const host = new URL(url).hostname;
if (host !== STAGING_HOST && !['127.0.0.1', 'localhost'].includes(host)) {
  console.error(`Refusing to run: ${host} is neither the approved staging project nor a local Supabase.`);
  process.exit(2);
}

const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
const ok = (label, { data, error }) => { if (error) throw new Error(`${label}: ${error.message}`); return data; };

const DEMO = ['Alpha', 'Bravo', 'Charlie'].map((n, i) => ({
  slug: n.toLowerCase(), company: `Demo Company ${n}`,
  supervisorName: `Demo Supervisor ${n}`, studentName: `Demo Student ${n}`,
  studentNumber: `23-9100${i + 1}`, course: 'BSIT',
  supervisorEmail: `${TAG}-sup-${n.toLowerCase()}@example.com`,
  studentEmail: `${TAG}-stu-${n.toLowerCase()}@example.com`,
}));

// ---- fixtures (same shapes as seed-staging-qa.mjs / seed-staging-validation.mjs)
function crc32(buf) {
  let crc = 0xffffffff;
  for (const b of buf) { crc ^= b; for (let i = 0; i < 8; i++) crc = (crc & 1) ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1; }
  return (crc ^ 0xffffffff) >>> 0;
}
function pngChunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const chunk = Buffer.alloc(body.length + 8);
  chunk.writeUInt32BE(data.length, 0); body.copy(chunk, 4); chunk.writeUInt32BE(crc32(body), body.length + 4);
  return chunk;
}
function syntheticPng() {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(1, 0); header.writeUInt32BE(1, 4); header[8] = 8; header[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(Buffer.from([0, 32, 96, 160, 255]))), pngChunk('IEND', Buffer.alloc(0))]);
}
function syntheticPdf(lines) {
  const esc = (t) => t.replace(/[\\()]/g, (c) => `\\${c}`);
  const content = lines.map((l, i) => `BT /F1 ${i ? 11 : 15} Tf 60 ${780 - i * 24} Td (${esc(l)}) Tj ET`).join('\n');
  const o = [];
  o[1] = '<< /Type /Catalog /Pages 2 0 R >>'; o[2] = '<< /Type /Pages /Kids [3 0 R] /Count 1 >>';
  o[3] = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>';
  o[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  o[5] = `<< /Length ${content.length} >>\nstream\n${content}\nendstream`;
  let body = '%PDF-1.4\n'; const off = [];
  for (let id = 1; id < o.length; id++) { off[id] = body.length; body += `${id} 0 obj\n${o[id]}\nendobj\n`; }
  const xref = body.length;
  body += `xref\n0 ${o.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < o.length; id++) body += `${String(off[id]).padStart(10, '0')} 00000 n \n`;
  body += `trailer\n<< /Size ${o.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(body, 'latin1');
}
const shift = (date, days) => { const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };
const TODAY = new Date().toISOString().slice(0, 10);

// ---- the Coordinators who will be able to see these Supervisors
async function icsCoordinators() {
  const grants = ok('Read ICS grants', await db.from('staff_capability_grants').select('user_id')
    .eq('capability', 'academic_workflows').eq('department_scope', 'ICS').is('revoked_at', null)) || [];
  if (!grants.length) return [];
  return ok('Read Coordinators', await db.from('users').select('user_id,full_name,email')
    .in('user_id', grants.map((g) => g.user_id)).eq('role', 'Coordinator').eq('account_status', 'active')) || [];
}

// ---- undo
if (undo) {
  const { users } = ok('List Auth users', await db.auth.admin.listUsers({ page: 1, perPage: 1000 }));
  const mine = users.filter((u) => u.email?.startsWith(`${TAG}-`));
  const ids = mine.map((u) => u.id);
  const students = ids.length ? ok('Find students', await db.from('students').select('student_id,id_card_front_path,id_card_back_path').in('user_id', ids)) || [] : [];
  const studentIds = students.map((s) => s.student_id);
  const companies = ok('Find companies', await db.from('companies').select('company_id').in('company_name', DEMO.map((d) => d.company))) || [];
  const companyIds = companies.map((c) => c.company_id);
  const reports = studentIds.length ? ok('Find reports', await db.from('reports').select('file_path').in('student_id', studentIds)) || [] : [];

  const del = async (table, col, vals) => {
    if (!vals.length) return;
    const { error } = await db.from(table).delete().in(col, vals);
    if (error) console.error(`  cleanup warning (${table}): ${error.message}`);
  };
  // Children first: assignments and reports point at students; supervisors point at companies.
  for (const t of ['reports', 'practicum_schedules', 'student_assignments', 'internship_progress']) await del(t, 'student_id', studentIds);
  await del('supervisors', 'user_id', ids);
  for (const u of mine) {
    const { error } = await db.auth.admin.deleteUser(u.id);
    if (error) console.error(`  cleanup warning (${u.email}): ${error.message}`);
  }
  await del('work_schedules', 'company_id', companyIds);
  await del('companies', 'company_id', companyIds);
  const paths = [...reports.map((r) => r.file_path), ...students.flatMap((s) => [s.id_card_front_path, s.id_card_back_path])].filter(Boolean);
  if (paths.length) {
    const { error } = await db.storage.from('private-documents').remove(paths);
    if (error) console.error(`  cleanup warning (storage): ${error.message}`);
  }
  console.log(`Removed ${mine.length} demo account(s) and ${companyIds.length} demo company(ies).`);
  process.exit(0);
}

const coordinators = await icsCoordinators();

if (!apply) {
  console.log(`Target: ${host}\n\nWould create ${DEMO.length} Supervisor + Student pairs, each at their own company:\n`);
  for (const d of DEMO) console.log(`  ${d.company.padEnd(22)} ${d.supervisorName.padEnd(24)} ${d.studentName} (${d.studentNumber}, ${d.course}, active placement)`);
  console.log('\nActive Coordinators with an ICS academic_workflows grant (they will see all three Supervisors):');
  if (!coordinators.length) console.log('  NONE. Do not apply: nobody would see these Supervisors.');
  for (const c of coordinators) console.log(`  ${c.full_name}  <${c.email}>`);
  console.log('\nNothing was sent. Rerun with --apply to create them.');
  process.exit(0);
}

// ---- apply
const password = `Demo-${randomBytes(9).toString('base64url')}`;
const madeUsers = [];
const madeCompanies = [];
const uploaded = [];
try {
  if (!coordinators.length) throw new Error('No active Coordinator holds an ICS academic_workflows grant; nobody would see these Supervisors.');
  const { users: existing } = ok('List Auth users', await db.auth.admin.listUsers({ page: 1, perPage: 1000 }));
  const taken = DEMO.flatMap((d) => [d.supervisorEmail, d.studentEmail]).filter((e) => existing.some((u) => u.email?.toLowerCase() === e));
  if (taken.length) throw new Error(`Already present, nothing changed: ${taken.join(', ')}. Run --undo first.`);
  const takenCompanies = ok('Check companies', await db.from('companies').select('company_name').in('company_name', DEMO.map((d) => d.company))) || [];
  if (takenCompanies.length) throw new Error(`Company already exists: ${takenCompanies.map((c) => c.company_name).join(', ')}. Run --undo first.`);

  const card = syntheticPng();
  const stamp = () => {
    const id = `${String(randomBytes(6).readUIntBE(0, 6) % 1_000_000_000_000).padStart(12, '0')}_${randomBytes(12).toString('hex')}`;
    return [`id-cards/${id}_front.png`, `id-cards/${id}_back.png`];
  };
  // The BEFORE INSERT Auth guard wants ID-card objects to exist before any account does.
  async function makeUser(email, name, role, extra = {}) {
    const [front, back] = stamp();
    for (const p of [front, back]) {
      ok(`Upload ${p}`, await db.storage.from('private-documents').upload(p, card, { contentType: 'image/png' }));
      uploaded.push(p);
    }
    const { data, error } = await db.auth.admin.createUser({
      email, password, email_confirm: true,
      user_metadata: { full_name: name, course: 'BSIT', year_level: 4, id_card_path: front, id_card_front_path: front, id_card_back_path: back, ...extra },
    });
    if (error) throw new Error(`Create ${email}: ${error.message}`);
    const user = { id: data.user.id, email, role, front, back };
    madeUsers.push(user);
    ok(`Set role ${email}`, await db.auth.admin.updateUserById(user.id, { app_metadata: { ...data.user.app_metadata, role } }));
    ok(`Activate ${email}`, await db.from('users').update({ role, account_status: 'active', must_change_password: false }).eq('user_id', user.id));
    return user;
  }

  const coordinator = coordinators[0];
  const start = shift(TODAY, -7);
  const end = shift(TODAY, 120);
  const report = [];

  for (const d of DEMO) {
    const company = ok(`Create ${d.company}`, await db.from('companies').insert({
      company_name: d.company, address: 'Synthetic demo address, Rodriguez, Rizal',
      contact_person: d.supervisorName, contact_email: d.supervisorEmail, contact_number: '0000000000',
      status: 'active', latitude: 14.7315, longitude: 121.1394, geofence_radius_meters: 50, // CHECK is 30..50 since 20261024000700 geofence_enabled: false,
      max_interns: 2, accepting_students: true,
    }).select('company_id').single());
    madeCompanies.push(company.company_id);
    const branch = ok(`Find ${d.company} branch`, await db.from('company_branches')
      .select('branch_id').eq('company_id', company.company_id).eq('is_primary', true).single());

    const sup = await makeUser(d.supervisorEmail, d.supervisorName, 'Supervisor');
    // Staff accounts get a throwaway students row from the signup trigger; drop it and its ID cards.
    ok(`Drop temp student row ${d.slug}`, await db.from('students').delete().eq('user_id', sup.id));
    ok(`Drop staff ID cards ${d.slug}`, await db.storage.from('private-documents').remove([sup.front, sup.back]));
    const supervisor = ok(`Create supervisor ${d.slug}`, await db.from('supervisors')
      .insert({ user_id: sup.id, company_id: company.company_id, position: 'Demo Supervisor' }).select('supervisor_id').single());

    const stu = await makeUser(d.studentEmail, d.studentName, 'Student', { student_number: d.studentNumber });
    const student = ok(`Find student ${d.slug}`, await db.from('students').select('student_id').eq('user_id', stu.id).single());
    ok(`Complete profile ${d.slug}`, await db.from('students').update({
      student_number: d.studentNumber, course: d.course, year_level: 4, status: 'active',
      id_card_path: stu.front, id_card_front_path: stu.front, id_card_back_path: stu.back,
    }).eq('student_id', student.student_id));

    const filePath = `${stu.id}/reports/${randomUUID()}.pdf`;
    ok(`Upload requirements ${d.slug}`, await db.storage.from('private-documents')
      .upload(filePath, syntheticPdf([BUNDLE, d.studentName, 'Synthetic demo document.']), { contentType: 'application/pdf' }));
    uploaded.push(filePath);
    ok(`Insert requirements ${d.slug}`, await db.from('reports').insert({
      student_id: student.student_id, report_type: BUNDLE, file_path: filePath, status: 'approved', submission_date: `${start}T08:30:00+08:00`,
    }));
    ok(`Insert schedule ${d.slug}`, await db.from('practicum_schedules').insert({
      student_id: student.student_id, company_id: company.company_id, branch_id: branch.branch_id,
      work_modality: 'on_site', work_days: [1, 2, 3, 4, 5], time_in: '09:00:00', time_out: '18:00:00',
      lunch_break_minutes: 60, lunch_break_start: '12:00:00', daily_hours: 8, weekly_hours: 40,
      start_date: start, end_date: end, status: 'approved',
      reviewed_by: coordinator.user_id, reviewed_at: `${start}T09:00:00+08:00`,
      student_notes: 'Synthetic demo schedule.', coordinator_feedback: 'Approved.',
    }));
    ok(`Insert assignment ${d.slug}`, await db.from('student_assignments').insert({
      student_id: student.student_id, company_id: company.company_id, branch_id: branch.branch_id,
      supervisor_id: supervisor.supervisor_id, start_date: start, end_date: end, assignment_status: 'active',
    }));
    report.push(`${d.company}\t${d.supervisorName}\t${d.supervisorEmail}\t${d.studentName}\t${d.studentEmail}`);
  }

  const credentialsPath = join(tmpdir(), `cdm-ojt-chat-demo-${Date.now()}.txt`);
  await writeFile(credentialsPath, [
    'CDM-OJT STAGING - CHAT DEMO ACCOUNTS (synthetic)', `Project: ${host}`, `Password (all accounts): ${password}`, '',
    'company\tsupervisor\tsupervisor email\tstudent\tstudent email', ...report, '',
    `Visible to Coordinator(s): ${coordinators.map((c) => c.email).join(', ')}`,
    `Remove with: node --env-file=apps/web/.env.staging.local scripts/seed-staging-chat-demo.mjs --undo`, '',
  ].join('\n'), { flag: 'wx' });
  console.log(`\nSeeded ${DEMO.length} Supervisor + Student pairs on ${host}.`);
  console.log(`Credentials (password not printed) written to:\n  ${credentialsPath}`);
  console.log('Delete that file after testing, and run --undo when finished.');
} catch (error) {
  console.error(`\nSeeding stopped: ${error.message}\nRolling back what this run created.`);
  const ids = madeUsers.map((u) => u.id);
  if (ids.length) {
    const rows = ok('Find students', await db.from('students').select('student_id').in('user_id', ids)) || [];
    const sids = rows.map((r) => r.student_id);
    for (const t of ['reports', 'practicum_schedules', 'student_assignments', 'internship_progress']) {
      if (sids.length) await db.from(t).delete().in('student_id', sids);
    }
    await db.from('supervisors').delete().in('user_id', ids);
  }
  for (const u of [...madeUsers].reverse()) await db.auth.admin.deleteUser(u.id);
  if (madeCompanies.length) {
    await db.from('work_schedules').delete().in('company_id', madeCompanies);
    await db.from('companies').delete().in('company_id', madeCompanies);
  }
  if (uploaded.length) await db.storage.from('private-documents').remove(uploaded);
  process.exitCode = 1;
}
