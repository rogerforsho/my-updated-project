import { createClient } from '@supabase/supabase-js';
import { authenticateMobileStudent, mobileBffFailure } from '@/src/lib/mobile-bff';
import { getServiceClient } from '@/src/lib/supabase/service';
import { authActionLimit } from '@/src/services/auth/internal';
import { defaultStudentPassword } from '@/src/lib/default-password';

export const runtime = 'nodejs';

// Clears users.must_change_password once the student's password is no longer the default.
export async function POST(request: Request) {
  const auth = await authenticateMobileStudent(request);
  if (auth.error) return mobileBffFailure(auth.error);
  const { actor } = auth;
  const email = actor.user.email;
  if (!email) return mobileBffFailure({ status: 400, code: 'VALIDATION_FAILURE', message: 'Account has no email.' });

  const rateLimitError = await authActionLimit('password_reset_verify', actor.user.id, 10, 900, 'user');
  if (rateLimitError) return mobileBffFailure({
    status: rateLimitError.code === 'RATE_LIMITED' ? 429 : 503,
    code: rateLimitError.code,
    message: rateLimitError.message,
  });

  const service = getServiceClient();
  const { data: student } = await service.from('students').select('student_number').eq('user_id', actor.user.id).maybeSingle();
  if (!student) return mobileBffFailure({ status: 404, code: 'NOT_FOUND', message: 'Student profile not found.' });

  // If the default password still signs in, the student has not changed it.
  const probe = createClient(
    (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL)!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
  const { error: probeError } = await probe.auth.signInWithPassword({ email, password: defaultStudentPassword(student.student_number) });
  if (!probeError)
    return mobileBffFailure({ status: 400, code: 'VALIDATION_FAILURE', message: 'Choose a password different from the default.' });

  const { error } = await service.from('users').update({ must_change_password: false }).eq('user_id', actor.user.id);
  if (error) return mobileBffFailure({ status: 500, code: 'SERVER_FAILURE', message: 'Could not update your account.' });
  return Response.json({ data: null, error: null }, { headers: { 'Cache-Control': 'no-store' } });
}
