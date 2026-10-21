import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getAuthUser } from '@/src/services/auth';
import DashboardShell from '@/src/components/layout/DashboardShell';

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
};

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getAuthUser();

  if (!user) redirect('/auth/sign-in');
  if (user.account_status === 'pending') redirect('/auth/pending');
  if (user.account_status !== 'active') redirect('/auth/sign-in');
  if (user.role === 'Student') redirect('/auth/sign-in?reason=mobile_only');

  return (
    <DashboardShell user={user}>
      {children}
    </DashboardShell>
  );
}
