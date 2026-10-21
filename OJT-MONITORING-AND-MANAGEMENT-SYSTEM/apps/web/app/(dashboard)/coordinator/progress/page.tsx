import { redirect } from 'next/navigation';
import { createClient } from '@/src/lib/supabase/server';
import { listCohortProgress } from '@/src/services/progress';
import { Card } from '@/src/components/ui/Card';
import { Badge } from '@/src/components/ui/Badge';
import { Users } from '@/src/components/ui/Icons';
import Link from 'next/link';
import ClearanceActionModal from '@/src/components/coordinator/ClearanceActionModal';

interface Props {
  searchParams: Promise<{ course?: string; status?: string; page?: string }>;
}

export default async function CoordinatorProgressPage({ searchParams }: Props) {
  const params = await searchParams;
  const courseFilter = params.course;
  const statusFilter = params.status;
  const page = Number(params.page) || 1;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/sign-in');

  const { data: profile } = await supabase.from('users').select('role').eq('user_id', user.id).single();
  const { data, error } = await listCohortProgress(page, 50, courseFilter, statusFilter as 'not_started' | 'in_progress' | 'completed' | undefined);
  if (error) throw new Error(error.message);
  const students = data?.students ?? [];
  const total = data?.total ?? 0;

  const courses = ['All', 'BSIT', 'BSCS', 'BSBA-MKT', 'BSBA-HRM', 'BSBA-FM', 'BSA'];
  const statusTabs = [
    { label: 'All Trainees', key: '' },
    { label: 'Not started', key: 'not_started' },
    { label: 'In progress', key: 'in_progress' },
    { label: 'Completed', key: 'completed' },
  ];

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto page-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Cohort Progress Monitoring</h1>
          <p className="text-sm text-slate-500 mt-1">Real-time rendered hours and milestone tracking for 4th-year ICS & IBE trainees; targets follow each student’s configured requirement.</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="px-3.5 py-1.5 text-sm font-semibold bg-emerald-50 text-[#0A3824] border-emerald-200">
            {total} Total Trainees
          </Badge>
        </div>
      </div>

      {/* Health Status Filter Bar */}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        {statusTabs.map((tab) => {
          const isSelected = (!statusFilter && tab.key === '') || statusFilter === tab.key;
          const queryParams = new URLSearchParams();
          if (courseFilter) queryParams.set('course', courseFilter);
          if (tab.key) queryParams.set('status', tab.key);
          const href = `/coordinator/progress${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;

          return (
            <Link
              key={tab.key}
              href={href}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                isSelected
                  ? 'bg-[#0A3824] text-white shadow-sm'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      {/* Course Filter Pills */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {courses.map((c) => {
          const isSelected = (c === 'All' && !courseFilter) || courseFilter === c;
          const queryParams = new URLSearchParams();
          if (c !== 'All') queryParams.set('course', c);
          if (statusFilter) queryParams.set('status', statusFilter);
          const href = `/coordinator/progress${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;

          return (
            <Link
              key={c}
              href={href}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                isSelected
                  ? 'bg-[#092E1D] text-[var(--cdm-sand)] font-semibold shadow-sm'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              {c}
            </Link>
          );
        })}
      </div>

      {/* Trainees List Table */}
      <Card className="border-slate-200/80 shadow-sm overflow-hidden bg-white rounded-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50/80 border-b border-slate-100 text-xs font-semibold text-slate-600 uppercase tracking-wider">
              <tr>
                <th className="py-3.5 px-5">Student</th>
                <th className="py-3.5 px-4">Program</th>
                <th className="py-3.5 px-4">Host Company</th>
                <th className="py-3.5 px-4">Rendered / Target</th>
                <th className="py-3.5 px-4 w-52">Milestone Progress</th>
                <th className="py-3.5 px-5 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {students.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-16 text-center text-slate-400">
                    <Users className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                    <p className="font-medium text-slate-600">No student progress records match the selected filter.</p>
                  </td>
                </tr>
              ) : (
                students.map((s) => {
                  const isDone = s.progress_status === 'completed';
                  return (
                    <tr key={s.student_id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-4 px-5">
                        <div className="font-semibold text-slate-900">{s.full_name}</div>
                        <div className="text-xs text-slate-400 font-mono mt-0.5">{s.student_number}</div>
                      </td>
                      <td className="py-4 px-4">
                        <Badge variant="outline" className="text-xs font-semibold bg-slate-50">
                          {s.course}
                        </Badge>
                      </td>
                      <td className="py-4 px-4">
                        <div className="text-xs font-medium text-slate-700 max-w-[200px] truncate">
                          {s.company_name || 'Unassigned'}
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <div className="text-xs font-bold text-slate-900">
                          {s.completed_hours} <span className="text-slate-400 font-normal">/ {s.required_hours || 486} hrs</span>
                        </div>
                        <div className="text-[11px] text-slate-400">{s.remaining_hours} hrs remaining</div>
                      </td>
                      <td className="py-4 px-4">
                        <div className="space-y-1">
                          <div className="flex justify-between text-[11px] font-semibold text-slate-700">
                            <span>{s.percentage}%</span>
                            <span className="text-slate-400 font-normal">{s.remaining_hours <= 0 ? 'Target Reached' : `${s.remaining_hours.toFixed(1)}h left`}</span>
                          </div>
                          <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${
                                isDone
                                  ? 'bg-emerald-500'
                                  : s.percentage >= 75
                                  ? 'bg-[#0A3824]'
                                  : s.percentage >= 25
                                  ? 'bg-amber-500'
                                  : 'bg-slate-400'
                              }`}
                              style={{ width: `${Math.min(100, s.percentage)}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Badge
                            className={
                              isDone
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200 text-xs font-semibold'
                                : s.percentage >= 75
                                ? 'bg-emerald-50 text-[#0A3824] border-emerald-200 text-xs font-semibold'
                                : s.percentage >= 25
                                ? 'bg-amber-50 text-amber-700 border-amber-200 text-xs font-semibold'
                                : 'bg-slate-100 text-slate-600 border-slate-200 text-xs font-semibold'
                            }
                          >
                            {isDone ? 'Completed' : s.percentage >= 75 ? '75%+ complete' : s.percentage >= 25 ? '25–74% complete' : 'Under 25% complete'}
                          </Badge>
                          <ClearanceActionModal
                            studentId={s.student_id}
                            studentName={s.full_name}
                            completedHours={s.completed_hours}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
