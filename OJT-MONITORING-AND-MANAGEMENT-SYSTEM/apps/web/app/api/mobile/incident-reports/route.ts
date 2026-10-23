import { authenticateMobileStudent, mobileBffFailure } from '@/src/lib/mobile-bff';
import { authActionLimit } from '@/src/services/auth/internal';
import { readLimitedJson } from '@/src/lib/read-limited-json';
import { recordAuditEvent } from '@/src/lib/audit';

export const runtime = 'nodejs';

const CATEGORIES = ['harassment', 'safety', 'supervisor_conduct', 'workplace_condition', 'other'];

export async function POST(request: Request) {
  const auth = await authenticateMobileStudent(request);
  if (auth.error) return mobileBffFailure(auth.error);
  // Generous on purpose: this counter is shared with other submissions and must never lock a student out of reporting a concern.
  const limited = await authActionLimit('report_submit', auth.actor.user.id, 30, 3600, 'user');
  if (limited) return mobileBffFailure({ status: limited.code === 'RATE_LIMITED' ? 429 : 503, code: limited.code, message: limited.message });

  const parsed = await readLimitedJson(request, 16 * 1024);
  if (parsed.error) return mobileBffFailure({ status: parsed.error === 'too_large' ? 413 : 400, code: 'VALIDATION_FAILURE', message: 'The report could not be read.' });
  const input = parsed.data;
  if (!input || typeof input !== 'object' || Array.isArray(input))
    return mobileBffFailure({ status: 400, code: 'VALIDATION_FAILURE', message: 'Invalid incident report.' });
  const { category, description } = input as Record<string, unknown>;
  if (typeof category !== 'string' || !CATEGORIES.includes(category) ||
      typeof description !== 'string' || description.trim().length < 10 || description.trim().length > 4000)
    return mobileBffFailure({ status: 400, code: 'VALIDATION_FAILURE', message: 'Choose a category and describe what happened (10 to 4000 characters).' });

  // Insert as the student so RLS and the guard trigger apply.
  const { data, error } = await auth.actor.supabase.from('incident_reports').insert({
    student_id: auth.actor.studentId,
    submitted_by: auth.actor.user.id,
    category,
    description: description.trim(),
  }).select('incident_id, status, created_at').single();
  if (error || !data)
    return mobileBffFailure({ status: 500, code: 'SERVER_FAILURE', message: 'The report could not be saved. Please try again.' });

  // The audit entry records that a report exists, never its contents.
  await recordAuditEvent({ actor_user_id: auth.actor.user.id, action: 'INCIDENT_REPORT_SUBMITTED', entity_type: 'incident_report', entity_id: data.incident_id });
  return Response.json({ data, error: null }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
}
