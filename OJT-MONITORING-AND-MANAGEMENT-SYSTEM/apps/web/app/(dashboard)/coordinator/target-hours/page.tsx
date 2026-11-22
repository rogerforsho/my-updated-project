import { redirect } from 'next/navigation';
import { createClient } from '@/src/lib/supabase/server';
import { TargetHoursPanel } from '@/src/components/coordinator/TargetHoursPanel';

export default async function CoordinatorTargetHoursPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/sign-in');

  const { data: grants } = await supabase.from('staff_capability_grants').select('department_scope')
    .eq('user_id', user.id).eq('capability', 'academic_workflows').is('revoked_at', null);
  const hasGrant = (grants ?? []).some((g) => g.department_scope === 'ICS' || g.department_scope === 'IBE');

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-4 max-w-4xl mx-auto page-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Target Hours</h1>
        <p className="text-sm text-slate-500 mt-1">The Required Hours of each program come from the school, CHED and the curriculum. Set them here once; every student of the program follows.</p>
      </div>
      {hasGrant
        ? <TargetHoursPanel />
        : <p className="rounded-xl bg-slate-50 p-6 text-sm text-slate-600">You have no department grant, so you cannot set Target Hours.</p>}
    </div>
  );
}
