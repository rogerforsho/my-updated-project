import { authenticateMobileStudent, mobileBffFailure } from '@/src/lib/mobile-bff';
import { readLimitedJson } from '@/src/lib/read-limited-json';

export const runtime = 'nodejs';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ok = () => Response.json({ data: null, error: null }, { status: 200, headers: { 'Cache-Control': 'no-store' } });

// Body: { all: true } marks every visible unread notice read; { notification_id, archive?: true } marks one read or archives it.
export async function POST(request: Request) {
  const auth = await authenticateMobileStudent(request);
  if (auth.error) return mobileBffFailure(auth.error);
  const parsed = await readLimitedJson(request, 16 * 1024);
  if (parsed.error === 'too_large')
    return mobileBffFailure({ status: 413, code: 'VALIDATION_FAILURE', message: 'Notification request is too large.' });
  if (parsed.error)
    return mobileBffFailure({ status: 400, code: 'VALIDATION_FAILURE', message: 'Notification request could not be read.' });
  const body = parsed.data && typeof parsed.data === 'object' && !Array.isArray(parsed.data)
    ? parsed.data as Record<string, unknown> : {};

  const notifications = () => auth.actor.supabase.from('notifications');
  if (body.all === true) {
    const { error } = await notifications().update({ status: 'read' })
      .eq('receiver_user_id', auth.actor.user.id).eq('status', 'unread').is('archived_at', null);
    if (error) return mobileBffFailure({ status: 503, code: 'SERVER_FAILURE', message: 'Failed to update notifications.' });
    return ok();
  }

  const notificationId = body.notification_id;
  if (typeof notificationId !== 'string' || !UUID.test(notificationId))
    return mobileBffFailure({ status: 400, code: 'VALIDATION_FAILURE', message: 'Notification ID is invalid.' });
  // Archiving also marks read so a hidden notice never keeps an unread count alive.
  const changes = body.archive === true ? { status: 'read' as const, archived_at: new Date().toISOString() } : { status: 'read' as const };
  const { data, error } = await notifications().update(changes)
    .eq('notification_id', notificationId)
    .eq('receiver_user_id', auth.actor.user.id)
    .select('notification_id').maybeSingle();
  if (error) return mobileBffFailure({ status: 503, code: 'SERVER_FAILURE', message: 'Failed to update notification.' });
  if (!data) return mobileBffFailure({ status: 404, code: 'NOT_FOUND', message: 'Notification not found.' });
  return ok();
}
