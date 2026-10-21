import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/src/lib/supabase/server';
import { listAllUsers, getSystemOverview } from '@/src/services/admin';
import AdminClient from './AdminClient';
import AdminMfaGate from './AdminMfaGate';

export const metadata: Metadata = {
  title: 'System Administration',
};

export default async function AdminPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/sign-in');

  const { data: profile } = await supabase
    .from('users')
    .select('role, account_status')
    .eq('user_id', user.id)
    .single();

  if (profile?.role !== 'Admin' || profile?.account_status !== 'active') {
    redirect('/dashboard');
  }

  const { data: assurance } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (assurance?.currentLevel !== 'aal2') return <AdminMfaGate />;

  const [usersResult, overviewResult] = await Promise.all([
    listAllUsers(1, 10),
    getSystemOverview(),
  ]);
  if (usersResult.error || overviewResult.error) {
    throw new Error('Unable to load the administration overview. Please retry.');
  }

  const initialUsers = usersResult.data?.users ?? [];
  const totalUsers = usersResult.data?.total ?? 0;
  const overview = overviewResult.data ?? {
    totalUsers: 0,
    activeUsers: 0,
    pendingUsers: 0,
    roleBreakdown: {},
  };

  return <AdminClient initialUsers={initialUsers} totalUsers={totalUsers} overview={overview} />;
}
