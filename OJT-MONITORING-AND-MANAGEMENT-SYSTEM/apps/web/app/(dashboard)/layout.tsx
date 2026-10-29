import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getAuthUser } from '@/src/services/auth';
import { createClient } from '@/src/lib/supabase/server';
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

  // A coordinator's granted departments pick the theme (ICS orange, IBE blue); other roles stay neutral.
  let departments: ('ICS' | 'IBE')[] = [];
  if (user.role === 'Coordinator') {
    const supabase = await createClient();
    const { data: grants } = await supabase.from('staff_capability_grants').select('department_scope')
      .eq('user_id', user.user_id).eq('capability', 'academic_workflows').is('revoked_at', null);
    departments = [...new Set((grants ?? []).map((g) => g.department_scope as string))]
      .filter((d): d is 'ICS' | 'IBE' => d === 'ICS' || d === 'IBE').sort();
  }

  return (
    <DashboardShell user={user} departments={departments}>
      {children}
    </DashboardShell>
  );
}
