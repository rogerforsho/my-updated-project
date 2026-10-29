import { redirect } from 'next/navigation';
import { createClient } from '@/src/lib/supabase/server';
import { getMyCompanyIntake, listSupervisedTrainees } from '@/src/services/supervisorTrainees';
import { Badge } from '@/src/components/ui/Badge';
import { TraineeBoard } from './TraineeBoard';

export default async function SupervisorStudentsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/sign-in');

  const [trainees, intake] = await Promise.all([listSupervisedTrainees(), getMyCompanyIntake()]);
  const list = trainees.data ?? [];
  const active = list.filter((t) => t.placement.assignment_status === 'active').length;

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-6xl mx-auto page-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Assigned Trainees</h1>
          <p className="text-sm text-slate-500 mt-1">Where each trainee is deployed, their hours, and downloads of their reports and attendance.</p>
        </div>
        <Badge variant="outline" className="px-3 py-1 text-sm font-medium">{active} Active Trainees</Badge>
      </div>
      {trainees.error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{trainees.error.message}</p>}
      <TraineeBoard trainees={list} intake={intake.data} />
    </div>
  );
}
