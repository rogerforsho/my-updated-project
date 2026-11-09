import type { Metadata } from 'next';
import Link from 'next/link';
import CampusBulletin from '@/src/components/dashboard/CampusBulletin';
import { redirect } from 'next/navigation';

export const metadata: Metadata = {
  title: 'Practicum Dashboard',
};
import { getAuthUser } from '@/src/services/auth';
import { createClient } from '@/src/lib/supabase/server';
import { listCohortProgress, type StudentProgressDetail } from '@/src/services/progress';
import { ArrowRight } from '@/src/components/ui/Icons';

export default async function DashboardPage() {
  const user = await getAuthUser();
  if (!user) redirect('/auth/sign-in');
  if (user.role === 'Admin') redirect('/admin');

  const supabase = await createClient();

  // Role-specific stats query
  let stats: any = {};
  let departmentSubtitle = 'Colegio de Montalban';
  let progressRows: StudentProgressDetail[] = [];
  let progressError: string | null = null;

  if (user.role === 'Coordinator') {
    departmentSubtitle = 'OJT Coordinator Office';
    const [
      { count: pendingApprovals },
      { count: activeStudents },
      { count: totalCompanies },
      { count: atRiskCount },
    ] = await Promise.all([
      supabase.from('users').select('*', { count: 'exact', head: true }).eq('role', 'Student').eq('account_status', 'pending'),
      supabase.from('students').select('*', { count: 'exact', head: true }).eq('status', 'active'),
      supabase.from('companies').select('*', { count: 'exact', head: true }).eq('status', 'active'),
      supabase.from('internship_progress').select('*', { count: 'exact', head: true }).lt('completed_hours', 100),
    ]);

    const progress = await listCohortProgress(1, 5);
    if (progress.error) progressError = 'Trainee progress could not be loaded. Open Monitor Progress to retry.';
    else progressRows = progress.data?.students ?? [];

    stats = {
      pendingApprovals: pendingApprovals || 0,
      activeStudents: activeStudents || 0,
      totalCompanies: totalCompanies || 0,
      atRiskCount: atRiskCount || 0,
    };
  } else if (user.role === 'Supervisor') {
    const { data: supervisor } = await supabase
      .from('supervisors')
      .select('supervisor_id, companies(company_name)')
      .eq('user_id', user.user_id)
      .maybeSingle();

    const companyName = (supervisor?.companies as any)?.company_name;
    departmentSubtitle = companyName
      ? `${companyName} • Industry Practicum Partner`
      : 'Industry Host Training Establishment (HTE)';

    if (supervisor) {
      const [
        { count: assignedStudents },
        { count: pendingAttendance },
        { count: completedEvaluations },
      ] = await Promise.all([
        supabase.from('student_assignments').select('*', { count: 'exact', head: true }).eq('supervisor_id', supervisor.supervisor_id).eq('assignment_status', 'active'),
        supabase.from('attendance').select('*', { count: 'exact', head: true }).eq('verification_status', 'pending'),
        supabase.from('evaluations').select('*', { count: 'exact', head: true }).eq('supervisor_id', supervisor.supervisor_id),
      ]);

      stats = {
        supervisor,
        assignedStudents: assignedStudents || 0,
        pendingAttendance: pendingAttendance || 0,
        completedEvaluations: completedEvaluations || 0,
      };
    }
  }

  // Fetch Latest Broadcast Announcements
  const { data: latestAnnouncements } = await supabase
    .from('announcements')
    .select('announcement_id, title, content, target_department, created_at')
    .order('created_at', { ascending: false })
    .limit(3);

  const firstName = user.full_name.split(' ')[0];
  const today = new Date().toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const primaryAction = user.role === 'Coordinator'
    ? { href: '/coordinator/approvals', label: 'Review approvals' }
    : { href: '/supervisor/attendance', label: 'Verify attendance logs' };

  // One strip of numbers per role; each number links to the page that acts on it.
  const metrics = user.role === 'Coordinator'
    ? [
        { href: '/coordinator/approvals', label: 'Pending approvals', value: stats.pendingApprovals, note: 'Registrations waiting', alert: stats.pendingApprovals > 0 ? 'amber' : '' },
        { href: '/coordinator/students', label: 'Active trainees', value: stats.activeStudents, note: 'Deployed across HTEs', alert: '' },
        { href: '/coordinator/companies', label: 'Partner companies', value: stats.totalCompanies, note: 'Active establishments', alert: '' },
        { href: '/coordinator/progress', label: 'Behind on hours', value: stats.atRiskCount, note: 'Under 100 hrs rendered', alert: stats.atRiskCount > 0 ? 'red' : '' },
      ]
    : [
        { href: '/supervisor/students', label: 'Assigned interns', value: stats.assignedStudents ?? 0, note: 'Active under your supervision', alert: '' },
        { href: '/supervisor/attendance', label: 'Logs to verify', value: stats.pendingAttendance ?? 0, note: 'Awaiting your review', alert: (stats.pendingAttendance ?? 0) > 0 ? 'amber' : '' },
        { href: '/supervisor/evaluations', label: 'Evaluations filed', value: stats.completedEvaluations ?? 0, note: 'Open to rate or revise', alert: '' },
      ];

  const attention = (user.role === 'Coordinator'
    ? [
        { href: '/coordinator/approvals', text: `${stats.pendingApprovals} student ${stats.pendingApprovals === 1 ? 'registration is' : 'registrations are'} waiting for approval`, n: stats.pendingApprovals },
        { href: '/coordinator/progress', text: `${stats.atRiskCount} ${stats.atRiskCount === 1 ? 'trainee has' : 'trainees have'} rendered under 100 hours`, n: stats.atRiskCount },
      ]
    : [
        { href: '/supervisor/attendance', text: `${stats.pendingAttendance ?? 0} attendance ${(stats.pendingAttendance ?? 0) === 1 ? 'log needs' : 'logs need'} your verification`, n: stats.pendingAttendance ?? 0 },
      ]
  ).filter((a) => a.n > 0);

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto page-fade-in">
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--cdm-gold)]">{today}</p>
          <h1 className="mt-1 text-2xl sm:text-3xl font-black font-serif text-slate-900 dark:text-white truncate">Welcome back, {firstName}</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{departmentSubtitle}</p>
        </div>
        <Link
          href={primaryAction.href}
          className="inline-flex items-center justify-center gap-2 self-start sm:self-auto rounded-lg bg-[var(--cdm-green)] px-4 py-2.5 text-sm font-bold text-white shadow-xs transition-[background-color,transform] hover:bg-[var(--cdm-green-light)] active:translate-y-px focus-visible:outline-2 focus-visible:outline-[var(--cdm-green)]"
        >
          {primaryAction.label} <ArrowRight className="w-4 h-4" />
        </Link>
      </header>

      <section aria-label="Key figures" className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs overflow-hidden">
        <div className={`grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 divide-slate-200/80 dark:divide-slate-800 ${metrics.length === 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-3'}`}>
          {metrics.map((m, i) => (
            <Link
              key={m.label}
              href={m.href}
              className={`group block px-5 py-5 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--cdm-green)] ${i > 0 ? 'lg:border-l border-slate-200/80 dark:border-slate-800' : ''} ${i % 2 === 1 ? 'sm:border-l' : ''} ${i > 1 ? 'sm:border-t lg:border-t-0 border-slate-200/80 dark:border-slate-800' : ''}`}
            >
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">{m.label}</p>
              <p className={`mt-1.5 text-4xl font-bold tabular-nums leading-none ${m.alert === 'red' ? 'text-red-600 dark:text-red-400' : m.alert === 'amber' ? 'text-amber-600 dark:text-amber-400' : 'text-slate-900 dark:text-white'}`}>{m.value}</p>
              <p className="mt-2 flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 group-hover:text-[var(--cdm-green)] dark:group-hover:text-emerald-400">
                {m.note} <ArrowRight className="w-3 h-3 opacity-0 -translate-x-1 transition-[opacity,transform] group-hover:opacity-100 group-hover:translate-x-0" />
              </p>
            </Link>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,7fr)_minmax(0,3fr)] gap-5 items-start">
        <section aria-labelledby="needs-attention" className="min-w-0 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs">
          <h2 id="needs-attention" className="px-5 pt-5 text-base font-bold text-slate-900 dark:text-white">Needs your attention</h2>
          {attention.length === 0 ? (
            <p className="px-5 pb-5 pt-2 text-sm text-slate-500 dark:text-slate-400">Nothing is waiting on you right now.</p>
          ) : (
            <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-800 border-t border-slate-100 dark:border-slate-800">
              {attention.map((a) => (
                <li key={a.href}>
                  <Link href={a.href} className="group flex items-center justify-between gap-4 px-5 py-3.5 text-sm text-slate-700 dark:text-slate-200 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--cdm-green)]">
                    <span>{a.text}</span>
                    <ArrowRight className="w-4 h-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--cdm-green)]" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="min-w-0">
          <CampusBulletin announcements={latestAnnouncements || []} />
        </div>
      </div>

      {user.role === 'Coordinator' && (
        <section aria-labelledby="progress-monitoring" className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs overflow-hidden">
          <div className="flex items-start justify-between gap-3 p-5">
            <div>
              <h2 id="progress-monitoring" className="text-base font-bold text-slate-900 dark:text-white">Trainee Progress Monitoring</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Monitor student training hours and deployment progress.</p>
            </div>
            <Link href="/coordinator/progress" className="text-xs font-bold text-[#0A3824] dark:text-emerald-400 hover:underline shrink-0 inline-flex items-center gap-1">
              View All Students <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="overflow-x-auto border-t border-slate-100 dark:border-slate-800">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-slate-50/80 dark:bg-slate-800/60 text-xs font-semibold text-slate-600 dark:text-slate-400">
                <tr>
                  <th scope="col" className="py-3 px-5">Student</th>
                  <th scope="col" className="py-3 px-4">Program</th>
                  <th scope="col" className="py-3 px-4">Company</th>
                  <th scope="col" className="py-3 px-4">Rendered / Required</th>
                  <th scope="col" className="py-3 px-4 w-44">Progress</th>
                  <th scope="col" className="py-3 px-5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {progressError ? (
                  <tr><td colSpan={6} role="alert" className="py-8 text-center text-sm text-red-700">{progressError}</td></tr>
                ) : progressRows.length === 0 ? (
                  <tr><td colSpan={6} className="py-8 text-center text-sm text-slate-500">No trainee progress records yet.</td></tr>
                ) : progressRows.map((s) => {
                  const done = s.progress_status === 'completed';
                  return (
                    <tr key={s.student_id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                      <td className="py-3 px-5">
                        <div className="font-semibold text-slate-900 dark:text-white">{s.full_name}</div>
                        <div className="text-xs text-slate-500 font-mono">{s.student_number}</div>
                      </td>
                      <td className="py-3 px-4 text-xs font-semibold text-slate-700 dark:text-slate-300">{s.course}</td>
                      <td className="py-3 px-4 text-xs text-slate-700 dark:text-slate-300 max-w-[180px] truncate">{s.company_name || 'Unassigned'}</td>
                      <td className="py-3 px-4 text-xs font-bold text-slate-900 dark:text-white">
                        {s.completed_hours} <span className="font-normal text-slate-500">/ {s.required_hours} hrs</span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <div
                            role="progressbar"
                            aria-label={`${s.full_name} progress`}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-valuenow={Math.min(100, s.percentage)}
                            className="flex-1 bg-slate-100 dark:bg-slate-800 rounded-full h-2 overflow-hidden"
                          >
                            <div className={`h-full rounded-full ${done ? 'bg-emerald-500' : s.percentage >= 75 ? 'bg-[var(--cdm-green)]' : s.percentage >= 25 ? 'bg-amber-500' : 'bg-slate-400'}`} style={{ width: `${Math.min(100, s.percentage)}%` }} />
                          </div>
                          <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 w-10 text-right">{s.percentage}%</span>
                        </div>
                      </td>
                      <td className="py-3 px-5">
                        <span className={`inline-block px-2 py-0.5 rounded-md border text-xs font-semibold ${done ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : s.percentage >= 25 ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                          {done ? 'Completed' : s.percentage >= 75 ? '75%+ complete' : s.percentage >= 25 ? '25–74% complete' : 'Under 25% complete'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
