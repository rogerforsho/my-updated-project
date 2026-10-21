import { clearAttendanceIdentity, getCachedAttendanceIdentity, rememberAttendanceIdentity } from '../lib/attendanceCache';
import { isNetworkAvailable } from '../lib/syncEngine';
import { supabase } from '../lib/supabase';
import type { AppResult, RegisterStudentInput, ResubmitStudentRegistrationInput, SignInInput, AuthUser, StudentRegistrationResubmissionDetails } from '@ojt/shared';
import { isStudentRegistrationCourse } from '@ojt/shared';
import { getWebPortalUrl } from '../lib/webPortal';
import { getWebBff, postWebBff } from '../lib/webBff';

export async function registerStudent(input: RegisterStudentInput): Promise<AppResult<null>> {
  // Validation
  if (!input.full_name?.trim())
    return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'Full name is required.' } };
  if (!input.email?.trim())
    return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'Email is required.' } };
  if (!input.password || input.password.length < 8)
    return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'Password must be at least 8 characters.' } };
  if (!input.student_number?.trim())
    return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'Student number is required.' } };
  if (!input.course?.trim())
    return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'Course is required.' } };
  if (input.year_level !== 4)
    return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'Registration is restricted to fourth-year students.' } };

  if (!isStudentRegistrationCourse(input.course))
    return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'Registration is restricted to ICS and IBE students.' } };
  try {
    const response = await fetch(getWebPortalUrl('/api/registration/submit'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...input, email: input.email.trim(), student_number: input.student_number.trim() }),
    });
    const result = await response.json();
    if (!response.ok || result.error) return result as AppResult<null>;
    return { data: null, error: null };
  } catch {
    return { data: null, error: { code: 'SERVER_FAILURE', message: 'Account services could not be reached. Check the web portal connection and try again.' } };
  }
}

export async function getStudentRegistrationForResubmission(): Promise<AppResult<StudentRegistrationResubmissionDetails>> {
  return getWebBff<StudentRegistrationResubmissionDetails>('/api/mobile/registration/resubmit');
}

export async function resubmitStudentRegistration(input: ResubmitStudentRegistrationInput): Promise<AppResult<null>> {
  if (!input.full_name.trim() || !input.student_number.trim() || !isStudentRegistrationCourse(input.course) ||
      input.year_level !== 4 || !input.id_card_front_path || !input.id_card_back_path)
    return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'Complete all required fields and upload both sides of your student ID.' } };
  return postWebBff<null>('/api/mobile/registration/resubmit', input);
}

export async function signIn(input: SignInInput): Promise<AppResult<AuthUser>> {
  if (!input.email?.trim())
    return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'Email is required.' } };
  if (!input.password)
    return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'Password is required.' } };

  await clearAttendanceIdentity();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: input.email.trim(),
    password: input.password,
  });

  if (error)
    return { data: null, error: { code: 'UNAUTHORIZED', message: 'Invalid email or password.' } };

  const { data: user, error: userError } = await supabase
    .from('users')
    .select('user_id, full_name, email, role, account_status')
    .eq('user_id', data.user.id)
    .single();

  if (userError || !user)
    return { data: null, error: { code: 'SERVER_FAILURE', message: 'Account not found.' } };

  if (user.account_status === 'pending') {
    await supabase.auth.signOut();
    return { data: null, error: { code: 'FORBIDDEN', message: 'Your account is pending approval.' } };
  }
  if (user.account_status === 'rejected') {
    if (user.role !== 'Student') {
      await supabase.auth.signOut();
      return { data: null, error: { code: 'FORBIDDEN', message: 'Your account registration was rejected.' } };
    }
  }
  if (user.account_status === 'inactive') {
    await supabase.auth.signOut();
    return { data: null, error: { code: 'FORBIDDEN', message: 'Your account has been deactivated.' } };
  }

  if (user.role !== 'Student') {
    await supabase.auth.signOut();
    return {
      data: null,
      error: {
        code: 'FORBIDDEN',
        message: `The CdM mobile app is exclusively for Student Trainees. As a ${user.role}, please access the system through the Web Portal.`,
      },
    };
  }

  if (user.account_status === 'active') await rememberAttendanceIdentity(user as AuthUser);
  return { data: user as AuthUser, error: null };
}

export async function requestStudentPasswordReset(email: string): Promise<AppResult<{ message: string }>> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail))
    return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'Enter a valid email address.' } };
  try {
    const response = await fetch(getWebPortalUrl('/api/mobile/auth/password-recovery'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: normalizedEmail }),
    });
    const result = await response.json();
    if (!response.ok || result.error)
      return { data: null, error: result.error || { code: 'SERVER_FAILURE', message: 'Recovery is temporarily unavailable. Try again later.' } };
    return { data: result.data as { message: string }, error: null };
  } catch {
    return { data: null, error: { code: 'SERVER_FAILURE', message: 'Recovery could not be reached. Check your connection and try again.' } };
  }
}

export async function signOut(): Promise<void> {
  await clearAttendanceIdentity();
  await supabase.auth.signOut();
}

export async function changeUserPassword(
  currentPassword: string,
  newPassword: string
): Promise<AppResult<null>> {
  if (!newPassword || newPassword.length < 8) {
    return {
      data: null,
      error: { code: 'VALIDATION_FAILURE', message: 'New password must be at least 8 characters long.' },
    };
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !user.email) {
    return {
      data: null,
      error: { code: 'UNAUTHORIZED', message: 'You must be signed in to update your password.' },
    };
  }

  // Verify current password first
  if (currentPassword) {
    const { error: verifyErr } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
    });
    if (verifyErr) {
      return {
        data: null,
        error: { code: 'UNAUTHORIZED', message: 'Current password verification failed. Please enter your correct current password.' },
      };
    }
  }

  // Update password in Supabase Auth
  const { error: updateErr } = await supabase.auth.updateUser({ password: newPassword });
  if (updateErr) {
    return {
      data: null,
      error: { code: 'SERVER_FAILURE', message: updateErr.message || 'Failed to update password.' },
    };
  }

  return { data: null, error: null };
}

export async function getAuthUser(): Promise<AuthUser | null> {
  if (!await isNetworkAvailable()) return (await getCachedAttendanceIdentity())?.user ?? null;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    await clearAttendanceIdentity();
    return null;
  }

  const { data } = await supabase
    .from('users')
    .select('user_id, full_name, email, role, account_status')
    .eq('user_id', user.id)
    .single();

  if (data) await rememberAttendanceIdentity(data as AuthUser);
  return data as AuthUser ?? null;
}
