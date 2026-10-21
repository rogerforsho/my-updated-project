import type { AppResult } from '@ojt/shared';

type AllowedExtension = '.pdf' | '.docx' | '.doc' | '.jpg' | '.jpeg' | '.png';

const MIME_TYPES: Record<AllowedExtension, string> = {
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.doc': 'application/msword',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
};

function matchesSignature(extension: AllowedExtension, bytes: Buffer): boolean {
  if (extension === '.pdf') return bytes.subarray(0, 5).toString('ascii') === '%PDF-';
  if (extension === '.jpg' || extension === '.jpeg')
    return bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (extension === '.png')
    return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (extension === '.doc')
    return bytes.subarray(0, 8).equals(Buffer.from([208, 207, 17, 224, 161, 177, 26, 225]));
  return bytes.subarray(0, 4).equals(Buffer.from([80, 75, 3, 4])) &&
    bytes.includes(Buffer.from('[Content_Types].xml')) && bytes.includes(Buffer.from('word/document.xml'));
}

export async function validateUploadedFile(
  file: File | null,
  allowedExtensions: readonly AllowedExtension[],
  maxBytes: number
): Promise<AppResult<{ bytes: Buffer; extension: AllowedExtension; mimeType: string }>> {
  if (!file || !(file instanceof File) || file.size === 0 || file.size > maxBytes)
    return { data: null, error: { code: 'VALIDATION_FAILURE', message: `Select a file smaller than ${Math.round(maxBytes / 1048576)} MB.` } };

  return validateUploadedBytes(Buffer.from(await file.arrayBuffer()), file.name, file.type, allowedExtensions, maxBytes);
}

export function validateUploadedBytes(
  input: Uint8Array,
  fileName: string,
  contentType: string,
  allowedExtensions: readonly AllowedExtension[],
  maxBytes: number
): AppResult<{ bytes: Buffer; extension: AllowedExtension; mimeType: string }> {
  const bytes = Buffer.from(input);
  if (bytes.length === 0 || bytes.length > maxBytes)
    return { data: null, error: { code: 'VALIDATION_FAILURE', message: `Select a file smaller than ${Math.round(maxBytes / 1048576)} MB.` } };

  const extension = fileName.toLowerCase().match(/\.[^.]+$/)?.[0] as AllowedExtension | undefined;
  if (!extension || !allowedExtensions.includes(extension))
    return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'Unsupported file extension.' } };

  const mimeType = MIME_TYPES[extension];
  if (contentType && contentType !== 'application/octet-stream' && contentType !== mimeType)
    return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'File type does not match its extension.' } };

  if (!matchesSignature(extension, bytes))
    return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'File content does not match its declared format.' } };

  return { data: { bytes, extension, mimeType }, error: null };
}
