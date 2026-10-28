const { randomUUID } = require('node:crypto');
const { createClient } = require('@supabase/supabase-js');

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
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

    // Revision 44 predates these features: check the API contract, not just its marker.
    for (const [table, columns] of [
      ['users', 'user_id,must_change_password'],
      ['pending_staff_invites', 'email,kind'],
      ['chat_messages', 'attachment_path,attachment_name,tagged_student_label'],
      ['incident_reports', 'incident_id,student_id,status'],
    ]) {
      const { error } = await service.from(table).select(columns).limit(0);
      checks.push([`Current API columns: ${table}`, !error]);
    }
    const { error: chatError } = await service.rpc('send_chat_message', {
      p_counterpart_user_id: null, p_content: '', p_attachment_path: null,
      p_attachment_name: null, p_tagged_student_id: null,
    });
    checks.push(['Current chat RPC resolves without accepting a service-role participant',
      chatError?.code === '22023' || (chatError?.code === '42501' && /permission denied for function send_chat_message/.test(chatError.message))]);

    for (const [name, passed] of checks) console.log(`${passed ? 'PASS' : 'FAIL'} ${name}`);
    if (checks.some(([, passed]) => !passed)) process.exitCode = 1;
  })().catch(() => {
    console.error('Preflight failed before all checks completed.');
    process.exitCode = 1;
  });
}
