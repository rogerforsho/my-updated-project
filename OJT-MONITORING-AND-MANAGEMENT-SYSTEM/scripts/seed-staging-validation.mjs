// Seeds nine synthetic students across the three real OJT stages, so an IT validation
// can be walked role by role: Supervisor, Coordinator (ICS), Admin.
//
//   Stage 1  Awaiting documents  - registered, gateway not cleared, no placement yet
//   Stage 2  Ongoing             - gateway cleared, schedule approved, hours accumulating
//   Stage 3  Finished            - hours met, final report approved, graded, certificate issued
//
// Every row goes in through the same tables and triggers the app uses, so progress hours,
// credited hours, clearance and notifications are all computed by the database, not asserted here.
//
// Dry run:  node --env-file=apps/web/.env.staging.local scripts/seed-staging-validation.mjs
// Apply:    node --env-file=apps/web/.env.staging.local scripts/seed-staging-validation.mjs --apply
// Remove:   node --env-file=apps/web/.env.staging.local scripts/seed-staging-validation.mjs --undo
import { randomBytes, randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { createClient } from '@supabase/supabase-js';

const STAGING_HOST = 'xlkvjuwzcviicerpzdjz.supabase.co';
const COHORT_TAG = 'val20261113';
const EMAIL_DOMAIN = 'example.com';

const apply = process.argv.includes('--apply');
const undo = process.argv.includes('--undo');
const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !key || !anonKey) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_ANON_KEY. Pass --env-file=apps/web/.env.staging.local.');
  process.exit(2);
}
const host = new URL(url).hostname;
const isStaging = host === STAGING_HOST;
if (!isStaging && !['127.0.0.1', 'localhost'].includes(host)) {
  console.error(`Refusing to run: ${host} is neither the approved staging project nor a local Supabase.`);
  process.exit(2);
}

const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
const ok = (label, { data, error }) => { if (error) throw new Error(`${label}: ${error.message}`); return data; };

// ---------------------------------------------------------------- the cohort

// Scores are rated 1-5 per criterion; the weighted percentage is computed the way
// createEvaluation() does, so a hand-picked target score can never drift from the rubric.
const RUBRIC_WEIGHTS = {
  technical_competence: 25, productivity_dependability: 20, attendance_punctuality: 20,
  communication_skills: 15, work_ethics_professionalism: 20,
};
const rubric = (t, p, a, c, w) => ({
  technical_competence: t, productivity_dependability: p, attendance_punctuality: a,
  communication_skills: c, work_ethics_professionalism: w,
});
function scoreOf(criteria) {
  const points = Object.fromEntries(Object.keys(RUBRIC_WEIGHTS)
    .map((k) => [k, (RUBRIC_WEIGHTS[k] * criteria[k]) / 5]));
  return { points, score: Object.values(points).reduce((sum, v) => sum + v, 0) };
}

const GATEWAY = ['Parent/Guardian Consent Waiver', 'Medical Certificate', 'Pre-OJT Orientation Certificate', 'Endorsement Letter'];

// All nine are ICS courses (BSIT/BS-CPE) so the one staging Coordinator, who is scoped to ICS,
// sees every stage. shortcut: no IBE students here; add an IBE Coordinator before seeding any.
const COHORT = [
  // Stage 1 - awaiting documents. No placement, so the Supervisor correctly sees none of these.
  { slug: 'doc-none', name: 'Mariel A. Santos', number: '23-90001', course: 'BSIT', stage: 'documents',
    docs: [], note: 'Just approved at registration. No gateway document uploaded yet.' },
  { slug: 'doc-partial', name: 'Jerome P. Dela Cruz', number: '23-90002', course: 'BS-CPE', stage: 'documents',
    docs: [['Parent/Guardian Consent Waiver', 'approved'], ['Medical Certificate', 'approved'], ['Pre-OJT Orientation Certificate', 'submitted']],
    note: 'Two approved, orientation certificate waiting in the Coordinator queue, endorsement letter not uploaded.' },
  { slug: 'doc-returned', name: 'Aira Nicole Mendoza', number: '23-90003', course: 'BSIT', stage: 'documents',
    docs: [['Parent/Guardian Consent Waiver', 'approved'], ['Medical Certificate', 'approved'], ['Pre-OJT Orientation Certificate', 'approved'], ['Endorsement Letter', 'rejected']],
    note: 'Endorsement letter rejected with remarks; student must re-upload before a schedule can be proposed.' },

  // Stage 2 - ongoing. Gateway cleared, schedule approved, assignment active, hours building up.
  { slug: 'ojt-early', name: 'Kevin B. Ramos', number: '23-90004', course: 'BS-CPE', stage: 'ongoing',
    days: 8, pendingDay: true, journals: 2, undecidedJournal: true,
    note: 'First weeks on site. One attendance day still pending Supervisor verification and one daily journal undecided.' },
  { slug: 'ojt-mid', name: 'Nicole V. Bautista', number: '23-90005', course: 'BSIT', stage: 'ongoing',
    days: 17, journals: 3, midterm: rubric(4, 5, 5, 4, 4),
    note: 'Roughly a third of the way through 486 hours, midterm evaluation already submitted.' },
  { slug: 'ojt-near', name: 'Paulo S. Villanueva', number: '23-90006', course: 'BS-CPE', stage: 'ongoing',
    days: 30, journals: 3, midterm: rubric(5, 4, 4, 4, 4), finalReport: 'submitted',
    note: 'All 240 hours rendered and the final report is submitted, but no final evaluation yet, so the database still refuses clearance.' },

  // Stage 3 - finished. Cleared by the database's own clearance rule, then certificated.
  { slug: 'done-cpe', name: 'Hannah Grace Reyes', number: '23-90007', course: 'BS-CPE', stage: 'finished',
    days: 30, journals: 4, midterm: rubric(5, 5, 4, 5, 4), final: rubric(5, 5, 5, 4, 5), grade: 1.25,
    note: 'Completed 240 hours, both evaluations passed, certificate issued.' },
  { slug: 'done-bsit', name: 'Mark Anthony L. Cruz', number: '23-90008', course: 'BSIT', stage: 'finished',
    days: 61, journals: 5, midterm: rubric(5, 4, 4, 4, 4), final: rubric(5, 4, 5, 4, 4), grade: 1.50,
    note: 'Completed 486 hours over roughly three months, certificate issued.' },
  { slug: 'done-bsit2', name: 'Jasmine T. Lopez', number: '23-90009', course: 'BSIT', stage: 'finished',
    days: 62, journals: 5, midterm: rubric(4, 5, 5, 5, 5), final: rubric(5, 5, 5, 4, 5), grade: 1.25,
    note: 'Completed 486 hours with the strongest evaluations in the cohort, certificate issued.' },
].map((s) => ({ ...s, email: `${COHORT_TAG}-${s.slug}@${EMAIL_DOMAIN}` }));

// ---------------------------------------------------------------- undo

/**
 * Deletes every academic row these students own, in the only order the triggers allow,
 * then the accounts. Returns the students that could not be touched.
 *
 * Two schema facts drive the order:
 *  - recompute_internship_progress() runs AFTER DELETE on attendance and re-inserts the
 *    progress row, so attendance has to go while the students row still exists.
 *  - guard_ojt_completion_certificate() refuses DELETE unless current_user is postgres,
 *    so a certificated student cannot be removed through the API at all.
 */
async function removeStudents(accounts) {
  if (!accounts.length) return [];
  const ids = accounts.map((a) => a.userId ?? a.id);
  const rows = ok('Find students', await db.from('students').select('student_id,user_id').in('user_id', ids)) || [];
  const certs = ok('Find certificates', await db.from('certificates')
    .select('student_id').in('student_id', rows.map((r) => r.student_id))) || [];
  const locked = new Set(certs.map((c) => c.student_id));
  const free = rows.filter((r) => !locked.has(r.student_id));
  const freeIds = free.map((r) => r.student_id);

  for (const table of ['ojt_final_grades', 'incident_reports', 'company_requests', 'evaluation_appeals', 'attendance', 'internship_progress']) {
    if (freeIds.length) {
      const { error } = await db.from(table).delete().in('student_id', freeIds);
      if (error) console.error(`  cleanup warning (${table}): ${error.message}`);
    }
  }
  const lockedUserIds = new Set(rows.filter((r) => locked.has(r.student_id)).map((r) => r.user_id));
  for (const account of accounts) {
    const id = account.userId ?? account.id;
    if (lockedUserIds.has(id)) continue;
    const { error } = await db.auth.admin.deleteUser(id);
    if (error) console.error(`  cleanup warning (${account.email}): ${error.message}`);
  }
  return accounts.filter((a) => lockedUserIds.has(a.userId ?? a.id));
}

if (undo) {
  const { users } = ok('List Auth users', await db.auth.admin.listUsers({ page: 1, perPage: 1000 }));
  const mine = users.filter((u) => u.email?.startsWith(`${COHORT_TAG}-`));
  if (!mine.length) { console.log('Nothing to remove: no accounts carry this cohort tag.'); process.exit(0); }
  const kept = await removeStudents(mine);
  console.log(`Removed ${mine.length - kept.length} of ${mine.length} validation account(s).`);
  if (kept.length) {
    console.log(`\n${kept.length} student(s) hold an issued certificate, and the database forbids deleting one`);
    console.log('except as the postgres role. Run this in the Supabase SQL editor to remove them:\n');
    console.log(`  delete from public.certificates where student_id in (select student_id from public.students`);
    console.log(`    where user_id in (select id from auth.users where email like '${COHORT_TAG}-%'));`);
    console.log(`  delete from public.attendance where student_id in (select student_id from public.students`);
    console.log(`    where user_id in (select id from auth.users where email like '${COHORT_TAG}-%'));`);
    console.log(`  delete from public.ojt_final_grades where student_id in (select student_id from public.students`);
    console.log(`    where user_id in (select id from auth.users where email like '${COHORT_TAG}-%'));`);
    console.log(`  delete from public.internship_progress where student_id in (select student_id from public.students`);
    console.log(`    where user_id in (select id from auth.users where email like '${COHORT_TAG}-%'));`);
    console.log(`  delete from auth.users where email like '${COHORT_TAG}-%';`);
    console.log('\nThen rerun --undo for anything left.');
  }
  process.exit(0);
}

// ---------------------------------------------------------------- fixtures

function crc32(buf) {
  let crc = 0xffffffff;
  for (const b of buf) { crc ^= b; for (let i = 0; i < 8; i++) crc = (crc & 1) ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1; }
  return (crc ^ 0xffffffff) >>> 0;
}
function pngChunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const chunk = Buffer.alloc(body.length + 8);
  chunk.writeUInt32BE(data.length, 0);
  body.copy(chunk, 4);
  chunk.writeUInt32BE(crc32(body), body.length + 4);
  return chunk;
}
/** A 1x1 PNG. Stands in for an ID card and a time-in selfie; no real face is ever uploaded. */
function syntheticPng() {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(1, 0); header.writeUInt32BE(1, 4);
  header[8] = 8; header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(Buffer.from([0, 32, 96, 160, 255]))),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

/** A one-page PDF carrying the given lines. Same object layout as apps/web/src/lib/simple-pdf.ts. */
function syntheticPdf(lines) {
  const esc = (t) => t.replace(/[\\()]/g, (c) => `\\${c}`);
  const content = lines
    .map((line, i) => `BT /F1 ${i ? 11 : 15} Tf 60 ${780 - i * 24} Td (${esc(line)}) Tj ET`)
    .join('\n');
  const objects = [];
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = '<< /Type /Pages /Kids [3 0 R] /Count 1 >>';
  objects[3] = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>';
  objects[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  objects[5] = `<< /Length ${content.length} >>\nstream\n${content}\nendstream`;
  let body = '%PDF-1.4\n';
  const offsets = [];
  for (let id = 1; id < objects.length; id++) { offsets[id] = body.length; body += `${id} 0 obj\n${objects[id]}\nendobj\n`; }
  const xref = body.length;
  body += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id++) body += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  body += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  const bytes = Buffer.alloc(body.length);
  for (let i = 0; i < body.length; i++) bytes[i] = body.charCodeAt(i) & 0xff;
  return bytes;
}

// ---------------------------------------------------------------- dates

const MANILA_OFFSET = '+08:00';
const TODAY = new Date().toISOString().slice(0, 10);
const shift = (date, days) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const isWorkDay = (date) => ![0, 6].includes(new Date(`${date}T00:00:00Z`).getUTCDay());
/** `count` work days (Mon-Fri, matching work_days = [1..5]) from `from` forwards. */
function workDaysFrom(from, count) {
  const out = [];
  for (let d = from; out.length < count; d = shift(d, 1)) if (isWorkDay(d)) out.push(d);
  return out;
}
/** `count` work days ending on the last work day before `before`, oldest first. */
function workDaysBefore(before, count) {
  const out = [];
  for (let d = shift(before, -1); out.length < count; d = shift(d, -1)) if (isWorkDay(d)) out.unshift(d);
  return out;
}
const at = (date, time) => new Date(`${date}T${time}${MANILA_OFFSET}`).toISOString();
const plusMonths = (date, months) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
};

// 09:00-18:00 with a 60-minute lunch at 12:00 credits exactly 8 hours through
// snapshot_attendance_credited_hours(), so hours per student are days x 8.
const SHIFT = { in: '09:00:00', out: '18:00:00', lunch: '12:00:00', lunchMinutes: 60, daily: 8, weekly: 40 };
// The finished cohort wrapped up months ago; 62 work days from here all land in the past.
const FINISHED_START = '2026-07-01';

// ---------------------------------------------------------------- plan

const plan = COHORT.map((s) => {
  // Ongoing students clock up to yesterday, so their dashboards look current at any run date.
  // Students still chasing documents registered two weeks ago and have no attendance at all.
  const dates = s.stage === 'finished' ? workDaysFrom(FINISHED_START, s.days)
    : s.stage === 'ongoing' ? workDaysBefore(TODAY, s.days)
    : [];
  const start = dates[0] || shift(TODAY, -14);
  // A day left pending verification earns no credit yet, so it does not count towards hours.
  const credited = Math.max(0, (s.days || 0) - (s.pendingDay ? 1 : 0));
  return { ...s, start, end: plusMonths(start, 4), hours: credited * SHIFT.daily, dates };
});

if (!apply) {
  console.log(`Target: ${host}${isStaging ? ' (approved staging project)' : ' (local Supabase)'}`);
  console.log(`\nWould create ${plan.length} students, all ICS, all placed with the existing staging Supervisor:\n`);
  for (const stage of ['documents', 'ongoing', 'finished']) {
    console.log(`  ${stage.toUpperCase()}`);
    for (const s of plan.filter((p) => p.stage === stage)) {
      const bits = [s.number, s.course];
      if (s.hours) bits.push(`${s.hours}h over ${s.days} days`);
      if (s.docs) bits.push(`${s.docs.filter(([, st]) => st === 'approved').length}/4 gateway docs approved`);
      if (s.grade) bits.push(`final grade ${s.grade.toFixed(2)}`);
      console.log(`    ${s.name.padEnd(24)} ${bits.join(' | ')}`);
      console.log(`      ${s.note}`);
    }
    console.log('');
  }
  console.log('Also: raises QA Staging Company max_interns so the active placements fit.');
  console.log('Nothing was sent. Review the plan, then rerun with --apply.');
  process.exit(0);
}

// ---------------------------------------------------------------- apply

const password = `Val-${randomBytes(9).toString('base64url')}`;
const created = [];
const uploaded = [];
const staffCredentials = [];

try {
  const { users: existing } = ok('List Auth users', await db.auth.admin.listUsers({ page: 1, perPage: 1000 }));
  const taken = plan.filter((s) => existing.some((u) => u.email?.toLowerCase() === s.email));
  if (taken.length) throw new Error(`Already present, nothing changed: ${taken.map((s) => s.email).join(', ')}. Run --undo first.`);

  // Anchor every placement on the Supervisor and company the staging QA fixtures already use,
  // so the existing Supervisor login sees the whole cohort.
  const hosts = ok('List supervisors', await db.from('supervisors').select('supervisor_id,company_id,user_id,position'));
  // Staging has the QA fixture Supervisor; a local rehearsal just takes whichever exists.
  const supervisor = hosts.find((h) => h.position === 'QA Staging Supervisor') || hosts[0];
  if (!supervisor) throw new Error('No Supervisor exists yet, so there is nothing to place students with.');
  const branch = ok('Find primary branch', await db.from('company_branches')
    .select('branch_id').eq('company_id', supervisor.company_id).eq('is_primary', true).single());
  const coordinator = ok('Find ICS coordinator', await db.from('coordinators')
    .select('user_id').ilike('department', '%ICS%').limit(1).single());

  // Issuing a final grade and a certificate is gated on private.get_my_role() = 'Coordinator'
  // and auth.uid(), with no service-role bypass, so the finished cohort has to be finalized by a
  // signed-in Coordinator. These synthetic staff logins are also what the validation runs on,
  // so give them a known password and hand all of them over in the credentials file.
  // On staging only the qa-* fixture accounts may be touched, so a real person's Gmail login
  // can never have its password reset. A local Supabase holds nothing but test accounts.
  const isSynthetic = (email = '') => isStaging
    ? /^qa-(coordinator|coordinator-ics|coordinator-ibe|admin|supervisor)-/.test(email) && email.endsWith('@example.com')
    : email.endsWith('@local.test') || email.endsWith('@example.com');
  const staff = existing.filter((u) => isSynthetic(u.email) && ['Coordinator', 'Admin', 'Supervisor'].includes(u.app_metadata?.role));
  for (const u of staff) {
    ok(`Reset password for ${u.email}`, await db.auth.admin.updateUserById(u.id, { password }));
    ok(`Clear forced change for ${u.email}`, await db.from('users').update({ must_change_password: false }).eq('user_id', u.id));
    staffCredentials.push(`${u.app_metadata?.role || 'Staff'}\t${u.email}`);
  }
  const coordinatorAccount = staff.find((u) => u.id === coordinator.user_id);
  if (!coordinatorAccount) throw new Error('The ICS Coordinator is not one of the synthetic QA staff accounts; refusing to change a real account password.');

  const asCoordinator = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const signIn = await asCoordinator.auth.signInWithPassword({ email: coordinatorAccount.email, password });
  if (signIn.error) throw new Error(`Sign in as Coordinator: ${signIn.error.message}`);

  // company_is_open() counts active assignments against max_interns and would reject the cohort.
  const company = ok('Read host company', await db.from('companies')
    .select('company_name,max_interns,accepting_students').eq('company_id', supervisor.company_id).single());
  const neededSlots = plan.filter((s) => s.stage !== 'documents').length + 4;
  if (company.max_interns !== null && company.max_interns < neededSlots) {
    ok('Raise host company intake', await db.from('companies')
      .update({ max_interns: neededSlots, accepting_students: true }).eq('company_id', supervisor.company_id));
    console.log(`Raised ${company.company_name} max_interns ${company.max_interns} -> ${neededSlots}.`);
  }

  const card = syntheticPng();
  for (const s of plan) {
    // The BEFORE INSERT Auth guard reads these ID-card paths out of the signup metadata,
    // so the objects have to exist before the account does.
    const stamp = `${String(randomBytes(6).readUIntBE(0, 6) % 1_000_000_000_000).padStart(12, '0')}_${randomBytes(12).toString('hex')}`;
    s.frontPath = `id-cards/${stamp}_front.png`;
    s.backPath = `id-cards/${stamp}_back.png`;
    for (const path of [s.frontPath, s.backPath]) {
      ok(`Upload ID card for ${s.slug}`, await db.storage.from('private-documents').upload(path, card, { contentType: 'image/png' }));
      uploaded.push(path);
    }

    const { data, error } = await db.auth.admin.createUser({
      email: s.email, password, email_confirm: true,
      user_metadata: {
        full_name: s.name, course: s.course, year_level: 4, student_number: s.number,
        id_card_path: s.frontPath, id_card_front_path: s.frontPath, id_card_back_path: s.backPath,
      },
    });
    if (error) throw new Error(`Create ${s.email}: ${error.message}`);
    s.userId = data.user.id;
    created.push(s);

    ok(`Set role for ${s.slug}`, await db.auth.admin.updateUserById(s.userId, {
      app_metadata: { ...data.user.app_metadata, role: 'Student' },
    }));
    // A Coordinator-approved registration: active, and not forced through a password change.
    ok(`Activate ${s.slug}`, await db.from('users')
      .update({ role: 'Student', account_status: 'active', must_change_password: false }).eq('user_id', s.userId));

    // The signup trigger already made the students row; required_hours comes from the course trigger.
    const student = ok(`Find student row for ${s.slug}`, await db.from('students')
      .select('student_id').eq('user_id', s.userId).single());
    s.studentId = student.student_id;
    ok(`Complete profile for ${s.slug}`, await db.from('students').update({
      student_number: s.number, course: s.course, year_level: 4, status: 'active',
      id_card_path: s.frontPath, id_card_front_path: s.frontPath, id_card_back_path: s.backPath,
    }).eq('student_id', s.studentId));
  }

  const uploadReport = async (s, label, body) => {
    const path = `${s.userId}/reports/${randomUUID()}.pdf`;
    ok(`Upload ${label} for ${s.slug}`, await db.storage.from('private-documents')
      .upload(path, syntheticPdf(body), { contentType: 'application/pdf' }));
    uploaded.push(path);
    return path;
  };

  for (const s of plan) {
    const header = [`${label(s.course)} - ${s.name}`, `Student number: ${s.number}`, 'Synthetic document for IT validation.'];

    // -------- gateway documents
    const gatewayDocs = s.stage === 'documents' ? s.docs : GATEWAY.map((name) => [name, 'approved']);
    for (const [name, status] of gatewayDocs) {
      const file_path = await uploadReport(s, name, [name, ...header]);
      ok(`Insert ${name} for ${s.slug}`, await db.from('reports').insert({
        student_id: s.studentId, report_type: name, file_path, status,
        submission_date: at(s.start, '08:30:00'),
        remarks: status === 'rejected' ? 'Scanned copy is unreadable and the HTE signature is missing. Please upload a clear, signed copy.' : null,
      }));
    }
    if (s.stage === 'documents') continue;

    // -------- approved schedule, then the placement
    ok(`Insert schedule for ${s.slug}`, await db.from('practicum_schedules').insert({
      student_id: s.studentId, company_id: supervisor.company_id, branch_id: branch.branch_id,
      work_modality: 'on_site', work_days: [1, 2, 3, 4, 5],
      time_in: SHIFT.in, time_out: SHIFT.out,
      lunch_break_minutes: SHIFT.lunchMinutes, lunch_break_start: SHIFT.lunch,
      daily_hours: SHIFT.daily, weekly_hours: SHIFT.weekly,
      start_date: s.start, end_date: s.end, status: 'approved',
      reviewed_by: coordinator.user_id, reviewed_at: at(s.start, '09:00:00'),
      student_notes: 'Synthetic validation schedule.',
      coordinator_feedback: 'Approved. Report to the Main Branch on your start date.',
    }));
    // Active for now: credited_hours is only computed for an active assignment, and the
    // finished cohort is flipped to completed after its attendance is in.
    const assignment = ok(`Insert assignment for ${s.slug}`, await db.from('student_assignments').insert({
      student_id: s.studentId, company_id: supervisor.company_id, branch_id: branch.branch_id,
      supervisor_id: supervisor.supervisor_id,
      start_date: s.start, end_date: s.end, assignment_status: 'active',
    }).select('assignment_id').single());

    // -------- attendance; internship_progress is recomputed by the database from these rows
    const selfie = `${s.studentId}/time_in_${randomUUID()}.jpg`;
    ok(`Upload selfie for ${s.slug}`, await db.storage.from('attendance-selfies')
      .upload(selfie, card, { contentType: 'image/jpeg' }));
    uploaded.push(selfie);

    const rows = s.dates.map((date, i) => ({
      student_id: s.studentId, assignment_id: assignment.assignment_id, attendance_date: date,
      time_in: at(date, SHIFT.in), time_out: at(date, SHIFT.out),
      time_in_selfie_path: selfie, time_out_selfie_path: selfie,
      qr_validation_status: 'valid',
      // One day left pending shows the Supervisor's verification queue with something in it.
      verification_status: (s.pendingDay && i === s.dates.length - 1) ? 'pending' : 'verified',
      late_status: i % 11 === 5 ? 'late' : 'on_time',
      sync_status: 'synced', synced_at: at(date, SHIFT.out),
    }));
    for (let i = 0; i < rows.length; i += 50) {
      ok(`Insert attendance for ${s.slug}`, await db.from('attendance').insert(rows.slice(i, i + 50)));
    }

    // -------- daily journals; the newest one can sit undecided in the Supervisor queue
    for (let i = 0; i < (s.journals || 0); i++) {
      const date = s.dates[Math.min(s.dates.length - 1, Math.floor((i + 1) * s.dates.length / (s.journals + 1)))];
      const undecided = s.undecidedJournal && i === s.journals - 1;
      const file_path = await uploadReport(s, 'Daily Journal', ['Daily Journal', ...header, `Covering week of ${date}.`]);
      ok(`Insert journal for ${s.slug}`, await db.from('reports').insert({
        student_id: s.studentId, report_type: 'Daily Journal', file_path,
        status: undecided ? 'submitted' : 'approved',
        submission_date: at(date, '17:30:00'),
        ...(undecided ? {} : {
          supervisor_decision: 'approved',
          supervisor_decided_by: supervisor.user_id,
          supervisor_decided_at: at(date, '18:30:00'),
          supervisor_feedback: 'Tasks are clear and match the agreed learning plan.',
          supervisor_endorsed_at: at(date, '18:30:00'),
        }),
      }));
    }

    // -------- evaluations
    for (const [type, criteria] of [['midterm', s.midterm], ['final', s.final]]) {
      if (!criteria) continue;
      const { points, score } = scoreOf(criteria);
      const when = s.dates[Math.min(s.dates.length - 1, type === 'midterm' ? Math.floor(s.dates.length / 2) : s.dates.length - 1)];
      ok(`Insert ${type} evaluation for ${s.slug}`, await db.from('evaluations').insert({
        student_id: s.studentId, supervisor_id: supervisor.supervisor_id,
        evaluation_type: type, performance_score: score, rubric_scores: points,
        evaluation_date: when,
        feedback: type === 'midterm'
          ? 'Dependable and quick to pick up the internal tools. Needs to speak up earlier when a task is blocked.'
          : 'Finished every assigned deliverable on time and documented the handover well. Recommended for hire.',
      }));
    }

    // -------- final report
    if (s.finalReport || s.stage === 'finished') {
      const status = s.stage === 'finished' ? 'approved' : s.finalReport;
      const file_path = await uploadReport(s, 'final report', [
        'Final Narrative Report', ...header,
        `Hours rendered: ${s.hours}`, `Host training establishment: ${company.company_name}`,
      ]);
      ok(`Insert final report for ${s.slug}`, await db.from('reports').insert({
        student_id: s.studentId, report_type: 'final_report', file_path, status,
        submission_date: at(s.dates[s.dates.length - 1], '16:00:00'),
        remarks: status === 'approved' ? 'Complete and consistent with the verified attendance record.' : null,
      }));
    }

    if (s.stage !== 'finished') continue;

    // -------- completion. The certificate trigger re-checks clearance, and once a certificate
    // exists every academic row for the student is locked, so this is the last write.
    ok(`Close assignment for ${s.slug}`, await db.from('student_assignments')
      .update({ assignment_status: 'completed' }).eq('assignment_id', assignment.assignment_id));
    const progress = ok(`Read progress for ${s.slug}`, await db.from('internship_progress')
      .select('completed_hours').eq('student_id', s.studentId).single());
    // As the Coordinator, not the service role: these two writes go through the real guards,
    // which means the database itself confirms the student met every clearance requirement.
    ok(`Record final grade for ${s.slug}`, await asCoordinator.from('ojt_final_grades')
      .insert({ student_id: s.studentId, final_grade: s.grade, recorded_by_user_id: coordinator.user_id }));
    s.certificateCode = `CDM-OJT-2026-${randomBytes(4).toString('hex').toUpperCase()}`;
    ok(`Issue certificate for ${s.slug}`, await asCoordinator.from('certificates').insert({
      student_id: s.studentId, verification_code: s.certificateCode,
      hours_rendered: progress.completed_hours, host_company_name: company.company_name,
      academic_year: '2026-2027', status: 'active', issued_by_user_id: coordinator.user_id,
    }));
  }

  // ---------------------------------------------------------------- report

  const progress = ok('Read progress', await db.from('internship_progress')
    .select('student_id,completed_hours,remaining_hours,progress_status')
    .in('student_id', plan.filter((s) => s.studentId).map((s) => s.studentId)));
  const byStudent = Object.fromEntries((progress || []).map((p) => [p.student_id, p]));

  const lines = [
    'CDM-OJT STAGING - IT VALIDATION COHORT',
    `Project: ${host}`,
    `Seeded: ${new Date().toISOString()}`,
    '',
    'Every account below is synthetic. One shared password for all of them, shown once:',
    `Password: ${password}`,
    '',
    'STAFF LOGINS (passwords were reset to the one above by this run):',
    ...staffCredentials.map((line) => `  ${line}`),
    '',
  ];
  for (const stage of ['documents', 'ongoing', 'finished']) {
    lines.push(`--- ${stage.toUpperCase()} ---`);
    for (const s of plan.filter((p) => p.stage === stage)) {
      const p = byStudent[s.studentId];
      lines.push(`${s.name}\t${s.email}\t${s.number}\t${s.course}` +
        (p ? `\t${p.completed_hours}/${Number(p.completed_hours) + Number(p.remaining_hours)}h ${p.progress_status}` : '') +
        (s.certificateCode ? `\t${s.certificateCode}` : ''));
      lines.push(`\t${s.note}`);
    }
    lines.push('');
  }
  const credentialsPath = join(tmpdir(), `cdm-ojt-validation-cohort-${Date.now()}.txt`);
  await writeFile(credentialsPath, lines.join('\n'), { flag: 'wx' });

  console.log(`\nSeeded ${plan.length} students on ${host}.`);
  for (const stage of ['documents', 'ongoing', 'finished']) {
    const group = plan.filter((p) => p.stage === stage);
    console.log(`  ${stage}: ${group.length} (${group.map((s) => {
      const p = byStudent[s.studentId];
      return p ? `${s.number} ${p.completed_hours}h ${p.progress_status}` : `${s.number} no placement`;
    }).join(', ')})`);
  }
  console.log(`\nAccounts and the shared password were written to:\n  ${credentialsPath}`);
  console.log('Passwords were not printed here. Delete that file after the validation.');
  console.log(`Remove the whole cohort afterwards with: node --env-file=... scripts/seed-staging-validation.mjs --undo`);
} catch (error) {
  console.error(`\nSeeding stopped: ${error.message}`);
  console.error('Rolling back everything this run created.');
  const kept = await removeStudents([...created].reverse());
  if (kept.length) console.error(`  ${kept.length} certificated student(s) could not be removed; rerun with --undo for the SQL.`);
  for (const bucket of ['private-documents', 'attendance-selfies']) {
    const paths = uploaded.filter((p) => (bucket === 'attendance-selfies') === p.includes('/time_in_'));
    if (paths.length) {
      const { error: e } = await db.storage.from(bucket).remove(paths);
      if (e) console.error(`  cleanup warning (${bucket}): ${e.message}`);
    }
  }
  process.exitCode = 1;
}

function label(course) {
  return course === 'BS-CPE' ? 'BS Computer Engineering' : 'BS Information Technology';
}
