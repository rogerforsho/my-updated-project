import { isUuid, mobileBffFailure, mobileBffOk, mobileBffPreamble } from '@/src/lib/mobile-bff';

export const runtime = 'nodejs';
const ok = () => mobileBffOk(null);

// Body: { all: true } marks every visible unread notice read; { notification_id, archive?: true } marks one read or archives it.
export async function POST(request: Request) {
  const pre = await mobileBffPreamble(request, { body: { maxBytes: 16 * 1024, label: 'Notification request', lenient: true } });
  if (pre.response) return pre.response;
  const { actor, body } = pre;

  const notifications = () => actor.supabase.from('notifications');
  if (body.all === true) {
    const { error } = await notifications().update({ status: 'read' })
      .eq('receiver_user_id', actor.user.id).eq('status', 'unread').is('archived_at', null);
    if (error) return mobileBffFailure({ status: 503, code: 'SERVER_FAILURE', message: 'Failed to update notifications.' });
    return ok();
  }

  const notificationId = body.notification_id;
  if (!isUuid(notificationId))
    return mobileBffFailure({ status: 400, code: 'VALIDATION_FAILURE', message: 'Notification ID is invalid.' });
  // Archiving also marks read so a hidden notice never keeps an unread count alive.
  const changes = body.archive === true ? { status: 'read' as const, archived_at: new Date().toISOString() } : { status: 'read' as const };
  const { data, error } = await notifications().update(changes)
    .eq('notification_id', notificationId)
    .eq('receiver_user_id', actor.user.id)
    .select('notification_id').maybeSingle();
  if (error) return mobileBffFailure({ status: 503, code: 'SERVER_FAILURE', message: 'Failed to update notification.' });
  if (!data) return mobileBffFailure({ status: 404, code: 'NOT_FOUND', message: 'Notification not found.' });
  return ok();
}
