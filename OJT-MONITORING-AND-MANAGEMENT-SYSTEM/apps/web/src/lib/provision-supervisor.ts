import 'server-only';

import crypto from 'crypto';
import { getServiceClient } from '@/src/lib/supabase/service';
import type { AppResult } from '@ojt/shared';

/**
 * Creates the Auth identity, user row and supervisor profile, then emails the one-time password setup link.
 * Callers must already have authorised the request (a Coordinator, or a valid invite link).
 */
export async function provisionSupervisor(input: { full_name: string; email: string; position: string; company_id: string }): Promise<AppResult<null>> {
  const siteUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!siteUrl) return { data: null, error: { code: 'SERVER_FAILURE', message: 'Account invitation is not configured.' } };
  const service = getServiceClient();
  const fullName = input.full_name.trim();
  const email = input.email.trim().toLowerCase();
  const employeeNumber = `SUP-${crypto.randomBytes(8).toString('hex').toUpperCase()}`;
  const redirectTo = `${siteUrl.replace(/\/$/, '')}/auth/callback?next=${encodeURIComponent('/auth/set-password')}`;
  // GoTrue inserts auth.users before app_metadata applies, so register the email for the student-check trigger (service_role only table).
  const { error: pendingError } = await service.from('pending_staff_invites').upsert({ email, created_at: new Date().toISOString() });
  if (pendingError) return { data: null, error: { code: 'SERVER_FAILURE', message: 'Account invitation is not available right now.' } };
  let created;
  try {
    created = await service.auth.admin.createUser({
      email,
      email_confirm: true, // unconfirmed accounts could be claimed by a public signup with this email
      app_metadata: { role: 'Supervisor' },
      user_metadata: { full_name: fullName },
    });
  } finally {
    await service.from('pending_staff_invites').delete().eq('email', email);
  }
  const { data: authData, error: createError } = created;
  let authError = createError;
  if (!authError && authData.user) {
    const { error } = await service.auth.resetPasswordForEmail(email, { redirectTo }); // sends the one-time setup link
    if (error) {
      await service.auth.admin.deleteUser(authData.user.id);
      authError = error;
    }
  }

  if (authError || !authData.user) {
    if (/already|exists|unique/i.test(authError?.message ?? ''))
      return { data: null, error: { code: 'DUPLICATE_REQUEST', message: 'Email already registered. No existing account was changed.' } };
    return { data: null, error: { code: 'SERVER_FAILURE', message: 'Failed to send the supervisor setup invitation.' } };
  }

  const userId = authData.user.id;
  const { error: metadataError } = await service.auth.admin.updateUserById(userId, { app_metadata: { role: 'Supervisor' } });
  let setupError: { message: string } | null = metadataError;
  // The AFTER INSERT trigger defaults new accounts to Student; remove only this new account's placeholder row.
  if (!setupError) {
    const { error } = await service.from('students').delete().eq('user_id', userId).like('student_number', 'PENDING-%');
    setupError = error;
  }
  if (!setupError) {
    const { error } = await service.from('users').update({
      full_name: fullName,
      email,
      role: 'Supervisor',
      employee_number: employeeNumber,
      account_status: 'active',
      updated_at: new Date().toISOString(),
    }).eq('user_id', userId);
    setupError = error;
  }
  if (!setupError) {
    const { error } = await service.from('supervisors').insert({
      user_id: userId,
      company_id: input.company_id,
      position: input.position.trim(),
    });
    setupError = error;
  }

  if (setupError) {
    const { error: rollbackError } = await service.auth.admin.deleteUser(userId);
    if (rollbackError) console.error('[createSupervisor] Incomplete invited account requires cleanup:', userId);
    return { data: null, error: { code: 'SERVER_FAILURE', message: rollbackError
      ? 'Supervisor setup did not finish; the new account needs administrator cleanup before retrying.'
      : 'Supervisor setup did not finish. The newly invited account was removed; please check the details and retry.' } };
  }
  return { data: null, error: null };
}
