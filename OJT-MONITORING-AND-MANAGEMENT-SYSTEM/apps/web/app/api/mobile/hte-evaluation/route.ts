import { mobileBffFailure, mobileBffOk, mobileBffPreamble } from '@/src/lib/mobile-bff';
import { getServiceClient } from '@/src/lib/supabase/service';
import { recordAuditEvent } from '@/src/lib/audit';
import { HTE_COMMENTS_MAX, isValidHteRatings, resolveRequiredHours, scoreHteEvaluation } from '@ojt/shared';

export const runtime = 'nodejs';

type StudentRow = { course: string | null; required_hours: number | null; users: { full_name: string } | null };
type AssignmentRow = {
  company_id: string; branch_id: string | null; start_date: string; end_date: string | null;
  companies: { company_name: string } | null; company_branches: { branch_name: string } | null;
};

/** Student, placement and progress for the form. Not filtered on an active assignment: the OJT may already be completed. */
async function loadContext(studentId: string) {
  const db = getServiceClient();
  const [student, assignment, progress, existing] = await Promise.all([
    db.from('students').select('course, required_hours, users(full_name)').eq('student_id', studentId).maybeSingle(),
    db.from('student_assignments').select('company_id, branch_id, start_date, end_date, companies(company_name), company_branches(branch_name)')
      .eq('student_id', studentId).order('start_date', { ascending: false }).limit(1).maybeSingle(),
    db.from('internship_progress').select('progress_status, completed_hours').eq('student_id', studentId).maybeSingle(),
    db.from('hte_evaluations').select('department_assigned, field_of_training, ratings, total_score, comments, submitted_at')
      .eq('student_id', studentId).maybeSingle(),
  ]);
  if (student.error || assignment.error || progress.error || existing.error) return null;
  const studentRow = student.data as unknown as StudentRow | null;
  const assignmentRow = assignment.data as unknown as AssignmentRow | null;
  return {
    studentRow, assignmentRow,
    completedHours: Number(progress.data?.completed_hours ?? 0),
    unlocked: progress.data?.progress_status === 'completed',
    requiredHours: resolveRequiredHours(studentRow?.required_hours, studentRow?.course),
    existing: existing.data,
  };
}

export async function GET(request: Request) {
  const pre = await mobileBffPreamble(request);
  if (pre.response) return pre.response;
  const ctx = await loadContext(pre.actor.studentId);
  if (!ctx) return mobileBffFailure({ status: 503, code: 'SERVER_FAILURE', message: 'Could not load your evaluation form.' });
  return mobileBffOk({
    unlocked: ctx.unlocked,
    completedHours: ctx.completedHours,
    requiredHours: ctx.requiredHours,
    student: { name: ctx.studentRow?.users?.full_name ?? '', program: ctx.studentRow?.course ?? '' },
    placement: ctx.assignmentRow && {
      companyName: ctx.assignmentRow.companies?.company_name ?? '',
      branchName: ctx.assignmentRow.company_branches?.branch_name ?? '',
      startDate: ctx.assignmentRow.start_date,
      endDate: ctx.assignmentRow.end_date,
    },
    submitted: ctx.existing,
  });
}

export async function POST(request: Request) {
  const pre = await mobileBffPreamble(request, {
    limit: { action: 'report_submit', max: 10, windowSeconds: 3600 },
    body: { maxBytes: 16 * 1024, label: 'Evaluation' },
  });
  if (pre.response) return pre.response;
  const { actor, body } = pre;
  const invalid = (message: string) => mobileBffFailure({ status: 400, code: 'VALIDATION_FAILURE', message });

  const department = typeof body.department_assigned === 'string' ? body.department_assigned.trim() : '';
  const field = typeof body.field_of_training === 'string' ? body.field_of_training.trim() : '';
  const comments = typeof body.comments === 'string' ? body.comments.trim() : '';
  if (!department || department.length > 120) return invalid('Enter the division or department you were assigned to (up to 120 characters).');
  if (!field || field.length > 120) return invalid('Enter the field of training you were given (up to 120 characters).');
  if (comments.length > HTE_COMMENTS_MAX) return invalid(`Comments are limited to ${HTE_COMMENTS_MAX} characters.`);
  if (!isValidHteRatings(body.ratings)) return invalid('Rate all 11 statements from 1 to 5.');
  if (body.certified !== true) return invalid('Confirm that your answers are true and correct.');

  const ctx = await loadContext(actor.studentId);
  if (!ctx) return mobileBffFailure({ status: 503, code: 'SERVER_FAILURE', message: 'Could not check your OJT progress.' });
  if (!ctx.unlocked)
    return mobileBffFailure({ status: 409, code: 'FORBIDDEN', message: 'The evaluation opens when you complete your Required Hours.' });
  if (!ctx.assignmentRow)
    return mobileBffFailure({ status: 409, code: 'FORBIDDEN', message: 'No HTE placement was found for your account.' });
  if (ctx.existing)
    return mobileBffFailure({ status: 409, code: 'FORBIDDEN', message: 'You already submitted your HTE evaluation.' });

  const { data: saved, error } = await getServiceClient().from('hte_evaluations').insert({
    student_id: actor.studentId,
    company_id: ctx.assignmentRow.company_id,
    branch_id: ctx.assignmentRow.branch_id,
    department_assigned: department,
    field_of_training: field,
    ratings: body.ratings,
    total_score: scoreHteEvaluation(body.ratings),
    comments: comments || null,
  }).select('hte_evaluation_id').single();
  // 23505: a second tap raced the first; the unique index on student_id is the real guard.
  if (error?.code === '23505')
    return mobileBffFailure({ status: 409, code: 'FORBIDDEN', message: 'You already submitted your HTE evaluation.' });
  if (error || !saved)
    return mobileBffFailure({ status: 503, code: 'SERVER_FAILURE', message: 'Failed to submit your evaluation.' });

  await recordAuditEvent({
    actor_user_id: actor.user.id,
    action: 'HTE_EVALUATION_SUBMITTED',
    entity_type: 'hte_evaluation',
    entity_id: saved.hte_evaluation_id,
    details: { company_id: ctx.assignmentRow.company_id, client: 'mobile' },
  });
  return mobileBffOk(null);
}
