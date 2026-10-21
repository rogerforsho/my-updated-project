'use server';

import { createClient } from '@/src/lib/supabase/server';
import { getServiceClient } from '@/src/lib/supabase/service';
import { authActionLimit } from '@/src/services/auth/internal';
import { toPublicSupabaseUrl } from '@/src/lib/supabase/public-url';
import crypto from 'node:crypto';
import type { AppResult } from '@ojt/shared';

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_EXTENSIONS = ['.pdf', '.docx', '.doc', '.jpg', '.jpeg', '.png'] as const;

/**
 * Creates a one-use upload token for the authenticated student's private path.
 * File bytes go directly from the browser to Supabase Storage; submitReport
 * downloads and validates the stored bytes before inserting report metadata.
 */
export async function createPrivateDocumentUploadUrl(input: {
  file_name: string;
  file_size: number;
}): Promise<AppResult<{ filePath: string; token: string }>> {
  const extension = input.file_name.toLowerCase().match(/\.[^.]+$/)?.[0];
  if (!extension || !ALLOWED_EXTENSIONS.includes(extension as typeof ALLOWED_EXTENSIONS[number]))
    return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'Unsupported file extension.' } };
  if (!Number.isSafeInteger(input.file_size) || input.file_size < 1 || input.file_size > MAX_FILE_SIZE_BYTES)
    return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'Select a file smaller than 10 MB.' } };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: null, error: { code: 'UNAUTHORIZED', message: 'Not authenticated.' } };

  const { data: profile } = await supabase
    .from('users')
    .select('role, account_status')
    .eq('user_id', user.id)
    .maybeSingle();
  if (profile?.role !== 'Student' || profile.account_status !== 'active')
    return { data: null, error: { code: 'FORBIDDEN', message: 'Only active students can submit reports.' } };

  const limitError = await authActionLimit('report_upload', user.id, 10, 3600, 'user');
  if (limitError) return { data: null, error: limitError };

  const path = `${user.id}/reports/${crypto.randomUUID()}${extension}`;
  const { data, error } = await getServiceClient().storage.from('private-documents').createSignedUploadUrl(path, { upsert: false });
  if (error || !data?.token)
    return { data: null, error: { code: 'SERVER_FAILURE', message: 'Could not prepare a secure upload. Please try again.' } };

  return { data: { filePath: path, token: data.token }, error: null };
}

/**
 * Generates a short-lived cryptographically signed URL for private student documents.
 * Adheres to Philippine Data Privacy Act (RA 10173) and ISO/IEC 25010:2023 Confidentiality standards.
 * Expiration defaults to 60 seconds.
 */
export async function getSignedDocumentUrl(
  filePath: string,
  expiresInSeconds = 60
): Promise<AppResult<{ signedUrl: string }>> {
  if (!filePath?.trim()) {
    return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'File path is required.' } };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { data: null, error: { code: 'UNAUTHORIZED', message: 'Not authenticated.' } };
  }

  const { data: profile } = await supabase
    .from('users')
    .select('role, account_status')
    .eq('user_id', user.id)
    .single();

  if (!profile || profile.account_status !== 'active') {
    return { data: null, error: { code: 'FORBIDDEN', message: 'Access denied.' } };
  }

  if (!Number.isInteger(expiresInSeconds) || expiresInSeconds < 1 || expiresInSeconds > 300 ||
      filePath.startsWith('http://'))
    return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'Invalid document path or expiry.' } };

  // Query with the caller's JWT; report RLS limits rows to permitted records.
  const { data: report, error: reportError } = await supabase
    .from('reports').select('student_id').eq('file_path', filePath).limit(1).maybeSingle();
  if (reportError || !report)
    return { data: null, error: { code: 'FORBIDDEN', message: 'Document is not available to this account.' } };

  if (filePath.startsWith('https://')) return { data: { signedUrl: filePath }, error: null };

  const { data: student } = await supabase
    .from('students').select('user_id, student_id').eq('student_id', report.student_id).single();
  if (!student || !(filePath.startsWith(`${student.user_id}/`) || filePath.startsWith(`${student.student_id}/`)))
    return { data: null, error: { code: 'FORBIDDEN', message: 'Document path does not belong to this student.' } };

  const { data, error } = await supabase.storage
    .from('private-documents')
    .createSignedUrl(filePath, expiresInSeconds);

  if (error || !data) {
    return { data: null, error: { code: 'SERVER_FAILURE', message: 'Failed to generate secure document URL.' } };
  }

  return { data: { signedUrl: toPublicSupabaseUrl(data.signedUrl) }, error: null };
}
