import 'server-only';
import { createClient } from '@/src/lib/supabase/server';
import { authActionLimit, auditSubjectHash } from './internal';
import { redirect } from 'next/navigation';
import { recordAuditEvent } from '@/src/lib/audit';
import type { AppResult } from '@ojt/shared';
import type { SignInInput } from '@ojt/shared';
export async function signIn(input: SignInInput): Promise<AppResult<{ email: string; full_name: string; role: string }>> {
  if (!input.email?.trim())
    return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'Email is required.' } };
  if (!input.password)
    return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'Password is required.' } };

  const limitError = await authActionLimit('login', input.email, 10, 900);
  if (limitError) return { data: null, error: limitError };

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl || supabaseUrl.includes('your-project-id')) {
    return {
      data: null,
      error: {
        code: 'SERVER_FAILURE',
        message: 'Supabase is not configured yet. Please open apps/web/.env.local and add your real NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.',
      },
    };
  }

  const supabase = await createClient();

  const { data, error } = await supabase.auth.signInWithPassword({
    email: input.email.trim(),
    password: input.password,
  });

  if (error) {
    const rawMsg = error.message || '';
    let msg = rawMsg;
    if (!rawMsg || rawMsg.trim() === '{}') {
      msg = 'Sign-in failed. Please check your credentials and try again.';
    } else if (
      rawMsg.toLowerCase().includes('fetch failed') ||
      rawMsg.toLowerCase().includes('failed to fetch') ||
      rawMsg.toLowerCase().includes('networkerror') ||
      rawMsg.toLowerCase().includes('enotfound')
    ) {
      msg =
        'The sign-in service is temporarily unavailable. Please try again later.';
    }

    // Record LOGIN_FAILED audit trail for incident response & brute-force monitoring
    await recordAuditEvent({
      actor_user_id: null,
      action: 'LOGIN_FAILED',
      entity_type: 'auth',
      details: { subject_hash: auditSubjectHash(input.email), reason: 'authentication_failed' },
    });

    return { data: null, error: { code: 'UNAUTHORIZED', message: msg } };
  }

  // Check account status — backend authority
  const { data: user } = await supabase
    .from('users')
    .select('user_id, account_status, role, full_name, email')
    .eq('user_id', data.user.id)
    .single();

  if (!user) {
    await recordAuditEvent({
      actor_user_id: data.user.id,
      action: 'LOGIN_FAILED',
      entity_type: 'auth',
      details: { subject_hash: auditSubjectHash(input.email), reason: 'profile_record_missing' },
    });
    return { data: null, error: { code: 'SERVER_FAILURE', message: 'Account not found.' } };
  }

  if (user.account_status === 'pending') {
    await supabase.auth.signOut();
    await recordAuditEvent({
      actor_user_id: user.user_id,
      action: 'LOGIN_BLOCKED_PENDING',
      entity_type: 'auth',
      details: { role: user.role, reason: 'account_pending' },
    });
    return { data: null, error: { code: 'FORBIDDEN', message: 'Your account is pending approval.' } };
  }

  if (user.account_status === 'rejected') {
    await supabase.auth.signOut();
    await recordAuditEvent({
      actor_user_id: user.user_id,
      action: 'LOGIN_BLOCKED_REJECTED',
      entity_type: 'auth',
      details: { role: user.role },
    });
    return { data: null, error: { code: 'FORBIDDEN', message: 'Your account registration was rejected.' } };
  }

  if (user.account_status === 'inactive') {
    await supabase.auth.signOut();
    await recordAuditEvent({
      actor_user_id: user.user_id,
      action: 'LOGIN_BLOCKED_DEACTIVATED',
      entity_type: 'auth',
      details: { subject_hash: auditSubjectHash(user.email), role: user.role },
    });
    return { data: null, error: { code: 'FORBIDDEN', message: 'Your account has been deactivated.' } };
  }

  // Enforce Mobile-Only Access for Student Trainees on Web Portal
  if (user.role === 'Student') {
    await supabase.auth.signOut();
    await recordAuditEvent({
      actor_user_id: user.user_id,
      action: 'LOGIN_BLOCKED_WEB_STUDENT',
      entity_type: 'auth',
      details: { role: user.role, reason: 'web_access_restricted' },
    });
    return {
      data: null,
      error: {
        code: 'FORBIDDEN',
        message: 'Student accounts must access the system via the CdM OJT Mobile App. Web portal access is reserved for OJT Coordinator, supervisors, and administrators.',
      },
    };
  }

  // Record successful sign-in
  await recordAuditEvent({
    actor_user_id: user.user_id,
    action: 'LOGIN_SUCCESS',
    entity_type: 'auth',
    entity_id: user.user_id,
    details: { subject_hash: auditSubjectHash(user.email), role: user.role },
  });

  return {
    data: {
      email: user.email || input.email.trim(),
      full_name: user.full_name || '',
      role: user.role || 'Student',
    },
    error: null,
  };
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/auth/sign-in');
}

export async function changeUserPassword(currentPassword: string, newPassword: string): Promise<AppResult<null>> {
  if (!newPassword || newPassword.length < 8)
    return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'New password must be at least 8 characters long.' } };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !user.email)
    return { data: null, error: { code: 'UNAUTHORIZED', message: 'You must be signed in to change your password.' } };

  // Verify current password if supplied
  if (currentPassword) {
    const { error: verifyErr } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
    });
    if (verifyErr) {
      return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'The current password you entered is incorrect.' } };
    }
  }

  // Update password in Supabase Auth
  const { error: updateErr } = await supabase.auth.updateUser({ password: newPassword });
  if (updateErr)
    return { data: null, error: { code: 'SERVER_FAILURE', message: updateErr.message || 'Failed to update password.' } };

  await recordAuditEvent({
    actor_user_id: user.id,
    action: 'PASSWORD_CHANGED',
    entity_type: 'user',
    entity_id: user.id,
    details: { changed_at: new Date().toISOString() },
  });

  return { data: null, error: null };
}

export async function getAuthUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from('users')
    .select('user_id, full_name, email, role, account_status, employee_number')
    .eq('user_id', user.id)
    .single();

  return data ?? null;
}
