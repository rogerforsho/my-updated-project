import { redirect } from 'next/navigation';
import ChatWorkspace from '@/src/components/chat/ChatWorkspace';
import { getTrustedActor } from '@/src/lib/trusted-actor';

export default async function CoordinatorMessagesPage() {
  const { user, profile } = await getTrustedActor();
  if (!user || profile?.role !== 'Coordinator') redirect('/dashboard?reason=unauthorized');
  return <ChatWorkspace userId={user.id} role="Coordinator" />;
}
