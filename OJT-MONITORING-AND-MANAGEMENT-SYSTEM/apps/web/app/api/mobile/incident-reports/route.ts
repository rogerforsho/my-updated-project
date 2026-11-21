import { mobileBffFailure, mobileBffPreamble } from '@/src/lib/mobile-bff';
import { recordAuditEvent } from '@/src/lib/audit';

export const runtime = 'nodejs';

const CATEGORIES = ['harassment', 'safety', 'supervisor_conduct', 'workplace_condition', 'other'];

export async function POST(request: Request) {
  const pre = await mobileBffPreamble(request, {
    // Generous on purpose: this counter is shared with other submissions and must never lock a student out of reporting a concern.
    limit: { action: 'report_submit', max: 30, windowSeconds: 3600 },
    body: { maxBytes: 16 * 1024, label: 'Incident report' },
  });
  if (pre.response) return pre.response;
  const { actor } = pre;
  const { category, description } = pre.body;
  if (typeof category !== 'string' || !CATEGORIES.includes(category) ||
      typeof description !== 'string' || description.trim().length < 10 || description.trim().length > 4000)
    return mobileBffFailure({ status: 400, code: 'VALIDATION_FAILURE', message: 'Choose a category and describe what happened (10 to 4000 characters).' });

  // Insert as the student so RLS and the guard trigger apply.
  const { data, error } = await actor.supabase.from('incident_reports').insert({
    student_id: actor.studentId,
    submitted_by: actor.user.id,
    category,
    description: description.trim(),
  }).select('incident_id, status, created_at').single();
  if (error || !data)
    return mobileBffFailure({ status: 500, code: 'SERVER_FAILURE', message: 'The report could not be saved. Please try again.' });

  // The audit entry records that a report exists, never its contents.
  await recordAuditEvent({ actor_user_id: actor.user.id, action: 'INCIDENT_REPORT_SUBMITTED', entity_type: 'incident_report', entity_id: data.incident_id });
  return Response.json({ data, error: null }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
}
