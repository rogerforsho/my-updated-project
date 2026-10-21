import { authenticateMobileStudent, mobileBffFailure } from '@/src/lib/mobile-bff';
import { readLimitedJson } from '@/src/lib/read-limited-json';

export const runtime = 'nodejs';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const auth = await authenticateMobileStudent(request);
  if (auth.error) return mobileBffFailure(auth.error);
  const parsed = await readLimitedJson(request, 16 * 1024);
  if (parsed.error === 'too_large')
    return mobileBffFailure({ status: 413, code: 'VALIDATION_FAILURE', message: 'Notification request is too large.' });
  if (parsed.error)
    return mobileBffFailure({ status: 400, code: 'VALIDATION_FAILURE', message: 'Notification request could not be read.' });
  const body = parsed.data;
  const notificationId = body && typeof body === 'object' && !Array.isArray(body)
    ? (body as Record<string, unknown>).notification_id
    : null;
  if (typeof notificationId !== 'string' || !UUID.test(notificationId))
    return mobileBffFailure({ status: 400, code: 'VALIDATION_FAILURE', message: 'Notification ID is invalid.' });

  const { data, error } = await auth.actor.supabase.from('notifications')
    .update({ status: 'read' })
    .eq('notification_id', notificationId)
    .eq('receiver_user_id', auth.actor.user.id)
    .select('notification_id').maybeSingle();
  if (error) return mobileBffFailure({ status: 503, code: 'SERVER_FAILURE', message: 'Failed to update notification.' });
  if (!data) return mobileBffFailure({ status: 404, code: 'NOT_FOUND', message: 'Notification not found.' });
  return Response.json({ data: null, error: null }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
}
