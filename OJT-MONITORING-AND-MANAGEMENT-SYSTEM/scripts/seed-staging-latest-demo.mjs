// Demo data for the five latest loop/integration changes, in CDM-OJT Staging (synthetic, tagged).
//  Ana  - ongoing: Weekly Journals (one awaiting Supervisor review), no Final Report yet -> "build from journals"
//         on mobile; today is a scheduled work day with no time-in -> phone reminders; Notifications tab; Group Chat.
//  Ben  - finished hours, final evaluation 89, Final Report approved, NO Host Training Establishment evaluation
//         -> Coordinator clearance is blocked at gateway 3.
//  Cara - same as Ben but the HTE evaluation is submitted -> clearance ready (no certificate is issued).
// Dry run:  node --env-file=apps/web/.env.staging.local scripts/seed-staging-latest-demo.mjs
// Apply:    ... --apply        Remove: ... --undo
import { randomBytes, randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { createClient } from '@supabase/supabase-js';

const STAGING_HOST = 'xlkvjuwzcviicerpzdjz.supabase.co';
const TAG = 'latest20261120';
const COMPANY = 'Demo Company Latest';
const BUNDLE = 'Pre-deployment Requirements';
const apply = process.argv.includes('--apply');
const undo = process.argv.includes('--undo');
const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('Pass --env-file=apps/web/.env.staging.local.'); process.exit(2); }
const host = new URL(url).hostname;
if (host !== STAGING_HOST && !['127.0.0.1', 'localhost'].includes(host)) {
  console.error(`Refusing to run: ${host} is neither the approved staging project nor a local Supabase.`); process.exit(2);
}
const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
const ok = (label, { data, error }) => { if (error) throw new Error(`${label}: ${error.message}`); return data; };

const STUDENTS = [
  { slug: 'ana', name: 'Demo Ana Journal', no: '23-92001' },
  { slug: 'ben', name: 'Demo Ben Gateway', no: '23-92002' },
  { slug: 'cara', name: 'Demo Cara Cleared', no: '23-92003' },
].map((s) => ({ ...s, email: `${TAG}-stu-${s.slug}@example.com` }));
const SUP = { name: 'Demo Supervisor Latest', email: `${TAG}-sup@example.com` };

// ---- fixtures (same shapes as seed-staging-chat-demo.mjs)
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
const TODAY = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10); // Manila date
const isWorkDay = (d) => ![0, 6].includes(new Date(`${d}T00:00:00Z`).getUTCDay());
const workDaysBefore = (before, count) => { const out = []; for (let d = shift(before, -1); out.length < count; d = shift(d, -1)) if (isWorkDay(d)) out.unshift(d); return out; };
const at = (date, time) => new Date(`${date}T${time}+08:00`).toISOString();
const RUBRIC = { technical_competence: 25, productivity_dependability: 20, attendance_punctuality: 20, communication_skills: 15, work_ethics_professionalism: 20 };
const RATING = { technical_competence: 5, productivity_dependability: 4, attendance_punctuality: 5, communication_skills: 4, work_ethics_professionalism: 4 };
const points = Object.fromEntries(Object.entries(RUBRIC).map(([k, w]) => [k, (w * RATING[k]) / 5]));
const finalScore = Object.values(points).reduce((a, b) => a + b, 0);
// Auth users have no tag filter, so page through all of them.
async function listAllUsers() {
  const all = [];
  for (let page = 1; ; page++) {
    const { users } = ok('List Auth users', await db.auth.admin.listUsers({ page, perPage: 1000 }));
    all.push(...users);
    if (users.length < 1000) return all;
  }
}
const HTE_RATINGS = Object.fromEntries(['A1', 'A2', 'A3', 'B1', 'B2', 'B3', 'C1', 'C2', 'C3', 'D1', 'D2'].map((id) => [id, 5]));

// ---- undo. Attendance first: recompute_internship_progress() re-inserts progress after an attendance delete.
if (undo) {
  const users = await listAllUsers();
  const mine = users.filter((u) => u.email?.startsWith(`${TAG}-`));
  const ids = mine.map((u) => u.id);
  const students = ids.length ? ok('Find students', await db.from('students').select('student_id,id_card_front_path,id_card_back_path').in('user_id', ids)) || [] : [];
  const sids = students.map((s) => s.student_id);
  const companies = ok('Find company', await db.from('companies').select('company_id').eq('company_name', COMPANY)) || [];
  const cids = companies.map((c) => c.company_id);
  const reports = sids.length ? ok('Find reports', await db.from('reports').select('file_path').in('student_id', sids)) || [] : [];
  const selfies = sids.length ? ok('Find selfies', await db.from('attendance').select('time_in_selfie_path').in('student_id', sids)) || [] : [];
  const del = async (table, col, vals) => {
    if (!vals.length) return;
    const { error } = await db.from(table).delete().in(col, vals);
    if (error) console.error(`  cleanup warning (${table}): ${error.message}`);
  };
  await del('attendance', 'student_id', sids);
  for (const t of ['reports', 'evaluations', 'hte_evaluations', 'practicum_schedules', 'student_assignments', 'internship_progress']) await del(t, 'student_id', sids);
  await del('notifications', 'receiver_user_id', ids);
  await del('group_chat_messages', 'sender_user_id', ids);
  await del('supervisors', 'user_id', ids);
  for (const u of mine) {
    const { error } = await db.auth.admin.deleteUser(u.id);
    if (error) console.error(`  cleanup warning (${u.email}): ${error.message}`);
  }
  await del('work_schedules', 'company_id', cids);
  await del('companies', 'company_id', cids);
  const paths = [...reports.map((r) => r.file_path), ...students.flatMap((s) => [s.id_card_front_path, s.id_card_back_path])].filter(Boolean);
  if (paths.length) await db.storage.from('private-documents').remove(paths);
  const sp = [...new Set(selfies.map((r) => r.time_in_selfie_path).filter(Boolean))];
  if (sp.length) await db.storage.from('attendance-selfies').remove(sp);
  console.log(`Removed ${mine.length} demo account(s) and ${cids.length} demo company.`);
  process.exit(0);
}

const grants = ok('Read ICS grants', await db.from('staff_capability_grants').select('user_id')
  .eq('capability', 'academic_workflows').eq('department_scope', 'ICS').is('revoked_at', null)) || [];
const coordinators = grants.length ? ok('Read Coordinators', await db.from('users').select('user_id,full_name,email')
  .in('user_id', grants.map((g) => g.user_id)).eq('role', 'Coordinator').eq('account_status', 'active')) || [] : [];

if (!apply) {
  console.log(`Target: ${host}\n\nWould create company "${COMPANY}", Supervisor ${SUP.name} <${SUP.email}> and:`);
  for (const s of STUDENTS) console.log(`  ${s.name} (${s.no}) <${s.email}>`);
  console.log('\nCoordinators who will see them:', coordinators.map((c) => c.email).join(', ') || 'NONE - do not apply');
  console.log('\nNothing was sent. Rerun with --apply.');
  process.exit(0);
}

const password = `Demo-${randomBytes(9).toString('base64url')}`;
const madeUsers = []; const madeCompanies = []; const uploaded = [];
try {
  if (!coordinators.length) throw new Error('No active ICS Coordinator; nobody would see these students.');
  const existing = await listAllUsers();
  const taken = [SUP.email, ...STUDENTS.map((s) => s.email)].filter((e) => existing.some((u) => u.email?.toLowerCase() === e));
  if (taken.length) throw new Error(`Already present: ${taken.join(', ')}. Run --undo first.`);
  if ((ok('Check company', await db.from('companies').select('company_id').eq('company_name', COMPANY)) || []).length) throw new Error(`${COMPANY} exists. Run --undo first.`);

  const card = syntheticPng();
  const stamp = () => {
    const id = `${String(randomBytes(6).readUIntBE(0, 6) % 1_000_000_000_000).padStart(12, '0')}_${randomBytes(12).toString('hex')}`;
    return [`id-cards/${id}_front.png`, `id-cards/${id}_back.png`];
  };
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
  const uploadPdf = async (userId, title, lines) => {
    const p = `${userId}/reports/${randomUUID()}.pdf`;
    ok(`Upload ${title}`, await db.storage.from('private-documents').upload(p, syntheticPdf([title, ...lines]), { contentType: 'application/pdf' }));
    uploaded.push(p);
    return p;
  };

  const coordinator = coordinators[0];
  const company = ok('Create company', await db.from('companies').insert({
    company_name: COMPANY, address: 'Synthetic demo address, Rodriguez, Rizal', contact_person: SUP.name,
    contact_email: SUP.email, contact_number: '0000000000', status: 'active',
    latitude: 14.7315, longitude: 121.1394, geofence_radius_meters: 50, geofence_enabled: false,
    max_interns: 5, accepting_students: true,
  }).select('company_id').single());
  madeCompanies.push(company.company_id);
  const branch = ok('Find branch', await db.from('company_branches').select('branch_id').eq('company_id', company.company_id).eq('is_primary', true).single());

  const sup = await makeUser(SUP.email, SUP.name, 'Supervisor');
  ok('Drop temp student row', await db.from('students').delete().eq('user_id', sup.id));
  await db.storage.from('private-documents').remove([sup.front, sup.back]);
  const supervisor = ok('Create supervisor', await db.from('supervisors')
    .insert({ user_id: sup.id, company_id: company.company_id, position: 'Demo Supervisor' }).select('supervisor_id').single());

  const selfie = `${randomUUID()}/time_in_demo.jpg`;
  ok('Upload selfie', await db.storage.from('attendance-selfies').upload(selfie, card, { contentType: 'image/jpeg' }));
  uploaded.push(selfie); // stored in a different bucket; undo removes it by path

  for (const s of STUDENTS) {
    const finished = s.slug !== 'ana';
    const days = workDaysBefore(TODAY, finished ? 63 : 10); // 63 x 8h clears the 486h ICS requirement
    const start = days[0]; const end = finished ? days[days.length - 1] : shift(TODAY, 100);
    const stu = await makeUser(s.email, s.name, 'Student', { student_number: s.no });
    s.userId = stu.id;
    s.studentId = ok(`Find ${s.slug}`, await db.from('students').select('student_id').eq('user_id', stu.id).single()).student_id;
    ok(`Profile ${s.slug}`, await db.from('students').update({
      student_number: s.no, course: 'BSIT', year_level: 4, status: 'active',
      id_card_path: stu.front, id_card_front_path: stu.front, id_card_back_path: stu.back,
    }).eq('student_id', s.studentId));
    ok(`Requirements ${s.slug}`, await db.from('reports').insert({
      student_id: s.studentId, report_type: BUNDLE, status: 'approved', submission_date: at(start, '08:30:00'),
      file_path: await uploadPdf(stu.id, BUNDLE, [s.name, 'Synthetic demo document.']),
    }));
    ok(`Schedule ${s.slug}`, await db.from('practicum_schedules').insert({
      student_id: s.studentId, company_id: company.company_id, branch_id: branch.branch_id,
      work_modality: 'on_site', work_days: [1, 2, 3, 4, 5], time_in: '09:00:00', time_out: '18:00:00',
      lunch_break_minutes: 60, lunch_break_start: '12:00:00', daily_hours: 8, weekly_hours: 40,
      start_date: start, end_date: end, status: 'approved',
      reviewed_by: coordinator.user_id, reviewed_at: at(start, '09:00:00'), student_notes: 'Synthetic demo schedule.', coordinator_feedback: 'Approved.',
    }));
    const assignment = ok(`Assignment ${s.slug}`, await db.from('student_assignments').insert({
      student_id: s.studentId, company_id: company.company_id, branch_id: branch.branch_id,
      supervisor_id: supervisor.supervisor_id, start_date: start, end_date: end, assignment_status: 'active',
    }).select('assignment_id').single());
    const rows = days.map((date) => ({
      student_id: s.studentId, assignment_id: assignment.assignment_id, attendance_date: date,
      time_in: at(date, '09:00:00'), time_out: at(date, '18:00:00'),
      time_in_selfie_path: selfie, time_out_selfie_path: selfie, qr_validation_status: 'valid',
      verification_status: 'verified', late_status: 'on_time', sync_status: 'synced', synced_at: at(date, '18:00:00'),
    }));
    for (let i = 0; i < rows.length; i += 50) ok(`Attendance ${s.slug}`, await db.from('attendance').insert(rows.slice(i, i + 50)));

    const journalTotal = s.slug === 'ana' ? 4 : 2;
    for (let i = 0; i < journalTotal; i++) {
      const date = days[Math.min(days.length - 1, Math.floor(((i + 1) * days.length) / (journalTotal + 1)))];
      const undecided = s.slug === 'ana' && i === journalTotal - 1; // waits in the Supervisor queue
      ok(`Journal ${s.slug}`, await db.from('reports').insert({
        student_id: s.studentId, report_type: 'Weekly Journal', status: undecided ? 'submitted' : 'approved',
        submission_date: at(date, '17:30:00'),
        file_path: await uploadPdf(stu.id, 'Weekly Journal', [s.name, `Week ${i + 1}: tasks, learnings and blockers.`]),
        ...(undecided ? {} : {
          supervisor_decision: 'approved', supervisor_decided_by: sup.id, supervisor_decided_at: at(date, '18:30:00'),
          supervisor_feedback: 'Clear and consistent with the plan.', supervisor_endorsed_at: at(date, '18:30:00'),
        }),
      }));
    }

    if (finished) {
      ok(`Final evaluation ${s.slug}`, await db.from('evaluations').insert({
        student_id: s.studentId, supervisor_id: supervisor.supervisor_id, evaluation_type: 'final',
        performance_score: finalScore, rubric_scores: points,
        evaluation_date: end, feedback: 'Finished every deliverable on time. Recommended for hire.',
      }));
      ok(`Final report ${s.slug}`, await db.from('reports').insert({
        student_id: s.studentId, report_type: 'final_report', status: 'approved', submission_date: at(end, '16:00:00'),
        file_path: await uploadPdf(stu.id, 'Final Narrative Report', [s.name, `Compiled from weekly journals at ${COMPANY}.`]),
        remarks: 'Complete and consistent with the verified attendance record.',
      }));
      if (s.slug === 'cara') {
        ok('HTE evaluation cara', await db.from('hte_evaluations').insert({
          student_id: s.studentId, company_id: company.company_id, branch_id: branch.branch_id,
          department_assigned: 'IT Department', field_of_training: 'Software development',
          ratings: HTE_RATINGS, total_score: 100, comments: 'Great mentors and real projects.', submitted_at: at(end, '17:00:00'),
        }));
      }
    }
  }

  // ---- Notifications tab and Group Chat (ICS group)
  const [ana, ben, cara] = STUDENTS;
  const notes = [
    [ana, 'Your Supervisor reviewed your Weekly Journal for week 3.', 'unread'],
    [ana, 'Reminder: your Weekly Journal for this week is due Friday.', 'unread'],
    [ana, 'Your schedule was approved by your Coordinator.', 'read'],
    [ben, 'Clearance is on hold: submit your Evaluation of the Host Training Establishment.', 'unread'],
    [ben, 'Your Final Report was approved.', 'read'],
    [cara, 'All clearance requirements are complete. Your Coordinator will issue your certificate.', 'unread'],
  ];
  ok('Notifications', await db.from('notifications').insert(notes.map(([s, message, status], i) => ({
    sender_user_id: i % 2 ? coordinator.user_id : sup.id, receiver_user_id: s.userId, message, status,
    notification_date: new Date(Date.now() - i * 3600e3).toISOString(),
  }))));
  const chat = [
    [ana, 'Student', 'Hi all, anyone know how the Final Report builds from the journals?'],
    [cara, 'Student', 'It merges every Weekly Journal into one PDF, then you review it.'],
    [ben, 'Student', 'Do we need the HTE evaluation before clearance now?'],
    [cara, 'Student', 'Yes, it is gateway 3. It takes about two minutes.'],
  ];
  ok('Group chat', await db.from('group_chat_messages').insert(chat.map(([s, role, content], i) => ({
    department: 'ICS', sender_user_id: s.userId, sender_name: s.name, sender_role: role, content, client_id: randomUUID(),
    created_at: new Date(Date.now() - (chat.length - i) * 600e3).toISOString(),
  }))));

  const prog = ok('Progress', await db.from('internship_progress').select('student_id,completed_hours').in('student_id', STUDENTS.map((s) => s.studentId)));
  const credentialsPath = join(tmpdir(), `cdm-ojt-latest-demo-${Date.now()}.txt`);
  await writeFile(credentialsPath, [
    'CDM-OJT STAGING - LATEST-CHANGES DEMO (synthetic)', `Project: ${host}`, `Password (all accounts): ${password}`, '',
    `Supervisor: ${SUP.email}`, ...STUDENTS.map((s) => `${s.name}: ${s.email}`), '',
    `Coordinators who see them: ${coordinators.map((c) => c.email).join(', ')}`,
    'Remove: node --env-file=apps/web/.env.staging.local scripts/seed-staging-latest-demo.mjs --undo', '',
  ].join('\n'), { flag: 'wx' });
  console.log('Completed hours:', prog.map((p) => `${STUDENTS.find((s) => s.studentId === p.student_id).slug}=${p.completed_hours}`).join(' '));
  console.log(`Seeded on ${host}. Credentials (password not printed): ${credentialsPath}`);
} catch (error) {
  console.error(`\nSeeding stopped: ${error.message}\nRolling back what this run created.`);
  const ids = madeUsers.map((u) => u.id);
  if (ids.length) {
    const sids = ((await db.from('students').select('student_id').in('user_id', ids)).data || []).map((r) => r.student_id);
    if (sids.length) await db.from('attendance').delete().in('student_id', sids);
    for (const t of ['reports', 'evaluations', 'hte_evaluations', 'practicum_schedules', 'student_assignments', 'internship_progress']) {
      if (sids.length) await db.from(t).delete().in('student_id', sids);
    }
    await db.from('notifications').delete().in('receiver_user_id', ids);
    await db.from('group_chat_messages').delete().in('sender_user_id', ids);
    await db.from('supervisors').delete().in('user_id', ids);
  }
  for (const u of [...madeUsers].reverse()) await db.auth.admin.deleteUser(u.id);
  if (madeCompanies.length) {
    await db.from('work_schedules').delete().in('company_id', madeCompanies);
    await db.from('companies').delete().in('company_id', madeCompanies);
  }
  const priv = uploaded.filter((p) => !p.includes('time_in_demo'));
  if (priv.length) await db.storage.from('private-documents').remove(priv);
  await db.storage.from('attendance-selfies').remove(uploaded.filter((p) => p.includes('time_in_demo')));
  process.exitCode = 1;
}
