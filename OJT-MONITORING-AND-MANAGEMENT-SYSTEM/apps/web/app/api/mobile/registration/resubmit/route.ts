import { mobileBffFailure, mobileBffPreamble } from '@/src/lib/mobile-bff';
import { getServiceClient } from '@/src/lib/supabase/service';
import { resubmitStudentRegistration } from '@/src/services/auth/registration';
import type { ResubmitStudentRegistrationInput } from '@ojt/shared';

export const runtime = 'nodejs';
const MAX_BODY = 16 * 1024;

export async function GET(request: Request) {
  const pre = await mobileBffPreamble(request, { requiredStatus: 'rejected' });
  if (pre.response) return pre.response;
  const { actor } = pre;

  const service = getServiceClient();
  const [profile, student, review] = await Promise.all([
    service.from('users').select('full_name, email').eq('user_id', actor.user.id).maybeSingle(),
    service.from('students').select('student_number, course').eq('student_id', actor.studentId).maybeSingle(),
    service.from('audit_logs').select('details').eq('entity_type', 'user').eq('entity_id', actor.user.id)
      .eq('action', 'STUDENT_REGISTRATION_REJECTED').order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ]);

  if (profile.error || !profile.data || student.error || !student.data)
    return mobileBffFailure({ status: 503, code: 'SERVER_FAILURE', message: 'Your registration details could not be loaded.' });

  const details = review.data?.details;
  const reason = details && typeof details === 'object' ? (details as Record<string, unknown>).reason : null;
  return Response.json({
    data: {
      full_name: profile.data.full_name,
      email: profile.data.email,
      student_number: student.data.student_number,
      course: student.data.course,
      year_level: 4,
      rejection_reason: typeof reason === 'string' ? reason : null,
    },
    error: null,
  }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  const pre = await mobileBffPreamble(request, { requiredStatus: 'rejected', body: { maxBytes: MAX_BODY, label: 'Registration request' } });
  if (pre.response) return pre.response;
  const { actor, body: input } = pre;

  if (typeof input.full_name !== 'string' || typeof input.student_number !== 'string' ||
      typeof input.course !== 'string' || input.year_level !== 4 ||
      typeof input.id_card_front_path !== 'string' || typeof input.id_card_back_path !== 'string')
    return mobileBffFailure({ status: 400, code: 'VALIDATION_FAILURE', message: 'Complete the required registration fields and upload both sides of your student ID.' });

  const registrationInput: ResubmitStudentRegistrationInput = {
    full_name: input.full_name,
    student_number: input.student_number,
    course: input.course,
    year_level: 4,
    id_card_front_path: input.id_card_front_path,
    id_card_back_path: input.id_card_back_path,
  };
  const result = await resubmitStudentRegistration(actor.user.id, registrationInput);
  const status = result.error?.code === 'DUPLICATE_REQUEST' ? 409
    : result.error?.code === 'FORBIDDEN' ? 403
      : result.error?.code === 'NOT_FOUND' ? 404
        : result.error?.code === 'RATE_LIMITED' ? 429
          : result.error?.code === 'SERVER_FAILURE' ? 503
            : result.error ? 400 : 200;
  return Response.json(result, { status, headers: { 'Cache-Control': 'no-store' } });
}
