import 'server-only';

import crypto from 'crypto';
import { getServiceClient } from '@/src/lib/supabase/service';
import { provisionAccount, supabaseAuthAdapter } from '@/src/lib/account-provisioning';
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
  const result = await provisionAccount(supabaseAuthAdapter(service), {
    email, role: 'Supervisor', full_name: fullName, redirectTo,
    staff: { employee_number: employeeNumber },
    setup: async userId => {
      const { error } = await service.from('supervisors').insert({ user_id: userId, company_id: input.company_id, position: input.position.trim() });
      return error;
    },
  });
  if (result.ok) return { data: null, error: null };
  switch (result.kind) {
    case 'invite_unavailable': return { data: null, error: { code: 'SERVER_FAILURE', message: 'Account invitation is not available right now.' } };
    case 'duplicate': return { data: null, error: { code: 'DUPLICATE_REQUEST', message: 'Email already registered. No existing account was changed.' } };
    case 'cleanup_needed': return { data: null, error: { code: 'SERVER_FAILURE', message: 'Supervisor setup did not finish; the new account needs administrator cleanup before retrying.' } };
    case 'setup_failed': return { data: null, error: { code: 'SERVER_FAILURE', message: 'Supervisor setup did not finish. The newly invited account was removed; please check the details and retry.' } };
    default: return { data: null, error: { code: 'SERVER_FAILURE', message: 'Failed to send the supervisor setup invitation.' } };
  }
}
