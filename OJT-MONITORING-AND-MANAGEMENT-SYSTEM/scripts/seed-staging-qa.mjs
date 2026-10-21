import { randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { createClient } from '@supabase/supabase-js';

const expectedRef = 'xlkvjuwzcviicerpzdjz';
const apply = process.argv.includes('--apply');
const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error('Missing staging URL or server-only staging secret in apps/web/.env.staging.local.');
  process.exit(2);
}

const parsedUrl = new URL(url);
if (parsedUrl.hostname !== `${expectedRef}.supabase.co`) {
  console.error(`Refusing to run: URL is not the approved staging project (${expectedRef}).`);
  process.exit(2);
}

const users = [
  { slug: 'admin', role: 'Admin', name: 'QA Admin' },
  { slug: 'coordinator', role: 'Coordinator', name: 'QA Coordinator', department: 'ICS & IBE' },
  { slug: 'coordinator-ics', role: 'Coordinator', name: 'QA Coordinator ICS', department: 'ICS' },
  { slug: 'coordinator-ibe', role: 'Coordinator', name: 'QA Coordinator IBE', department: 'IBE' },
  { slug: 'supervisor', role: 'Supervisor', name: 'QA Supervisor' },
  { slug: 'student-ics', role: 'Student', name: 'QA Student ICS', course: 'BSIT', studentNumber: 'QA-ICS-2026-001' },
  { slug: 'student-ibe', role: 'Student', name: 'QA Student IBE', course: 'BSBA', studentNumber: 'QA-IBE-2026-001' },
].map((user) => {
  const id = `${String(randomBytes(6).readUIntBE(0, 6) % 1_000_000_000_000).padStart(12, '0')}_${randomBytes(12).toString('hex')}`;
  return {
    ...user,
    idCardFrontPath: `id-cards/${id}_front.png`,
    idCardBackPath: `id-cards/${id}_back.png`,
    email: `qa-${user.slug}-20261010@example.com`,
    password: randomBytes(24).toString('base64url'),
  };
});

const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const madeUsers = [];
const studentIds = [];
const uploadedIdCardPaths = [];
let companyId;
let branchId;

function unwrap(label, result) {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
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

function syntheticIdCardImage() {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(1, 0);
  header.writeUInt32BE(1, 4);
  header[8] = 8;
  header[9] = 6;
  const pixel = Buffer.from([0, 32, 96, 160, 255]);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(pixel)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

async function removeRows(table, column, values) {
  if (!values.length) return;
  const { error } = await supabase.from(table).delete().in(column, values);
  if (error) console.error(`Cleanup warning (${table}): ${error.message}`);
}

if (!apply) {
  console.log(`Staging target verified: ${expectedRef}`);
  console.log('Would create 7 isolated QA users, role profiles, one synthetic company, two assignments, progress rows, and two schedule requests.');
  console.log('No requests were sent. Review this script, then rerun with --apply to create the fixtures.');
  process.exit(0);
}

try {
  const existing = unwrap('List Auth users', await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 }));
  const existingEmails = new Set((existing.users || []).map((user) => user.email?.toLowerCase()));
  const collisions = users.filter((user) => existingEmails.has(user.email.toLowerCase()));
  if (collisions.length) {
    throw new Error(`QA accounts already exist (${collisions.map((user) => user.email).join(', ')}). Refusing to overwrite or delete them.`);
  }

  const cardImage = syntheticIdCardImage();
  for (const user of users) {
    for (const path of [user.idCardFrontPath, user.idCardBackPath]) {
      unwrap(`Upload synthetic ID card for ${user.slug}`, await supabase.storage.from('private-documents')
        .upload(path, cardImage, { contentType: 'image/png' }));
      uploadedIdCardPaths.push(path);
    }
  }

  for (const user of users) {
    const { data, error } = await supabase.auth.admin.createUser({
      email: user.email,
      password: user.password,
      email_confirm: true,
      user_metadata: {
        full_name: user.name,
        // The database's BEFORE INSERT Auth guard runs before custom app_metadata
        // is reliably available. Supply valid synthetic enrollment fields for all
        // QA identities, including stored ID-card fixtures, so staff-account
        // creation passes the guard as well.
        course: user.course || 'BSIT',
        year_level: 4,
        id_card_path: user.idCardFrontPath,
        id_card_front_path: user.idCardFrontPath,
        id_card_back_path: user.idCardBackPath,
        ...(user.studentNumber ? { student_number: user.studentNumber } : {}),
      },
    });
    if (error) throw new Error(`Create ${user.role} Auth user: ${error.message}`);
    madeUsers.push({ ...user, id: data.user.id });

    // Apply trusted role metadata after Auth has inserted the user, then reconcile
    // the application profile. The signup trigger may have provisioned a temporary
    // Student row while the BEFORE INSERT guard was evaluating the new identity.
    unwrap(`Set ${user.role} Auth role`, await supabase.auth.admin.updateUserById(data.user.id, {
      app_metadata: { ...data.user.app_metadata, role: user.role },
    }));
    unwrap(`Activate ${user.email}`, await supabase.from('users').update({
      role: user.role,
      account_status: 'active',
    }).eq('user_id', data.user.id));
    if (user.role !== 'Student') {
      unwrap(`Remove temporary student profile for ${user.email}`,
        await supabase.from('students').delete().eq('user_id', data.user.id));
    }
  }

  const staffCardPaths = users.filter((user) => user.role !== 'Student')
    .flatMap((user) => [user.idCardFrontPath, user.idCardBackPath]);
  unwrap('Remove temporary staff ID-card objects', await supabase.storage.from('private-documents').remove(staffCardPaths));

  const bySlug = Object.fromEntries(madeUsers.map((user) => [user.slug, user]));
  unwrap('Create admin profile', await supabase.from('admins').insert({ user_id: bySlug.admin.id }));
  const coordinatorGrantRows = [];
  for (const slug of ['coordinator', 'coordinator-ics', 'coordinator-ibe']) {
    const coordinator = bySlug[slug];
    unwrap(`Create ${coordinator.department} coordinator profile`, await supabase.from('coordinators').insert({
      user_id: coordinator.id,
      department: coordinator.department,
    }));
    for (const department of coordinator.department.split('&').map((value) => value.trim())) {
      for (const capability of ['academic_workflows', 'department_reports', 'department_announcements']) {
        coordinatorGrantRows.push({ user_id: coordinator.id, capability, department_scope: department });
      }
    }
  }
  unwrap('Grant synthetic Coordinator department scopes', await supabase.from('staff_capability_grants').insert(coordinatorGrantRows));

  const company = unwrap('Create synthetic company', await supabase.from('companies').insert({
    company_name: 'QA Staging Company',
    address: 'Synthetic staging address, Rodriguez, Rizal',
    contact_person: bySlug.supervisor.name,
    contact_email: bySlug.supervisor.email,
    contact_number: '0000000000',
    status: 'active',
    latitude: 14.7315,
    longitude: 121.1394,
    geofence_radius_meters: 150,
    geofence_enabled: false,
  }).select('company_id').single());
  companyId = company.company_id;
  const branch = unwrap('Find synthetic primary branch', await supabase.from('company_branches')
    .select('branch_id').eq('company_id', companyId).eq('is_primary', true).single());
  branchId = branch.branch_id;

  const supervisor = unwrap('Create supervisor profile', await supabase.from('supervisors').insert({
    user_id: bySlug.supervisor.id,
    company_id: companyId,
    position: 'QA Staging Supervisor',
  }).select('supervisor_id').single());

  const students = [];
  for (const slug of ['student-ics', 'student-ibe']) {
    const user = bySlug[slug];
    const student = unwrap(`Find ${user.role} profile`, await supabase.from('students')
      .select('student_id').eq('user_id', user.id).single());
    studentIds.push(student.student_id);
    unwrap(`Set ${user.slug} profile`, await supabase.from('students').update({
      student_number: user.studentNumber,
      course: user.course,
      year_level: 4,
      required_hours: 486,
      status: 'active',
      id_card_path: user.idCardFrontPath,
      id_card_front_path: user.idCardFrontPath,
      id_card_back_path: user.idCardBackPath,
    }).eq('student_id', student.student_id));
    students.push({ ...user, studentId: student.student_id });
  }

  const assignmentRows = students.map((student) => ({
    student_id: student.studentId,
    company_id: companyId,
    branch_id: branchId,
    supervisor_id: supervisor.supervisor_id,
    start_date: new Date().toISOString().slice(0, 10),
    assignment_status: 'active',
  }));
  const assignments = unwrap('Create synthetic assignments', await supabase.from('student_assignments')
    .insert(assignmentRows).select('assignment_id,student_id'));

  unwrap('Create progress records', await supabase.from('internship_progress').insert(students.map((student) => ({
    student_id: student.studentId,
    completed_hours: 0,
    remaining_hours: 486,
    progress_status: 'not_started',
  }))));

  const today = new Date();
  const startDate = today.toISOString().slice(0, 10);
  const endDate = new Date(today.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  unwrap('Create schedule requests', await supabase.from('practicum_schedules').insert(students.map((student) => ({
    student_id: student.studentId,
    company_id: companyId,
    branch_id: branchId,
    work_modality: 'on_site',
    work_days: [1, 2, 3, 4, 5],
    time_in: '08:00',
    time_out: '17:00',
    lunch_break_minutes: 60,
    lunch_break_start: '12:00',
    daily_hours: 8,
    weekly_hours: 40,
    start_date: startDate,
    end_date: endDate,
    status: 'pending',
    student_notes: 'Synthetic QA schedule request for staging workflow tests.',
  }))));

  const credentialsPath = join(tmpdir(), `cdm-ojt-staging-qa-accounts-${Date.now()}.txt`);
  const credentialText = [
    'STAGING QA ACCOUNTS — synthetic test identities only',
    `Project: ${expectedRef}`,
    'These passwords are random and unique. Store this file securely and delete it after testing.',
    '',
    ...madeUsers.map((user) => `${user.role}${user.department ? ` (${user.department})` : ''}\t${user.email}\t${user.password}`),
    '',
  ].join('\n');
  await writeFile(credentialsPath, credentialText, { flag: 'wx' });
  console.log('Created 7 synthetic accounts, role profiles, one company, two active assignments, progress rows, and two pending schedule requests.');
  console.log('Passwords were written to a local file in your Windows temp folder; they were not printed.');
  console.log(`Credentials file: ${credentialsPath}`);
  console.log('These accounts are email-confirmed for test sign-in. Test email confirmation separately with a new student signup and inspect Mailtrap.');
} catch (error) {
  console.error(`Staging fixture setup stopped: ${error.message}`);
  if (uploadedIdCardPaths.length) {
    const { error: storageError } = await supabase.storage.from('private-documents').remove(uploadedIdCardPaths);
    if (storageError) console.error(`Cleanup warning (ID-card objects): ${storageError.message}`);
  }
  await removeRows('practicum_schedules', 'student_id', studentIds);
  await removeRows('student_assignments', 'student_id', studentIds);
  await removeRows('internship_progress', 'student_id', studentIds);
  await removeRows('work_schedules', 'company_id', companyId ? [companyId] : []);
  if (companyId) {
    const { error: companyError } = await supabase.from('companies').delete().eq('company_id', companyId);
    if (companyError) console.error(`Cleanup warning (company): ${companyError.message}`);
  }
  for (const user of [...madeUsers].reverse()) {
    const { error: deleteError } = await supabase.auth.admin.deleteUser(user.id);
    if (deleteError) console.error(`Cleanup warning (${user.email}): ${deleteError.message}`);
  }
  process.exitCode = 1;
}
