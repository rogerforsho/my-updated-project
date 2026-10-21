import 'server-only';
import { createClient } from '@/src/lib/supabase/server';
import { serviceClient, authActionLimit } from './internal';
import { recordAuditEvent } from '@/src/lib/audit';
import type { AppResult } from '@ojt/shared';

const genericResponse = { message: 'If an eligible account uses that email, a one-time recovery link will be sent.' };

export async function requestPasswordReset(
  email: string,
  expectedRole: 'Student' | 'Web' = 'Web'
): Promise<AppResult<{ message: string }>> {
  const normalizedEmail = email?.trim().toLowerCase();
  if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail))
    return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'Enter a valid email address.' } };

  const limitError = await authActionLimit('password_reset_request', normalizedEmail, 3, 900);
  if (limitError) return { data: null, error: limitError };

  const service = serviceClient();
  const { data: profile, error: lookupError } = await service.from('users')
    .select('user_id, role, account_status').eq('email', normalizedEmail).maybeSingle();
  if (lookupError) return { data: null, error: { code: 'SERVER_FAILURE', message: 'Recovery is temporarily unavailable. Try again later.' } };

  const isExpectedRole = expectedRole === 'Student' ? profile?.role === 'Student' : !!profile && profile.role !== 'Student';
  if (!profile || !isExpectedRole || profile.account_status !== 'active')
    return { data: genericResponse, error: null };

  const siteUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (expectedRole !== 'Student' && !siteUrl)
    return { data: null, error: { code: 'SERVER_FAILURE', message: 'Recovery links are not configured.' } };
  const redirectTo = expectedRole === 'Student'
    ? 'cdm-ojt-monitoring://auth/reset-password'
    : `${siteUrl!.replace(/\/$/, '')}/auth/callback?next=${encodeURIComponent('/auth/set-password')}`;
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, { redirectTo });
  if (error) {
    console.error('[requestPasswordReset] Supabase recovery link request failed');
    return { data: null, error: { code: 'SERVER_FAILURE', message: 'Recovery is temporarily unavailable. Try again later.' } };
  }

  await recordAuditEvent({
    actor_user_id: null,
    action: 'PASSWORD_RECOVERY_LINK_REQUESTED',
    entity_type: 'user',
    entity_id: profile.user_id,
    details: { reset_method: 'SUPABASE_ONE_TIME_LINK' },
  });
  return { data: genericResponse, error: null };
}
