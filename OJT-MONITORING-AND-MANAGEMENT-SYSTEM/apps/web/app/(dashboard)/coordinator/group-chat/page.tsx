import { redirect } from 'next/navigation';
import GroupChatWorkspace from '@/src/components/chat/GroupChatWorkspace';
import { getTrustedActor } from '@/src/lib/trusted-actor';
import { departmentScope } from '@/src/lib/department-scope';

export default async function CoordinatorGroupChatPage() {
  const { supabase, user, profile } = await getTrustedActor();
  if (!user || profile?.role !== 'Coordinator') redirect('/dashboard?reason=unauthorized');
  const scope = await departmentScope(supabase, user.id, 'Coordinator');
  if (scope.error || !scope.departments.length) redirect('/dashboard?reason=unauthorized');
  return <GroupChatWorkspace userId={user.id} departments={scope.departments} />;
}
