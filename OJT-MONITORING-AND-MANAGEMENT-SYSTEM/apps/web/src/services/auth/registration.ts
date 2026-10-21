import 'server-only';
import crypto from 'crypto';
import { createClient } from '@/src/lib/supabase/server';
import { serviceClient, authActionLimit } from './internal';
import { validateUploadedBytes, validateUploadedFile } from '@/src/lib/uploadValidation';
import type { AppResult } from '@ojt/shared';
import type { RegisterStudentInput } from '@ojt/shared';
import type { ResubmitStudentRegistrationInput } from '@ojt/shared';
import { isStudentRegistrationCourse } from '@ojt/shared';
const DUPLICATE_REGISTRATION_MESSAGE = 'If you already have an account, sign in. If you believe this is a new registration, contact your OJT Coordinator.';

function hasMatchingIdCardPaths(frontPath: unknown, backPath: unknown): boolean {
  if (typeof frontPath !== 'string' || typeof backPath !== 'string') return false;
  const front = frontPath.match(/^id-cards\/(\d{10,16}_[a-f0-9]{24})_front\.(?:jpe?g|png)$/i);
  const back = backPath.match(/^id-cards\/(\d{10,16}_[a-f0-9]{24})_back\.(?:jpe?g|png)$/i);
  return Boolean(front && back && front[1].toLowerCase() === back[1].toLowerCase());
}

async function validateRegistrationIdCardFiles(
  service: ReturnType<typeof serviceClient>,
  frontPath: string,
  backPath: string
): Promise<AppResult<null>> {
  if (!hasMatchingIdCardPaths(frontPath, backPath))
    return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'Upload both sides of your student ID before submitting.' } };

  const storage = service.storage.from('private-documents');
  const [frontUpload, backUpload] = await Promise.all([
    storage.download(frontPath),
    storage.download(backPath),
  ]);
  if (frontUpload.error || !frontUpload.data || backUpload.error || !backUpload.data)
    return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'Upload both sides of your student ID again before submitting.' } };

  const allowedIdExtensions = ['.jpg', '.jpeg', '.png'] as const;
  const frontFile = validateUploadedBytes(
    new Uint8Array(await frontUpload.data.arrayBuffer()), frontPath, frontUpload.data.type,
    allowedIdExtensions, 5 * 1024 * 1024
  );
  const backFile = validateUploadedBytes(
    new Uint8Array(await backUpload.data.arrayBuffer()), backPath, backUpload.data.type,
    allowedIdExtensions, 5 * 1024 * 1024
  );
  if (frontFile.error || backFile.error)
    return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'Both student ID images must be valid JPG or PNG files no larger than 5 MB.' } };

  return { data: null, error: null };
}

export async function registerStudent(
  input: RegisterStudentInput
): Promise<AppResult<null>> {
  // Validate
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
  if (!isStudentRegistrationCourse(input.course))
    return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'Select one of the approved ICS or IBE programs.' } };
  if (input.year_level !== 4)
    return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'OJT registration is exclusively restricted to 4th-Year graduating students.' } };

  const frontPath = input.id_card_front_path || input.id_card_path;
  const backPath = input.id_card_back_path;
  if (typeof frontPath !== 'string' || typeof backPath !== 'string' || !hasMatchingIdCardPaths(frontPath, backPath))
    return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'Upload both sides of your student ID before registering.' } };

  const limitError = await authActionLimit('register', input.email, 3, 3600);
  if (limitError) return { data: null, error: limitError };

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl || supabaseUrl.includes('your-project-id')) {
    return {
      data: null,
      error: {
        code: 'SERVER_FAILURE',
        message: 'The service is temporarily unavailable. Please try again later.',
      },
    };
  }

  const service = serviceClient();
  const idCardValidation = await validateRegistrationIdCardFiles(service, frontPath, backPath);
  if (idCardValidation.error) return idCardValidation;

  // 1. Check duplicate student number
  const { data: existing } = await service
    .from('students')
    .select('student_id')
    .eq('student_number', input.student_number.trim())
    .maybeSingle();

  if (existing)
    return { data: null, error: { code: 'DUPLICATE_REQUEST', message: DUPLICATE_REGISTRATION_MESSAGE } };

  // Existing profile rows may still own academic history even if their Auth identity is missing.
  const { data: existingUser } = await service
    .from('users')
    .select('user_id')
    .eq('email', input.email.trim().toLowerCase())
    .maybeSingle();

  if (existingUser)
    return { data: null, error: { code: 'DUPLICATE_REQUEST', message: DUPLICATE_REGISTRATION_MESSAGE } };

  // Use the public signup flow so Supabase sends its email confirmation link.
  // Admin createUser(email_confirm: true) silently bypasses email ownership checks.
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || (process.env.NODE_ENV !== 'production' ? 'http://localhost:3000' : '');
  if (!appUrl || (process.env.NODE_ENV === 'production' && !appUrl.startsWith('https://'))) {
    return { data: null, error: { code: 'SERVER_FAILURE', message: 'Registration email confirmation is not configured.' } };
  }
  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email: input.email.trim(),
    password: input.password,
    options: {
      emailRedirectTo: new URL('/auth/callback', appUrl).toString(),
      data: {
        full_name: input.full_name.trim(),
        role: 'Student',
        student_number: input.student_number.trim(),
        course: input.course.trim(),
        year_level: input.year_level,
        id_card_path: frontPath,
        id_card_front_path: frontPath,
        id_card_back_path: backPath,
      },
    },
  });

  if (authError || !authData.user || authData.user.identities?.length === 0) {
    const duplicate = authError?.message?.toLowerCase().includes('already registered') || authData?.user?.identities?.length === 0;
    return { data: null, error: {
      code: duplicate ? 'DUPLICATE_REQUEST' : 'SERVER_FAILURE',
      message: duplicate || authData?.user?.identities?.length === 0
        ? DUPLICATE_REGISTRATION_MESSAGE
        : 'Registration could not be completed. Check the email address or try again later.',
    } };
  }

  // If Supabase is configured without email confirmations, do not silently create
  // an unverified account; remove it and tell the operator to enable confirmations.
  if (authData.session) {
    await supabase.auth.signOut();
    await service.auth.admin.deleteUser(authData.user.id);
    return { data: null, error: { code: 'SERVER_FAILURE', message: 'Email confirmation is disabled. Enable email confirmations in Supabase Auth before accepting registrations.' } };
  }

  // 4. Upsert student profile (handles both trigger-created row and ensures all fields are cleanly stored)
  // required_hours is not set at registration — coordinator configures it per assignment (FR-PROG-004)
  const { error: studentError } = await service.from('students').upsert({
    user_id: authData.user.id,
    student_number: input.student_number.trim(),
    course: input.course.trim(),
    year_level: input.year_level,
    status: 'active',
    id_card_path: frontPath,
    id_card_front_path: frontPath,
    id_card_back_path: backPath,
  }, { onConflict: 'user_id' });

  if (studentError) {
    // Rollback auth user
    await service.auth.admin.deleteUser(authData.user.id);
    return { data: null, error: { code: 'SERVER_FAILURE', message: 'Registration failed. Please try again.' } };
  }

  return { data: null, error: null };
}

export async function resubmitStudentRegistration(
  userId: string,
  input: ResubmitStudentRegistrationInput
): Promise<AppResult<null>> {
  if (!userId) return { data: null, error: { code: 'UNAUTHORIZED', message: 'Sign in to resubmit your registration.' } };
  if (!input.full_name?.trim() || input.full_name.trim().length > 200)
    return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'Enter your full legal name.' } };
  if (!input.student_number?.trim() || input.student_number.trim().length > 64)
    return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'Enter a valid student number.' } };
  if (!isStudentRegistrationCourse(input.course))
    return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'Select an approved ICS or IBE program.' } };
  if (input.year_level !== 4)
    return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'OJT registration is restricted to fourth-year students.' } };

  const frontPath = input.id_card_front_path;
  const backPath = input.id_card_back_path;
  if (!hasMatchingIdCardPaths(frontPath, backPath))
    return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'Upload both sides of your student ID before resubmitting.' } };

  const limitError = await authActionLimit('register', userId, 3, 3600, 'user');
  if (limitError) return { data: null, error: limitError };

  const service = serviceClient();
  const idCardValidation = await validateRegistrationIdCardFiles(service, frontPath, backPath);
  if (idCardValidation.error) return idCardValidation;

  const { data, error } = await service.rpc('resubmit_student_registration', {
    p_user_id: userId,
    p_full_name: input.full_name.trim(),
    p_student_number: input.student_number.trim(),
    p_course: input.course,
    p_year_level: input.year_level,
    p_id_card_front_path: frontPath,
    p_id_card_back_path: backPath,
  });
  if (error) {
    console.error('[resubmitStudentRegistration] Transactional resubmission failed');
    return { data: null, error: { code: 'SERVER_FAILURE', message: 'Failed to resubmit your registration. Please try again.' } };
  }
  if (data === 'duplicate_student_number')
    return { data: null, error: { code: 'DUPLICATE_REQUEST', message: 'That student number is already linked to another account.' } };
  if (data === 'not_found')
    return { data: null, error: { code: 'NOT_FOUND', message: 'This account is no longer eligible for resubmission.' } };
  if (data !== 'ok')
    return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'The registration details or ID images are invalid.' } };

  return { data: null, error: null };
}

export async function uploadStudentIdCard(formData: FormData): Promise<AppResult<{ front_path: string; back_path: string }>> {
  const email = formData.get('email');
  if (typeof email !== 'string' || !email.trim())
    return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'Registration email is required.' } };
  const limitError = await authActionLimit('id_card_upload', email, 3, 3600);
  if (limitError) return { data: null, error: limitError };

  const front = await validateUploadedFile(formData.get('front_file') as File | null, ['.jpg', '.jpeg', '.png'], 5 * 1024 * 1024);
  if (front.error || !front.data) return { data: null, error: front.error };
  const back = await validateUploadedFile(formData.get('back_file') as File | null, ['.jpg', '.jpeg', '.png'], 5 * 1024 * 1024);
  if (back.error || !back.data) return { data: null, error: back.error };

  const service = serviceClient();
  const prefix = `id-cards/${Date.now()}_${crypto.randomBytes(12).toString('hex')}`;
  const frontPath = `${prefix}_front${front.data.extension}`;
  const backPath = `${prefix}_back${back.data.extension}`;
  const storage = service.storage.from('private-documents');
  const { error: frontError } = await storage.upload(frontPath, front.data.bytes, { contentType: front.data.mimeType, upsert: false });
  if (frontError) {
    return { data: null, error: { code: 'SERVER_FAILURE', message: 'Unable to upload your ID right now. Please try again later.' } };
  }
  const { error: backError } = await storage.upload(backPath, back.data.bytes, { contentType: back.data.mimeType, upsert: false });
  if (backError) {
    await storage.remove([frontPath]);
    return { data: null, error: { code: 'SERVER_FAILURE', message: 'Unable to upload both sides of your ID. Please try again.' } };
  }

  return { data: { front_path: frontPath, back_path: backPath }, error: null };
}
