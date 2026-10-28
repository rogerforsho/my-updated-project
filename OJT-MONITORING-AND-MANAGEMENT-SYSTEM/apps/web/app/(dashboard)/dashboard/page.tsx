import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import CampusBulletin from '@/src/components/dashboard/CampusBulletin';
import { redirect } from 'next/navigation';

export const metadata: Metadata = {
  title: 'Practicum Dashboard',
};
import { getAuthUser } from '@/src/services/auth';
import { createClient } from '@/src/lib/supabase/server';
import { listCohortProgress, type StudentProgressDetail } from '@/src/services/progress';
import {
  Timer,
  Building2,
  UserCheck,
  Users,
  AlertTriangle,
  Star,
  ArrowRight,
  Clock,
  ClipboardCheck,
  Building,
  TrendingUp,
} from '@/src/components/ui/Icons';

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

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-5 max-w-7xl mx-auto page-fade-in">
      {/* Compact welcome banner */}
      <div className="rounded-2xl bg-[#092E1D] px-4 py-3.5 sm:px-5 text-white shadow-2xs border border-emerald-950/40">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-xl bg-white/10 p-1.5 border border-amber-400/30 flex items-center justify-center shrink-0">
              <Image
                src="/logo.png"
                alt="Colegio de Montalban Seal"
                width={40}
                height={40}
                className="w-full h-full object-contain"
                priority
              />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-amber-400">
                Colegio de Montalban <span className="text-slate-500 font-medium">•</span>{' '}
                <span className="text-slate-300 font-medium">
                  {new Date().toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
              </p>
              <h1 className="text-lg sm:text-xl font-black text-white font-serif tracking-tight truncate">
                Welcome back, {user.full_name}
              </h1>
              <p className="text-xs text-slate-300">{departmentSubtitle}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-300 bg-emerald-950/80 border border-emerald-500/30 px-2.5 py-1 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              Portal Online
            </span>
            {user.role === 'Coordinator' && (
              <Link
                href="/coordinator/approvals"
                className="inline-flex items-center gap-1.5 text-xs font-bold text-white bg-white/10 hover:bg-white/20 border border-white/25 px-3 py-1.5 rounded-lg transition-colors focus-visible:outline-2 focus-visible:outline-amber-400"
              >
                Review Approvals <ArrowRight className="w-3 h-3" />
              </Link>
            )}
            {user.role === 'Supervisor' && (
              <Link
                href="/supervisor/attendance"
                className="inline-flex items-center gap-1.5 text-xs font-bold text-white bg-white/10 hover:bg-white/20 border border-white/25 px-3 py-1.5 rounded-lg transition-colors focus-visible:outline-2 focus-visible:outline-amber-400"
              >
                Verify Logs <ArrowRight className="w-3 h-3" />
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Hero: Role-Specific Primary Metric Cards - Standardized Height & Micro-interactions */}
      {user.role === 'Coordinator' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { href: '/coordinator/approvals', label: 'Pending Registrations', value: stats.pendingApprovals, note: 'Review queue →', Icon: UserCheck, tone: 'text-amber-600 dark:text-amber-400', alert: stats.pendingApprovals > 0 },
            { href: '/coordinator/students', label: 'Active Trainees', value: stats.activeStudents, note: 'Deployed across HTEs', Icon: Users, tone: 'text-slate-900 dark:text-white', alert: false },
            { href: '/coordinator/companies', label: 'Partner Companies', value: stats.totalCompanies, note: 'Active establishments', Icon: Building2, tone: 'text-slate-900 dark:text-white', alert: false },
            { href: '/coordinator/progress', label: 'Low Progress Alert', value: stats.atRiskCount, note: '< 100 hrs rendered', Icon: AlertTriangle, tone: stats.atRiskCount > 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-white', alert: stats.atRiskCount > 0 },
          ].map(({ href, label, value, note, Icon, tone, alert }) => (
            <Link
              key={label}
              href={href}
              className="group h-full min-h-[96px] p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs hover:shadow-md hover:border-slate-300 dark:hover:border-slate-700 transition-shadow flex items-center gap-3.5 focus-visible:outline-2 focus-visible:outline-[#0A3824]"
            >
              <div className={`w-11 h-11 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200/90 dark:border-slate-700 flex items-center justify-center shrink-0 ${alert ? tone : 'text-[#0A3824] dark:text-emerald-400'}`}>
                <Icon className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{label}</p>
                <p className={`text-2xl font-bold leading-tight ${tone}`}>{value}</p>
                <p className="text-xs text-slate-500 truncate group-hover:text-[#0A3824] dark:group-hover:text-emerald-400">{note}</p>
              </div>
            </Link>
          ))}
        </div>
      )}

      {user.role === 'Supervisor' && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-5">
          <div className="group h-full min-h-[104px] p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs hover:shadow-md hover:border-slate-300 dark:hover:border-slate-700 transition-all duration-200 hover:-translate-y-0.5 flex items-center gap-3.5 cursor-default">
            <div className="w-11 h-11 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200/90 dark:border-slate-700 text-[#0A3824] dark:text-emerald-400 flex items-center justify-center shrink-0 transition-transform duration-200 group-hover:scale-105">
              <Users className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0 flex flex-col justify-center">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Assigned Interns</p>
              <h3 className="text-2xl font-bold text-slate-900 dark:text-white mt-0.5 leading-tight">{stats.assignedStudents}</h3>
              <p className="text-xs text-slate-400 mt-0.5 truncate">Active under your supervision</p>
            </div>
          </div>

          <div className="group h-full min-h-[104px] p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs hover:shadow-md hover:border-slate-300 dark:hover:border-slate-700 transition-all duration-200 hover:-translate-y-0.5 flex items-center gap-3.5 cursor-default">
            <div className="w-11 h-11 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200/90 dark:border-slate-700 text-[#0A3824] dark:text-emerald-400 flex items-center justify-center shrink-0 transition-transform duration-200 group-hover:scale-105">
              <Timer className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0 flex flex-col justify-center">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Pending Attendance</p>
              <h3 className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-0.5 leading-tight">{stats.pendingAttendance}</h3>
              <Link href="/supervisor/attendance" className="text-xs text-[#0A3824] dark:text-emerald-400 font-bold hover:underline truncate">
                Verify logs →
              </Link>
            </div>
          </div>

          <div className="group h-full min-h-[104px] p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs hover:shadow-md hover:border-slate-300 dark:hover:border-slate-700 transition-all duration-200 hover:-translate-y-0.5 flex items-center gap-3.5 cursor-default">
            <div className="w-11 h-11 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200/90 dark:border-slate-700 text-[#0A3824] dark:text-emerald-400 flex items-center justify-center shrink-0 transition-transform duration-200 group-hover:scale-105">
              <Star className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0 flex flex-col justify-center">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Evaluations</p>
              <h3 className="text-2xl font-bold text-slate-900 dark:text-white mt-0.5 leading-tight">{stats.completedEvaluations}</h3>
              <Link href="/supervisor/evaluations" className="text-xs text-[#0A3824] dark:text-emerald-400 font-bold hover:underline truncate">
                Rate students →
              </Link>
            </div>
          </div>
        </div>
      )}



      {/* Balanced 2-Column Lower Section: Quick Operations + Campus Bulletin Board */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,7fr)_minmax(0,3fr)] gap-5 items-start">
        {/* Left / Primary Operations Hub (2 Columns on Large Screens) */}
        <div className="space-y-5 min-w-0">
          {user.role === 'Coordinator' && (
            <section aria-labelledby="priority-actions" className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs">
              <h2 id="priority-actions" className="text-base font-bold text-slate-900 dark:text-white">Priority Actions</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 mb-4">Quick access to essential OJT coordination tasks.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  { href: '/coordinator/approvals', Icon: ClipboardCheck, title: 'Review Approvals', text: 'Review pending student registrations and verification requests.' },
                  { href: '/coordinator/students', Icon: Users, title: 'Manage Students', text: 'View trainee profiles, assignments, and OJT records.' },
                  { href: '/coordinator/company-requests', Icon: Building, title: 'HTE Requests', text: 'Review host training establishment requests.' },
                  { href: '/coordinator/progress', Icon: TrendingUp, title: 'Monitor Progress', text: 'Track rendered hours and identify trainees requiring attention.' },
                ].map(({ href, Icon, title, text }) => (
                  <Link
                    key={href}
                    href={href}
                    className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 hover:bg-emerald-50/60 dark:hover:bg-emerald-950/30 border border-slate-200/80 dark:border-slate-800 hover:border-emerald-500/30 transition-colors flex items-start gap-3 focus-visible:outline-2 focus-visible:outline-[#0A3824]"
                  >
                    <span className="w-9 h-9 rounded-lg bg-[#0A3824] text-[var(--cdm-sand)] flex items-center justify-center shrink-0">
                      <Icon className="w-4 h-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-bold text-slate-800 dark:text-slate-100">{title}</span>
                      <span className="block text-xs text-slate-500 dark:text-slate-400 mt-0.5">{text}</span>
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          )}


          {user.role === 'Supervisor' && (
            <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">Industry Supervisor Workspace</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Daily trainee verification and performance evaluations</p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <Link
                  href="/supervisor/attendance"
                  className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 hover:bg-emerald-50/50 dark:hover:bg-emerald-950/30 border border-slate-200/80 dark:border-slate-800 hover:border-emerald-500/30 transition-all flex items-center gap-3.5 group"
                >
                  <div className="w-10 h-10 rounded-xl bg-[#0A3824] text-[var(--cdm-sand)] flex items-center justify-center shrink-0">
                    <Clock className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100 group-hover:text-[#0A3824] dark:group-hover:text-emerald-400">Verify Attendance Logs</h4>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">Review intern time-in and selfie captures</p>
                  </div>
                </Link>

                <Link
                  href="/supervisor/evaluations"
                  className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 hover:bg-emerald-50/50 dark:hover:bg-emerald-950/30 border border-slate-200/80 dark:border-slate-800 hover:border-emerald-500/30 transition-all flex items-center gap-3.5 group"
                >
                  <div className="w-10 h-10 rounded-xl bg-[#0A3824] text-[var(--cdm-sand)] flex items-center justify-center shrink-0">
                    <Star className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100 group-hover:text-[#0A3824] dark:group-hover:text-emerald-400">Performance Evaluations</h4>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">Grade trainees based on standard rubrics</p>
                  </div>
                </Link>
              </div>
            </div>
          )}

        </div>

        {/* Right / Secondary Column: Interactive Campus Bulletin Board Widget */}
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
