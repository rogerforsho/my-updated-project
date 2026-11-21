import { mobileBffFailure, mobileBffPreamble } from '@/src/lib/mobile-bff';
import { getServiceClient } from '@/src/lib/supabase/service';

export const runtime = 'nodejs';

// A student posts to their own department's group chat; the department comes from the database, not the request.
export async function POST(request: Request) {
  const pre = await mobileBffPreamble(request, {
    limit: { action: 'group_chat_post', max: 30, windowSeconds: 600 },
    body: { maxBytes: 8 * 1024, label: 'Message' },
  });
  if (pre.response) return pre.response;
  const { actor, body } = pre;
  const content = typeof body.content === 'string' ? body.content.trim() : '';
  if (!content || content.length > 4000)
    return mobileBffFailure({ status: 400, code: 'VALIDATION_FAILURE', message: 'Write a message up to 4000 characters.' });

  // Optional idempotency key from the phone's outbox; a retry of the same message is stored once.
  const clientId = typeof body.client_id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.client_id)
    ? body.client_id : null;
  if (body.client_id != null && !clientId)
    return mobileBffFailure({ status: 400, code: 'VALIDATION_FAILURE', message: 'Invalid message id.' });

  const service = getServiceClient();
  const { data: department } = await service.rpc('student_group_chat_department', { p_user_id: actor.user.id });
  if (department !== 'ICS' && department !== 'IBE')
    return mobileBffFailure({ status: 403, code: 'FORBIDDEN', message: 'Your department group is not available.' });
  const { error } = await service.rpc('post_group_chat_message',
    { p_sender: actor.user.id, p_department: department, p_content: content, p_client_id: clientId });
  if (error)
    return mobileBffFailure({ status: error.code === '42501' ? 403 : 503, code: error.code === '42501' ? 'FORBIDDEN' : 'SERVER_FAILURE', message: 'Your message could not be sent.' });
  return Response.json({ data: null, error: null }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
}
