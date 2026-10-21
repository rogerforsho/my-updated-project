const { randomUUID } = require('node:crypto');
const { createClient } = require('@supabase/supabase-js');

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('Missing Supabase URL or service key.');
  process.exitCode = 2;
} else {
  const service = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  (async () => {
    const checks = [];
    const { data: revision, error: revisionError } = await service.rpc('ojt_security_revision');
    // This marker is necessary but does not prove the policy definition exists.
    // Confirm student_complete_verified_attendance_timeout with the read-only
    // launch_security_checks.sql query before considering the database ready.
    checks.push(['Security revision marker >= 44 (launch policy checked separately)', !revisionError && revision >= 44]);
    const { data: bucket, error: bucketError } = await service.storage.getBucket('attendance-selfies');
    checks.push(['Migration 027 private selfie bucket', !bucketError && bucket?.public === false]);
    const { data: documentsBucket, error: documentsBucketError } = await service.storage.getBucket('private-documents');
    checks.push(['Migration 009 private documents bucket', !documentsBucketError && documentsBucket?.public === false]);

    // A random nonexistent email can only return not_found; it cannot consume a real code.
    const { data: otp, error: otpError } = await service.rpc('consume_password_reset_otp', {
      p_email: `preflight-${randomUUID()}@example.invalid`,
      p_otp_hash: '0'.repeat(64),
    });
    checks.push(['Migration 027 atomic OTP function', !otpError && otp?.[0]?.result_status === 'not_found']);

    // Invalid action must be rejected before a counter is written.
    const { error: limitError } = await service.rpc('claim_auth_rate_limit', {
      p_action: 'preflight_invalid',
      p_subject_hash: '0'.repeat(64),
      p_max_attempts: 1,
      p_window_seconds: 60,
    });
    checks.push(['Migration 028 rate-limit function', limitError?.message?.includes('Invalid rate limit parameters')]);

    for (const [name, passed] of checks) console.log(`${passed ? 'PASS' : 'FAIL'} ${name}`);
    if (checks.some(([, passed]) => !passed)) process.exitCode = 1;
  })().catch(() => {
    console.error('Preflight failed before all checks completed.');
    process.exitCode = 1;
  });
}
