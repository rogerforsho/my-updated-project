import { getTrustedActor } from '@/src/lib/trusted-actor';
import { listCohortProgress } from '@/src/services/progress';
import { recordAuditEvent } from '@/src/lib/audit';
import { toCsv } from '@/src/lib/csv';
import { STUDENT_REGISTRATION_COURSES } from '@ojt/shared';

export const runtime = 'nodejs';

const STATUSES = ['not_started', 'in_progress', 'completed'] as const;
type Status = (typeof STATUSES)[number];
const PAGE = 200;

const fail = (status: number, message: string) =>
  Response.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } });

/** CSV of the cohort progress list for the signed-in Coordinator: every row, not just the page on screen. */
export async function GET(request: Request) {
  const { user, profile } = await getTrustedActor();
  if (!user || profile?.role !== 'Coordinator') return fail(403, 'Access denied.');

  const url = new URL(request.url);
  const status = url.searchParams.get('status') || undefined;
  const course = url.searchParams.get('course') || undefined;
  if (status && !STATUSES.includes(status as Status)) return fail(400, 'Invalid progress status.');
  if (course && !(STUDENT_REGISTRATION_COURSES as readonly string[]).includes(course)) return fail(400, 'Invalid program.');

  // listCohortProgress re-checks the role and applies the Coordinator's department scope.
  const first = await listCohortProgress(1, PAGE, course, status as Status | undefined);
  if (first.error || !first.data) return fail(first.error?.code === 'FORBIDDEN' ? 403 : 500, first.error?.message ?? 'Could not build the export.');
  const students = [...first.data.students];
  for (let page = 2; page <= Math.ceil(first.data.total / PAGE); page++) {
    const next = await listCohortProgress(page, PAGE, course, status as Status | undefined);
    if (next.error || !next.data) return fail(500, 'Could not build the export.');
    students.push(...next.data.students);
  }

  const csv = toCsv(
    ['Student number', 'Name', 'Program', 'Host company', 'Rendered hours', 'Required hours', 'Remaining hours', 'Percentage', 'Status'],
    students.map((s) => [s.student_number, s.full_name, s.course, s.company_name, s.completed_hours, s.required_hours, s.remaining_hours, s.percentage, s.progress_status]),
  );

  await recordAuditEvent({ actor_user_id: user.id, action: 'COHORT_PROGRESS_EXPORTED', entity_type: 'student', details: { status: status ?? 'all', course: course ?? 'all', rows: students.length } });
  const name = `cohort-progress_${(status ?? 'all').replace('_', '-')}${course ? `_${course}` : ''}.csv`;
  return new Response(`﻿${csv}`, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${name}"`,
      'Cache-Control': 'no-store',
    },
  });
}
