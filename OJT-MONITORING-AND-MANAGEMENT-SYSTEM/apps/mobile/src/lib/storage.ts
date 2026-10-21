import { getWebPortalUrl } from './webPortal';
/**
 * Unified Mobile Media & Document Storage Service
 * Colegio de Montalban - OJT Practicum System
 *
 * Student uploads are authorized by the web BFF and sent to Supabase Storage
 * with short-lived upload tokens. Photos are compressed on-device first.
 */

import * as FileSystem from 'expo-file-system/legacy';
import { File as ExpoFile } from 'expo-file-system';
import { supabase } from './supabase';
import { decodeBase64ToArrayBuffer } from './base64';
import { optimizeSelfie, optimizeDocumentImage } from './imageOptimizer';
import { postWebBff } from './webBff';
import type { AppResult } from '@ojt/shared';

function resolveMimeType(fileName: string, providedMime?: string): string {
  if (providedMime && providedMime !== 'application/octet-stream' && providedMime.includes('/')) {
    return providedMime;
  }
  const ext = fileName.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'pdf':
      return 'application/pdf';
    case 'doc':
      return 'application/msword';
    case 'docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    default:
      return providedMime || 'application/pdf';
  }
}

async function convertSourceToArrayBuffer(source: string): Promise<ArrayBuffer> {
  // Remote HTTP/HTTPS URL
  if (source.startsWith('http://') || source.startsWith('https://')) {
    const response = await fetch(source);
    return await response.arrayBuffer();
  }

  // Base64 string or data URI (JPEG base64 starts with /9j/)
  const isBase64 =
    source.startsWith('data:') ||
    source.startsWith('/9j/') ||
    (!source.startsWith('file://') && !source.startsWith('content://') && source.length > 500);

  if (isBase64) {
    return decodeBase64ToArrayBuffer(source);
  }

  // Local file URI, Android content URI, or absolute file path
  if (source.startsWith('file://') || source.startsWith('content://') || source.startsWith('/')) {
    const uriToRead = source.startsWith('/') ? `file://${source}` : source;
    try {
      const base64 = await FileSystem.readAsStringAsync(uriToRead, {
        encoding: 'base64',
      });
      return decodeBase64ToArrayBuffer(base64);
    } catch (fsErr) {
      console.warn('[convertSourceToArrayBuffer] FileSystem read error, attempting fetch fallback:', fsErr);
      const res = await fetch(uriToRead);
      const blob = await res.blob();
      if (typeof (blob as any).arrayBuffer === 'function') {
        return await (blob as any).arrayBuffer();
      }
      throw fsErr;
    }
  }

  // Fallback direct base64 decode
  return decodeBase64ToArrayBuffer(source);
}

/**
 * Upload an Attendance Selfie with on-device compression
 */
export async function uploadSelfieToStorage(
  imagePayload: string,
  studentId: string,
  type: 'time_in' | 'time_out',
  uploadId?: string,
): Promise<AppResult<{ path: string; url?: string }>> {
  try {
    let finalPayload = imagePayload;

    // If source is a local file URI, compress it first
    if (imagePayload.startsWith('file://') || imagePayload.startsWith('content://')) {
      const optimized = await optimizeSelfie(imagePayload, { includeBase64: true });
      finalPayload = optimized.base64 || optimized.uri;
    }

    const arrayBuffer = await convertSourceToArrayBuffer(finalPayload);
    const upload = await postWebBff<{ path: string; token: string | null; alreadyUploaded: boolean }>('/api/mobile/attendance/selfie', {
      type,
      upload_id: uploadId,
    });
    if (upload.error || !upload.data)
      return { data: null, error: upload.error || { code: 'SERVER_FAILURE', message: 'Could not prepare a secure selfie upload.' } };
    if (!upload.data.path.startsWith(`${studentId}/`) || !upload.data.path.toLowerCase().endsWith('.jpg'))
      return { data: null, error: { code: 'SERVER_FAILURE', message: 'The selfie upload could not be verified.' } };
    if (upload.data.alreadyUploaded) return { data: { path: upload.data.path }, error: null };
    if (!upload.data.token)
      return { data: null, error: { code: 'SERVER_FAILURE', message: 'Could not prepare a secure selfie upload.' } };

    const { data, error } = await supabase.storage.from('attendance-selfies').uploadToSignedUrl(
      upload.data.path,
      upload.data.token,
      arrayBuffer,
      { contentType: 'image/jpeg' },
    );
    if (error || !data)
      return { data: null, error: { code: 'SERVER_FAILURE', message: 'Failed to upload selfie evidence.' } };
    return { data: { path: data.path }, error: null };
  } catch (err) {
    console.error('[uploadSelfieToStorage] Exception:', err);
    return { data: null, error: { code: 'SERVER_FAILURE', message: 'Error processing selfie image.' } };
  }
}

/**
 * Upload a Report Document (PDF, DOCX, or Scanned Image)
 */
export async function uploadReportToStorage(
  fileUri: string,
  fileName: string,
  studentId: string,
  mimeType: string = 'application/pdf'
): Promise<AppResult<{ path: string; url?: string }>> {
  try {
    let sourceUri = fileUri;
    let precomputedBuffer: ArrayBuffer | null = null;
    const resolvedMime = resolveMimeType(fileName, mimeType);

    // If document is an image (scanned report), compress it on-device first
    if (resolvedMime.startsWith('image/')) {
      const optimized = await optimizeDocumentImage(fileUri);
      if (optimized.base64) {
        precomputedBuffer = decodeBase64ToArrayBuffer(optimized.base64);
      } else {
        sourceUri = optimized.uri;
      }
    }

    const cleanFileName = fileName.split(/[\\/]/).at(-1)?.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 200) || 'report.pdf';
    const arrayBuffer = precomputedBuffer || (await convertSourceToArrayBuffer(sourceUri));
    const upload = await postWebBff<{ filePath: string; token: string }>('/api/mobile/reports/upload', {
      file_name: cleanFileName,
      file_size: arrayBuffer.byteLength,
    });
    if (upload.error || !upload.data)
      return { data: null, error: upload.error || { code: 'SERVER_FAILURE', message: 'Could not prepare a secure document upload.' } };
    if (!upload.data.filePath.startsWith(`${studentId}/reports/`))
      return { data: null, error: { code: 'SERVER_FAILURE', message: 'The document upload could not be verified.' } };

    const { data, error } = await supabase.storage.from('private-documents').uploadToSignedUrl(
      upload.data.filePath,
      upload.data.token,
      arrayBuffer,
      { contentType: resolvedMime },
    );
    if (error || !data)
      return { data: null, error: { code: 'SERVER_FAILURE', message: 'Failed to upload document.' } };
    return { data: { path: data.path }, error: null };
  } catch (err: any) {
    console.error('[uploadReportToStorage] Exception:', err);
    return { data: null, error: { code: 'SERVER_FAILURE', message: err?.message || 'Error processing report file.' } };
  }
}

/**
 * Upload Validated Student ID Card during Registration
 */
export async function uploadRegistrationIdCard(
  front: { uri: string; name: string },
  back: { uri: string; name: string },
  email: string,
  authenticatedResubmission = false,
): Promise<AppResult<{ front_path: string; back_path: string }>> {
  try {
    const data = new FormData();
    data.append('email', email.trim());
    data.append('front_file', new ExpoFile(front.uri), front.name);
    data.append('back_file', new ExpoFile(back.uri), back.name);
    let uploadUrl: string;
    try {
      uploadUrl = getWebPortalUrl('/api/registration/id-card');
    } catch (error) {
      return { data: null, error: { code: 'SERVER_FAILURE', message: error instanceof Error ? error.message : 'Account services are not configured.' } };
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const session = authenticatedResubmission ? (await supabase.auth.getSession()).data.session : null;
      if (authenticatedResubmission && !session?.access_token)
        return { data: null, error: { code: 'UNAUTHORIZED', message: 'Sign in again before uploading your corrected ID.' } };
      const headers = session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined;
      const response = await fetch(uploadUrl, { method: 'POST', body: data, headers, signal: controller.signal });
      const result = await response.json();
      if (!response.ok || result.error || !result.data?.front_path || !result.data?.back_path) return { data: null, error: { code: 'SERVER_FAILURE', message: result.error?.message || 'Unable to upload your ID. Please try again.' } };
      return { data: { front_path: result.data.front_path, back_path: result.data.back_path }, error: null };
    } finally { clearTimeout(timeout); }
  } catch {
    return { data: null, error: { code: 'SERVER_FAILURE', message: 'Unable to upload your ID. Check your connection or contact your coordinator.' } };
  }
}
