import { uploadStudentIdCard } from '@/src/services/auth';
import { authenticateMobileStudent, mobileBffFailure } from '@/src/lib/mobile-bff';
export const runtime = 'nodejs';
const MAX_BODY = 11 * 1024 * 1024;
export async function POST(request: Request) {
  let authenticatedEmail: string | null = null;
  if (request.headers.has('authorization')) {
    const auth = await authenticateMobileStudent(request, 'rejected');
    if (auth.error) return mobileBffFailure(auth.error);
    authenticatedEmail = auth.actor.user.email?.trim().toLowerCase() ?? null;
    if (!authenticatedEmail) return mobileBffFailure({ status: 403, code: 'FORBIDDEN', message: 'This account cannot upload registration documents.' });
  }
  const error = (message: string, status: number) => Response.json({ data: null, error: { code: 'VALIDATION_FAILURE', message } }, { status });
  if (Number(request.headers.get('content-length')) > MAX_BODY) return error('Upload is too large.', 413);
  const contentType = request.headers.get('content-type');
  const reader = request.body?.getReader();
  if (!reader) return error('Missing upload.', 400);
  const timeout = setTimeout(() => { void reader.cancel('Upload timed out.'); }, 15000);
  try {
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY) { await reader.cancel(); return error('Upload is too large.', 413); }
      chunks.push(value);
    }
    if (!contentType?.startsWith('multipart/form-data;')) return error('Expected a file upload.', 400);
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const form = await new Response(bytes, { headers: { 'Content-Type': contentType } }).formData();
    const submittedEmail = form.get('email');
    if (authenticatedEmail && (typeof submittedEmail !== 'string' || submittedEmail.trim().toLowerCase() !== authenticatedEmail))
      return mobileBffFailure({ status: 403, code: 'FORBIDDEN', message: 'Use the email address linked to your student account.' });
    const result = await uploadStudentIdCard(form);
    return Response.json(result, { status: result.error ? result.error.code === 'RATE_LIMITED' ? 429 : result.error.code === 'SERVER_FAILURE' ? 503 : 400 : 200, headers: { 'Cache-Control': 'no-store' } });
  } catch { return error('The upload could not be read. Please try again.', 400); }
  finally { clearTimeout(timeout); reader.releaseLock(); }
}
