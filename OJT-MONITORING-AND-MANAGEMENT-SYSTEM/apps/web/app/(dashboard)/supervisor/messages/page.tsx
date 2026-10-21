import { redirect } from 'next/navigation';
import ChatWorkspace from '@/src/components/chat/ChatWorkspace';
import { getTrustedActor } from '@/src/lib/trusted-actor';

export default async function SupervisorMessagesPage() {
  const { user, profile } = await getTrustedActor();
  if (!user || profile?.role !== 'Supervisor') redirect('/dashboard?reason=unauthorized');
  return <ChatWorkspace userId={user.id} role="Supervisor" />;
}
