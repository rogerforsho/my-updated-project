import { redirect } from 'next/navigation';
import { createClient } from '@/src/lib/supabase/server';
import { NonWorkingDaysPanel } from '@/src/components/NonWorkingDaysPanel';

export default async function CoordinatorNonWorkingDaysPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/sign-in');

  const { data: grants } = await supabase.from('staff_capability_grants').select('department_scope')
    .eq('user_id', user.id).eq('capability', 'academic_workflows').is('revoked_at', null);
  const departments = [...new Set((grants ?? []).map((g) => g.department_scope as string))]
    .filter((d): d is 'ICS' | 'IBE' => d === 'ICS' || d === 'IBE');

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-4 max-w-4xl mx-auto page-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Holidays and days off</h1>
        <p className="text-sm text-slate-500 mt-1">National holidays come from the Super Admin. Add suspensions for your department or a single company.</p>
      </div>
      {departments.length === 0
        ? <p className="rounded-xl bg-slate-50 p-6 text-sm text-slate-600">You have no department grant, so you cannot add dates.</p>
        : <NonWorkingDaysPanel mode="coordinator" departments={departments} />}
    </div>
  );
}
