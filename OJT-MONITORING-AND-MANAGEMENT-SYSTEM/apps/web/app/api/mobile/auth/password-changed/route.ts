import { createClient } from '@supabase/supabase-js';
import { mobileBffFailure, mobileBffPreamble } from '@/src/lib/mobile-bff';
import { getServiceClient } from '@/src/lib/supabase/service';
import { defaultStudentPassword } from '@/src/lib/default-password';

export const runtime = 'nodejs';

// Clears users.must_change_password once the student's password is no longer the default.
export async function POST(request: Request) {
  const pre = await mobileBffPreamble(request, {
    beforeLimit: async (actor) => actor.user.email
      ? null
      : mobileBffFailure({ status: 400, code: 'VALIDATION_FAILURE', message: 'Account has no email.' }),
    limit: { action: 'password_reset_verify', max: 10, windowSeconds: 900 },
  });
  if (pre.response) return pre.response;
  const { actor } = pre;
  const email = actor.user.email!;

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
