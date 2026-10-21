/**
 * Colegio de Montalban — OJT Monitoring and Management System
 * Pre-Launch Security, Privacy & RLS Isolation Audit
 * 
 * Verifies ISO/IEC 25010:2023 security-related requirements:
 * 1. Anonymous Access Boundary (No data exposed without login)
 * 2. Student Data Isolation (Student A cannot read Student B's records)
 * 3. Tamper Resistance (Students cannot self-verify attendance or inflate hours)
 * 4. Storage Bucket Privacy (Private documents cannot be accessed by unauthorized users)
 * 5. Forged client role metadata cannot grant staff access
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// 1. Read environment variables from apps/web/.env.local
const envPath = path.resolve(process.cwd(), 'apps/web/.env.local');
if (!fs.existsSync(envPath)) {
  console.error('❌ Could not find apps/web/.env.local');
  process.exit(1);
}

const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const trimmed = line.trim();
  if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
    const [k, ...v] = trimmed.split('=');
    env[k.trim()] = v.join('=').trim();
  }
});

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY) {
  console.error('❌ Missing SUPABASE_URL, ANON_KEY, or SERVICE_ROLE_KEY in apps/web/.env.local');
  process.exit(1);
}

// This audit creates and deletes accounts. Require an explicit project match.
const configuredProjectRef = new URL(SUPABASE_URL).hostname.split('.')[0];
// CDM-OJT also serves production. Never create audit users or records there.
const productionProjectRefs = new Set(['jhslfwczxkdhexjgssjr']);
if (
  productionProjectRefs.has(configuredProjectRef) ||
  process.env.OJT_DISPOSABLE_STAGING_CONFIRMED !== 'true' ||
  process.env.OJT_STAGING_PROJECT_REF !== configuredProjectRef
) {
  console.error('Refusing to create test users: this project may serve production, or disposable staging was not confirmed.');
  process.exit(2);
}

console.log('================================================================');
console.log('  COLEGIO DE MONTALBAN — PRE-LAUNCH SECURITY & PRIVACY AUDIT   ');
console.log('================================================================');
console.log(`Target Supabase URL: ${SUPABASE_URL}`);
console.log(`Timestamp: ${new Date().toISOString()}\n`);

let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passedTests++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
  }
}

async function runAudit() {
  const serviceClient = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // --------------------------------------------------------------------------
  // TEST GROUP 1: Anonymous Public Access Protection
  // --------------------------------------------------------------------------
  console.log('[TEST GROUP 1] Anonymous Public Access Protection (Zero Trust)');
  const anonClient = createClient(SUPABASE_URL, ANON_KEY);

  const { data: anonUsers, error: anonUsersError } = await anonClient.from('users').select('user_id, email, full_name');
  assert(!anonUsersError && anonUsers?.length === 0, 'Anonymous users cannot read user accounts');

  const { data: anonStudents, error: anonStudentsError } = await anonClient.from('students').select('student_id, student_number');
  assert(!anonStudentsError && anonStudents?.length === 0, 'Anonymous users cannot read student profiles');

  const { data: anonAttendance, error: anonAttendanceError } = await anonClient.from('attendance').select('attendance_id, time_in');
  assert(!anonAttendanceError && anonAttendance?.length === 0, 'Anonymous users cannot read attendance logs');

  const { data: anonReports, error: anonReportsError } = await anonClient.from('reports').select('report_id, title');
  assert(!anonReportsError && anonReports?.length === 0, 'Anonymous users cannot read submitted reports');

  const { data: anonProgress, error: anonProgressError } = await anonClient.from('internship_progress').select('progress_id');
  assert(!anonProgressError && anonProgress?.length === 0, 'Anonymous users cannot read progress / hours');

  // --------------------------------------------------------------------------
  // Create Ephemeral Test Student 1 & Test Student 2 to verify cross-user isolation
  // --------------------------------------------------------------------------
  console.log('\n[SETUP] Provisioning ephemeral test students for isolation verification...');
  const testEmail1 = `sec_audit_test1_${Date.now()}@cdm.edu.ph`;
  const testEmail2 = `sec_audit_test2_${Date.now()}@cdm.edu.ph`;
  const testPassword = 'Password123!';

  const { data: u1, error: err1 } = await serviceClient.auth.admin.createUser({
    email: testEmail1,
    password: testPassword,
    email_confirm: true,
    user_metadata: { role: 'Admin' }, // Forgery must not grant Admin in public.users.
  });

  const { data: u2, error: err2 } = await serviceClient.auth.admin.createUser({
    email: testEmail2,
    password: testPassword,
    email_confirm: true,
    user_metadata: { role: 'Student' },
  });

  if (err1 || err2 || !u1?.user || !u2?.user) {
    console.error('❌ Failed to provision test users for audit:', err1 || err2);
    if (u1?.user) await serviceClient.auth.admin.deleteUser(u1.user.id);
    if (u2?.user) await serviceClient.auth.admin.deleteUser(u2.user.id);
    process.exitCode = 1;
    return;
  }

  let dummyAttendanceId = null;
  let ownAttendanceId = null;
  let testStoragePath = null;
  try {
    const { data: forgedProfile, error: forgedProfileError } = await serviceClient
      .from('users').select('role').eq('user_id', u1.user.id).single();
    assert(!forgedProfileError && forgedProfile?.role === 'Student', 'Client-editable role metadata cannot create an Admin');
    if (forgedProfileError || forgedProfile?.role !== 'Student') throw new Error('Trusted-role migration is not effective');

    // Ensure public.users and public.students are active.
    const { error: activationError } = await serviceClient.from('users')
      .update({ account_status: 'active' }).in('user_id', [u1.user.id, u2.user.id]);
    if (activationError) throw activationError;

    // Insert test attendance for student 2 to verify student 1 cannot see or edit it.
    const { data: s2Profile, error: s2Error } = await serviceClient.from('students')
      .select('student_id').eq('user_id', u2.user.id).single();
    if (s2Error || !s2Profile?.student_id) throw s2Error || new Error('Second student profile missing');
    const student2Id = s2Profile.student_id;

    const { data: dummyAtt, error: dummyError } = await serviceClient.from('attendance').insert({
      student_id: student2Id,
      attendance_date: '2026-09-17',
      time_in: '2026-09-17T08:00:00Z',
      time_out: '2026-09-17T17:00:00Z',
      verification_status: 'pending',
    }).select().single();
    if (dummyError || !dummyAtt?.attendance_id) throw dummyError || new Error('Test attendance missing');
    dummyAttendanceId = dummyAtt.attendance_id;
    // --------------------------------------------------------------------------
    // TEST GROUP 2: Student Login & Cross-Student Isolation
    // --------------------------------------------------------------------------
    console.log('\n[TEST GROUP 2] Cross-Student Data Isolation & Privacy');
    const student1Client = createClient(SUPABASE_URL, ANON_KEY);
    const { data: s1Auth, error: s1AuthErr } = await student1Client.auth.signInWithPassword({
      email: testEmail1,
      password: testPassword,
    });

    assert(!s1AuthErr && s1Auth?.user?.id === u1.user.id, 'Test Student 1 authenticated via standard client');

    // Student 1 tries to read profiles
    const { data: s1StudentProfiles } = await student1Client.from('students').select('student_id, user_id');
    assert(
      s1StudentProfiles && s1StudentProfiles.length === 1 && s1StudentProfiles[0].user_id === u1.user.id,
      'Student 1 query returns ONLY their own student record (other students are invisible)'
    );

    // Student 1 tries to read other accounts
    const { data: s1Users } = await student1Client.from('users').select('user_id, email');
    assert(
      s1Users && s1Users.length === 1 && s1Users[0].user_id === u1.user.id,
      'Student 1 cannot read other users from public.users'
    );

    // Student 1 tries to view attendance
    const { data: s1Attendance } = await student1Client.from('attendance').select('attendance_id, student_id');
    const hasStudent2Attendance = s1Attendance?.some(a => a.student_id === student2Id);
    assert(!hasStudent2Attendance, 'Student 1 CANNOT view Student 2\'s attendance logs');

    // --------------------------------------------------------------------------
    // TEST GROUP 3: Tamper Resistance (Cannot Self-Verify or Modify Other Logs)
    // --------------------------------------------------------------------------
    console.log('\n[TEST GROUP 3] Tamper Resistance & Hour Integrity');
    
    // Student 1 tries to maliciously verify Student 2's attendance
    {
      const { data: s1HackedAtt } = await student1Client
        .from('attendance')
        .update({ verification_status: 'verified' })
        .eq('attendance_id', dummyAttendanceId)
        .select();

      const { data: actualForeign } = await serviceClient.from('attendance')
        .select('verification_status').eq('attendance_id', dummyAttendanceId).single();

      assert(
        (!s1HackedAtt || s1HackedAtt.length === 0) && actualForeign?.verification_status === 'pending',
        'Student 1 CANNOT update or tamper with another student\'s attendance'
      );
    }

    // Student 1 tries to self-verify their own attendance
    const { data: s1Profile, error: s1ProfileError } = await serviceClient.from('students').select('student_id').eq('user_id', u1.user.id).single();
    const student1Id = s1Profile?.student_id;
    if (s1ProfileError || !student1Id) throw s1ProfileError || new Error('First student profile missing');

    {
      // Create pending log for student 1
      const { data: ownAtt, error: ownAttError } = await serviceClient.from('attendance').insert({
        student_id: student1Id,
        attendance_date: '2026-09-17',
        time_in: '2026-09-17T08:00:00Z',
        verification_status: 'pending',
      }).select().single();
      if (ownAttError || !ownAtt?.attendance_id) throw ownAttError || new Error('Own test attendance missing');

      {
        ownAttendanceId = ownAtt.attendance_id;
        // Try to update verification_status from pending to verified as student 1
        const { data: selfVerified, error: selfErr } = await student1Client
          .from('attendance')
          .update({ verification_status: 'verified' })
          .eq('attendance_id', ownAtt.attendance_id)
          .select();

        const { data: actualOwn } = await serviceClient.from('attendance')
          .select('verification_status').eq('attendance_id', ownAtt.attendance_id).single();
        assert(
          (!selfVerified || selfVerified.length === 0 || selfErr !== null) && actualOwn?.verification_status === 'pending',
          'Postgres RLS WITH CHECK blocks student from self-verifying own attendance'
        );

      }
    }

    // --------------------------------------------------------------------------
    // TEST GROUP 4: Storage Security (Private Documents)
    // --------------------------------------------------------------------------
    console.log('\n[TEST GROUP 4] Storage Security & Private Documents Isolation');
    testStoragePath = `${u2.user.id}/security-audit-${Date.now()}.png`;
    const tinyPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lWQAAAAASUVORK5CYII=', 'base64');
    const { error: uploadError } = await serviceClient.storage.from('private-documents')
      .upload(testStoragePath, tinyPng, { contentType: 'image/png' });
    if (uploadError) throw uploadError;
    const student2Client = createClient(SUPABASE_URL, ANON_KEY);
    const { error: s2AuthError } = await student2Client.auth.signInWithPassword({ email: testEmail2, password: testPassword });
    if (s2AuthError) throw s2AuthError;
    const { data: ownFile, error: ownFileError } = await student2Client.storage.from('private-documents')
      .download(testStoragePath);
    assert(!ownFileError && ownFile?.size === tinyPng.length, 'Student 2 can download their own private document');
    const { data: foreignFiles, error: storageErr } = await student1Client
      .storage
      .from('private-documents')
      .list(u2.user.id); // Student 2's storage directory

    const { data: foreignFile, error: foreignDownloadError } = await student1Client.storage
      .from('private-documents').download(testStoragePath);
    assert(!foreignFiles?.some(file => file.name === testStoragePath.split('/')[1]) &&
      !foreignFile && !!foreignDownloadError,
      'Student 1 cannot enumerate or download Student 2\'s private document');

  } finally {
    // --------------------------------------------------------------------------
    // TEARDOWN: Clean up ephemeral test users
    // --------------------------------------------------------------------------
    console.log('\n[TEARDOWN] Cleaning up ephemeral test records...');
    const cleanupErrors = [];
    if (testStoragePath) {
      const { error } = await serviceClient.storage.from('private-documents').remove([testStoragePath]);
      if (error) cleanupErrors.push(error.message);
    }
    for (const attendanceId of [dummyAttendanceId, ownAttendanceId].filter(Boolean)) {
      const { error } = await serviceClient.from('attendance').delete().eq('attendance_id', attendanceId);
      if (error) cleanupErrors.push(error.message);
    }
    for (const userId of [u1.user.id, u2.user.id]) {
      const { error } = await serviceClient.auth.admin.deleteUser(userId);
      if (error) cleanupErrors.push(error.message);
    }
    if (cleanupErrors.length) throw new Error(`Test cleanup failed: ${cleanupErrors.join('; ')}`);
    console.log('  Cleaned up test users successfully.');
  }

  // --------------------------------------------------------------------------
  // Summary
  // --------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log(`AUDIT RESULTS: ${passedTests}/${totalTests} Tests Passed (${Math.round((passedTests/totalTests)*100)}%)`);
  if (passedTests === totalTests) {
    console.log('🛡️  STATUS: 100% OF TESTED DATABASE & STORAGE SECURITY BOUNDARIES VERIFIED!');
  } else {
    console.log('⚠️  STATUS: Some tests failed.');
    process.exitCode = 1;
  }
  console.log('================================================================\n');
}

runAudit().catch(err => {
  console.error('Audit execution fatal error:', err);
  process.exit(1);
});
