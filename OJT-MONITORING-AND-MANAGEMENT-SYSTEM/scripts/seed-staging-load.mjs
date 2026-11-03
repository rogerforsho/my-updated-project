// Staging-only data for load tests. Usage:
//   node scripts/seed-staging-load.mjs [--students=2000] [--companies=100] [--months=6] [--apply]
//   node scripts/seed-staging-load.mjs --cleanup --apply
// Without --apply nothing is written. Only adds rows; --cleanup removes only @loadtest.local accounts.
import { randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

export const expectedRef = 'xlkvjuwzcviicerpzdjz';
export const LOADTEST_DOMAIN = '@loadtest.local';

// Throws unless the URL is exactly the approved staging project.
export function assertStagingUrl(url) {
  let host;
  try { host = new URL(url).hostname; } catch { host = ''; }
  if (host !== `${expectedRef}.supabase.co`) {
    throw new Error(`Refusing to run: URL is not the approved staging project (${expectedRef}).`);
  }
}

const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? Number(hit.split('=')[1]) : fallback;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const apply = process.argv.includes('--apply');
  const cleanup = process.argv.includes('--cleanup');
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Missing staging URL or server-only staging secret in apps/web/.env.staging.local.');
    process.exit(2);
  }
  assertStagingUrl(url);

  const students = arg('students', 2000);
  const companies = arg('companies', 100);
  const months = arg('months', 6);
  const BATCH = 500;
  const PAUSE_MS = 250;

  const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const unwrap = (label, r) => { if (r.error) throw new Error(`${label}: ${r.error.message}`); return r.data; };

  async function listLoadtestUsers() {
    const found = [];
    for (let page = 1; ; page += 1) {
      const { users } = unwrap('List Auth users', await supabase.auth.admin.listUsers({ page, perPage: 1000 }));
      found.push(...users.filter((u) => u.email?.toLowerCase().endsWith(LOADTEST_DOMAIN)));
      if (users.length < 1000) return found;
    }
  }

  // PostgREST returns at most 1000 rows per request, so page through them.
  async function listLoadtestStudents() {
    const all = [];
    for (let from = 0; ; from += 1000) {
      const rows = unwrap('Find loadtest students', await supabase.from('students').select('student_id')
        .like('student_number', 'LT-%').order('student_id').range(from, from + 999));
      all.push(...rows);
      if (rows.length < 1000) return all;
    }
  }

  if (process.argv.includes('--reset-today')) {
    // Lets the same 300 students clock in again on the next load-test run.
    const today = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
    const ids = await listLoadtestStudents();
    console.log(`${apply ? 'Deleting' : 'Would delete'} loadtest attendance dated ${today} or later for ${ids.length} students.`);
    if (!apply) return;
    for (let i = 0; i < ids.length; i += 100) {
      unwrap('Reset today', await supabase.from('attendance').delete().gte('attendance_date', today).in('student_id', ids.slice(i, i + 100).map((s) => s.student_id)));
    }
    return;
  }

  if (cleanup) {
    const victims = await listLoadtestUsers();
    console.log(`${apply ? 'Deleting' : 'Would delete'} ${victims.length} ${LOADTEST_DOMAIN} accounts (and the companies named "LoadTest Company *").`);
    if (!apply) return;
    // Foreign keys block deleting users/companies that still have records, so remove dependents first.
    const ids = await listLoadtestStudents();
    for (let i = 0; i < ids.length; i += 25) {
      const chunk = ids.slice(i, i + 25).map((s) => s.student_id);
      for (const table of ['attendance', 'student_assignments', 'internship_progress']) {
        unwrap(`Delete ${table}`, await supabase.from(table).delete().in('student_id', chunk));
      }
    }
    for (const u of victims) {
      const { error } = await supabase.auth.admin.deleteUser(u.id);
      if (error) console.error(`Cleanup warning (${u.email}): ${error.message}`);
    }
    // Real companies are never matched by this name pattern.
    unwrap('Delete loadtest companies', await supabase.from('companies').delete().like('company_name', 'LoadTest Company %'));
    return;
  }

  console.log(`Staging target verified: ${expectedRef}`);
  console.log(`Plan: ${students} students, ${companies} companies/supervisors, ${months} months of weekday attendance.`);
  if (!apply) {
    console.log('No requests were sent. Rerun with --apply to write.');
    return;
  }

  const existing = await listLoadtestUsers();
  if (existing.length) throw new Error(`${existing.length} ${LOADTEST_DOMAIN} accounts already exist. Run --cleanup --apply first.`);

  const password = randomBytes(24).toString('base64url');
  const pad = (n) => String(n).padStart(4, '0');
  const mkUser = async (email, name, role, extra = {}) => {
    // Same short-lived invite the app's bulk student import uses to skip the ID-card upload check.
    unwrap(`Invite ${email}`, await supabase.from('pending_staff_invites').upsert({
      email, kind: role === 'Student' ? 'student_import' : 'staff', created_at: new Date().toISOString(),
    }));
    const { data, error } = await supabase.auth.admin.createUser({
      email, password, email_confirm: true,
      user_metadata: { full_name: name, course: 'BSIT', year_level: 4, ...extra },
    });
    if (error) throw new Error(`Create ${email}: ${error.message}`);
    unwrap(`Role ${email}`, await supabase.auth.admin.updateUserById(data.user.id, {
      app_metadata: { ...data.user.app_metadata, role },
    }));
    unwrap(`Activate ${email}`, await supabase.from('users').update({ role, account_status: 'active' }).eq('user_id', data.user.id));
    return data.user.id;
  };
  // Five at a time keeps the Auth API comfortable.
  const inChunks = async (items, size, fn) => {
    for (let i = 0; i < items.length; i += size) { await Promise.all(items.slice(i, i + size).map(fn)); await sleep(100); }
  };

  const companyRows = unwrap('Create companies', await supabase.from('companies').insert(
    Array.from({ length: companies }, (_, i) => ({
      company_name: `LoadTest Company ${pad(i + 1)}`, address: 'Synthetic load-test address, Rodriguez, Rizal',
      contact_person: 'LoadTest Contact', contact_email: `company${pad(i + 1)}${LOADTEST_DOMAIN}`, contact_number: '0000000000',
      status: 'active', latitude: 14.7315, longitude: 121.1394, geofence_radius_meters: 50, geofence_enabled: false,
    })),
  ).select('company_id'));
  const branches = unwrap('Find primary branches', await supabase.from('company_branches')
    .select('branch_id,company_id').in('company_id', companyRows.map((c) => c.company_id)).eq('is_primary', true));
  const branchOf = Object.fromEntries(branches.map((b) => [b.company_id, b.branch_id]));

  const supervisors = [];
  await inChunks(companyRows, 5, async (c, ) => {
    const idx = companyRows.indexOf(c);
    const userId = await mkUser(`sup${pad(idx + 1)}${LOADTEST_DOMAIN}`, `LoadTest Supervisor ${idx + 1}`, 'Supervisor');
    unwrap('Drop temp student row', await supabase.from('students').delete().eq('user_id', userId));
    const s = unwrap('Supervisor profile', await supabase.from('supervisors')
      .insert({ user_id: userId, company_id: c.company_id, position: 'LoadTest Supervisor' }).select('supervisor_id').single());
    supervisors[idx] = s.supervisor_id;
  });
  console.log(`Created ${supervisors.length} supervisors.`);

  const studentIds = [];
  const emails = [];
  await inChunks(Array.from({ length: students }, (_, i) => i), 5, async (i) => {
    const email = `student${pad(i + 1)}${LOADTEST_DOMAIN}`;
    const userId = await mkUser(email, `LoadTest Student ${i + 1}`, 'Student', { student_number: `LT-${pad(i + 1)}` });
    const s = unwrap('Find student', await supabase.from('students').select('student_id').eq('user_id', userId).single());
    unwrap('Set student', await supabase.from('students').update({
      student_number: `LT-${pad(i + 1)}`, course: 'BSIT', year_level: 4, required_hours: 486, status: 'active',
    }).eq('student_id', s.student_id));
    studentIds[i] = s.student_id;
    emails[i] = email;
    if ((i + 1) % 200 === 0) console.log(`  students ${i + 1}/${students}`);
  });

  const today = new Date();
  const start = new Date(today); start.setMonth(start.getMonth() - months);
  const iso = (d) => d.toISOString().slice(0, 10);
  const assignmentRows = studentIds.map((student_id, i) => {
    const c = companyRows[i % companyRows.length];
    return { student_id, company_id: c.company_id, branch_id: branchOf[c.company_id],
      supervisor_id: supervisors[i % companyRows.length], start_date: iso(start), assignment_status: 'active' };
  });
  const assignments = [];
  for (let i = 0; i < assignmentRows.length; i += BATCH) {
    assignments.push(...unwrap('Assignments', await supabase.from('student_assignments')
      .insert(assignmentRows.slice(i, i + BATCH)).select('assignment_id,student_id,supervisor_id')));
    await sleep(PAUSE_MS);
  }
  unwrap('Progress', await supabase.from('internship_progress').upsert(studentIds.map((student_id) => ({
    student_id, completed_hours: 0, remaining_hours: 486, progress_status: 'not_started' })), { onConflict: 'student_id', ignoreDuplicates: true }));

  // Weekdays only; 08:00-17:00 Asia/Manila (UTC+8) is 00:00-09:00Z.
  const days = [];
  for (let d = new Date(start); d < today; d.setDate(d.getDate() + 1)) if (d.getDay() % 6) days.push(iso(d));
  let rows = [];
  let total = 0;
  const flush = async () => {
    if (!rows.length) return;
    unwrap('Attendance', await supabase.from('attendance').insert(rows));
    total += rows.length; rows = []; await sleep(PAUSE_MS);
    if (total % 20000 < BATCH) console.log(`  attendance ${total}`);
  };
  for (const a of assignments) {
    for (const day of days) {
      rows.push({ student_id: a.student_id, assignment_id: a.assignment_id,
        attendance_date: day, time_in: `${day}T00:00:00Z`, time_out: `${day}T09:00:00Z`, verification_status: 'verified',
        time_in_selfie_path: 'loadtest/placeholder.jpg', time_out_selfie_path: 'loadtest/placeholder.jpg' });
      if (rows.length >= BATCH) await flush();
    }
  }
  await flush();

  // k6 reads the first 300 accounts from this file; the password is never printed.
  const file = join(tmpdir(), `loadtest-accounts-${Date.now()}.json`);
  await writeFile(file, JSON.stringify({ password, emails: emails.slice(0, 300) }), { flag: 'wx' });
  console.log(`Done: ${students} students, ${companies} companies, ${total} attendance rows.`);
  console.log(`Load-test credentials file (delete after testing): ${file}`);
}

import { fileURLToPath } from 'node:url';
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(`Seed stopped: ${e.message}`); process.exitCode = 1; });
}
