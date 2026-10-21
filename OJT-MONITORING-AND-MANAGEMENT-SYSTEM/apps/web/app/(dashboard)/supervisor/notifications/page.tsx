import { redirect } from 'next/navigation';
import { getTrustedActor } from '@/src/lib/trusted-actor';
import StaffNotificationInbox from '@/src/components/notifications/StaffNotificationInbox';

export default async function SupervisorNotificationsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const { user, profile } = await getTrustedActor();
  if (!user || profile?.role !== 'Supervisor') redirect('/dashboard?reason=unauthorized');
  const params = await searchParams;
  return <StaffNotificationInbox role="Supervisor" page={Number(params.page) || 1} />;
}
