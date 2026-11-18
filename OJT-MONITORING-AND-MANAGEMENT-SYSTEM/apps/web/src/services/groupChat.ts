'use server';

import { getTrustedActor } from '@/src/lib/trusted-actor';
import { getServiceClient } from '@/src/lib/supabase/service';
import { departmentScope } from '@/src/lib/department-scope';
import { authActionLimit } from '@/src/services/auth/internal';
import type { AppResult } from '@ojt/shared';

/** Post to a department group chat. Students post through /api/mobile/group-chat instead. */
export async function postGroupChatMessage(input: { department: string; content: string }): Promise<AppResult<null>> {
  const content = String(input?.content ?? '').trim();
  if (!content || content.length > 4000)
    return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'Write a message up to 4000 characters.' } };

  const { supabase, user, profile } = await getTrustedActor();
  if (!user || profile?.role !== 'Coordinator')
    return { data: null, error: { code: 'FORBIDDEN', message: 'Only OJT Coordinators can post from the web portal.' } };
  const scope = await departmentScope(supabase, user.id, 'Coordinator');
  if (scope.error || !scope.departments.includes(input.department))
    return { data: null, error: { code: 'FORBIDDEN', message: 'You can only post in your own department group.' } };
  const limitError = await authActionLimit('group_chat_post', user.id, 60, 600, 'user');
  if (limitError) return { data: null, error: limitError };

  const { error } = await getServiceClient().rpc('post_group_chat_message',
    { p_sender: user.id, p_department: input.department, p_content: content });
  if (error) return { data: null, error: { code: 'SERVER_FAILURE', message: 'Your message could not be sent. Please try again.' } };
  return { data: null, error: null };
}
