import { authenticateMobileStudent, mobileBffFailure } from '@/src/lib/mobile-bff';
import { authActionLimit } from '@/src/services/auth/internal';
import { readLimitedJson } from '@/src/lib/read-limited-json';
import { validateUploadedBytes } from '@/src/lib/uploadValidation';
import { getServiceClient } from '@/src/lib/supabase/service';

export const runtime = 'nodejs';

function text(value: unknown, min: number, max: number): value is string {
  return typeof value === 'string' && value.trim().length >= min && value.trim().length <= max;
}

function ownedEvidencePath(path: string, userId: string) {
  return new RegExp(`^${userId}/reports/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\\.(pdf|docx|doc|jpg|jpeg|png)$`, 'i').test(path);
}

async function removeOwnedEvidence(paths: Array<string | null | undefined>, userId: string) {
  const owned = paths.filter((path): path is string => typeof path === 'string' && ownedEvidencePath(path, userId));
  const service = getServiceClient();
  const unreferenced: string[] = [];
  for (const path of owned) {
    const { data, error } = await service.from('company_requests').select('request_id')
      .or(`business_permit_path.eq.${path},moa_path.eq.${path}`).limit(1).maybeSingle();
    if (!error && !data) unreferenced.push(path);
  }
  if (unreferenced.length) await service.storage.from('private-documents').remove(unreferenced);
}

async function validEvidence(path: string | null | undefined, userId: string): Promise<boolean> {
  if (path == null) return true;
  const extension = path.toLowerCase().match(/\.[^.]+$/)?.[0];
  if (!ownedEvidencePath(path, userId) || !['.pdf', '.docx', '.doc', '.jpg', '.jpeg', '.png'].includes(extension ?? '')) return false;
  const storage = getServiceClient().storage.from('private-documents');
  const { data: info, error: infoError } = await storage.info(path);
  if (infoError || !info || typeof info.size !== 'number' || info.size < 1 || info.size > 10 * 1024 * 1024) return false;
  const { data: file, error: downloadError } = await storage.download(path);
  if (downloadError || !file) return false;
  const checked = validateUploadedBytes(new Uint8Array(await file.arrayBuffer()), path, file.type, ['.pdf', '.docx', '.doc', '.jpg', '.jpeg', '.png'], 10 * 1024 * 1024);
  return !checked.error;
}

export async function POST(request: Request) {
  const auth = await authenticateMobileStudent(request);
  if (auth.error) return mobileBffFailure(auth.error);
  const limited = await authActionLimit('report_submit', auth.actor.user.id, 5, 3600, 'user');
  if (limited) return mobileBffFailure({ status: limited.code === 'RATE_LIMITED' ? 429 : 503, code: limited.code, message: limited.message });
  const parsed = await readLimitedJson(request, 16 * 1024);
  if (parsed.error) return mobileBffFailure({ status: parsed.error === 'too_large' ? 413 : 400, code: 'VALIDATION_FAILURE', message: 'Company request could not be read.' });
  const body = parsed.data;
  if (!body || typeof body !== 'object' || Array.isArray(body))
    return mobileBffFailure({ status: 400, code: 'VALIDATION_FAILURE', message: 'Invalid company request.' });
  const input = body as Record<string, unknown>;
  const fields = [
    ['requested_company_name', 2, 200], ['company_address', 2, 500], ['contact_person', 2, 150],
    ['contact_email', 3, 254], ['contact_number', 5, 40], ['requested_branch_name', 1, 150], ['branch_address', 2, 500],
  ] as const;
  if (fields.some(([key, min, max]) => !text(input[key], min, max)) ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(input.contact_email).trim()) ||
      ['business_permit_path', 'moa_path'].some((key) => input[key] != null &&
        (typeof input[key] !== 'string' || !input[key].startsWith(`${auth.actor.user.id}/reports/`) || input[key].length > 500)))
    return mobileBffFailure({ status: 400, code: 'VALIDATION_FAILURE', message: 'Check the HTE and branch details, email, and uploaded evidence.' });

  // A student already placed cannot ask for another company (one active placement at a time).
  const { count: activePlacements, error: placementError } = await auth.actor.supabase.from('student_assignments')
    .select('*', { count: 'exact', head: true }).eq('student_id', auth.actor.studentId).eq('assignment_status', 'active');
  if (placementError) return mobileBffFailure({ status: 503, code: 'SERVER_FAILURE', message: 'Could not check your placement. Try again.' });
  if ((activePlacements ?? 0) > 0) {
    await removeOwnedEvidence([input.business_permit_path as string | null | undefined, input.moa_path as string | null | undefined], auth.actor.user.id);
    return mobileBffFailure({ status: 409, code: 'DUPLICATE_REQUEST', message: 'You already have an active placement. Ask your coordinator if you need to change it.' });
  }

  if (!await validEvidence(input.business_permit_path as string | null | undefined, auth.actor.user.id) ||
      !await validEvidence(input.moa_path as string | null | undefined, auth.actor.user.id)) {
    await removeOwnedEvidence([input.business_permit_path as string | null | undefined, input.moa_path as string | null | undefined], auth.actor.user.id);
    return mobileBffFailure({ status: 400, code: 'VALIDATION_FAILURE', message: 'Uploaded HTE evidence could not be verified. Choose a valid PDF, Word document, or image up to 10 MB.' });
  }

  const { data, error } = await auth.actor.supabase.from('company_requests').insert({
    student_id: auth.actor.studentId,
    submitted_by: auth.actor.user.id,
    requested_company_name: String(input.requested_company_name).trim(),
    company_address: String(input.company_address).trim(),
    contact_person: String(input.contact_person).trim(),
    contact_email: String(input.contact_email).trim().toLowerCase(),
    contact_number: String(input.contact_number).trim(),
    requested_branch_name: String(input.requested_branch_name).trim(),
    branch_address: String(input.branch_address).trim(),
    business_permit_path: (input.business_permit_path as string | null | undefined) ?? null,
    moa_path: (input.moa_path as string | null | undefined) ?? null,
  }).select('request_id, status, created_at').single();
  if (error || !data) {
    await removeOwnedEvidence([input.business_permit_path as string | null | undefined, input.moa_path as string | null | undefined], auth.actor.user.id);
    return mobileBffFailure({ status: 409, code: 'DUPLICATE_REQUEST', message: 'A pending HTE request already exists or the request could not be saved.' });
  }
  return Response.json({ data, error: null }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
}
