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
} from '@/src/components/ui/Icons';

export default async function DashboardPage() {
  const user = await getAuthUser();
  if (!user) redirect('/auth/sign-in');
  if (user.role === 'Admin') redirect('/admin');

  const supabase = await createClient();

  // Role-specific stats query
  let stats: any = {};
  let departmentSubtitle = 'Colegio de Montalban';

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
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto page-fade-in">
      {/* Streamlined Executive Welcome Card */}
      <div className="rounded-2xl bg-[#092E1D] p-5 sm:p-6 text-white shadow-2xs border border-emerald-950/40 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-emerald-700/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-white/10 p-1.5 border border-amber-400/30 shadow-2xs flex items-center justify-center shrink-0">
              <Image
                src="/logo.png"
                alt="Colegio de Montalban Seal"
                width={40}
                height={40}
                className="w-full h-full object-contain"
                priority
              />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400">
                  Colegio de Montalban
                </span>
                <span className="text-[10px] text-slate-500 font-medium">•</span>
                <span className="text-[10px] text-slate-400 font-medium">
                  {new Date().toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
              </div>
              <h1 className="text-lg sm:text-xl font-black text-white font-serif mt-0.5 tracking-tight">
                Welcome back, {user.full_name}
              </h1>
              <p className="text-xs text-slate-300 mt-0.5 font-normal">
                {departmentSubtitle}
              </p>
            </div>
          </div>

          <div className="flex flex-row sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-300 bg-emerald-950/80 border border-emerald-500/30 px-3 py-1 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Portal Online
            </span>
            {user.role === 'Coordinator' && (
              <Link
                href="/coordinator/approvals"
                className="text-xs font-bold text-amber-400 hover:text-amber-300 hover:underline flex items-center gap-1 transition-colors"
              >
                Review Approvals <ArrowRight className="w-3 h-3" />
              </Link>
            )}
            {user.role === 'Supervisor' && (
              <Link
                href="/supervisor/attendance"
                className="text-xs font-bold text-amber-400 hover:text-amber-300 hover:underline flex items-center gap-1 transition-colors"
              >
                Verify Logs <ArrowRight className="w-3 h-3" />
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Hero: Role-Specific Primary Metric Cards - Standardized Height & Micro-interactions */}
      {user.role === 'Coordinator' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
          <div className="group h-full min-h-[104px] p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs hover:shadow-md hover:border-slate-300 dark:hover:border-slate-700 transition-all duration-200 hover:-translate-y-0.5 flex items-center gap-3.5 cursor-default">
            <div className="w-11 h-11 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200/90 dark:border-slate-700 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 transition-transform duration-200 group-hover:scale-105">
              <UserCheck className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0 flex flex-col justify-center">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Pending Registrations</p>
              <h3 className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-0.5 leading-tight">{stats.pendingApprovals}</h3>
              <Link href="/coordinator/approvals" className="text-xs text-[#0A3824] dark:text-emerald-400 font-bold hover:underline truncate">
                Review queue →
              </Link>
            </div>
          </div>

          <div className="group h-full min-h-[104px] p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs hover:shadow-md hover:border-slate-300 dark:hover:border-slate-700 transition-all duration-200 hover:-translate-y-0.5 flex items-center gap-3.5 cursor-default">
            <div className="w-11 h-11 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200/90 dark:border-slate-700 text-[#0A3824] dark:text-emerald-400 flex items-center justify-center shrink-0 transition-transform duration-200 group-hover:scale-105">
              <Users className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0 flex flex-col justify-center">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Active Trainees</p>
              <h3 className="text-2xl font-bold text-slate-900 dark:text-white mt-0.5 leading-tight">{stats.activeStudents}</h3>
              <p className="text-xs text-slate-400 mt-0.5 truncate">Deployed across HTEs</p>
            </div>
          </div>

          <div className="group h-full min-h-[104px] p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs hover:shadow-md hover:border-slate-300 dark:hover:border-slate-700 transition-all duration-200 hover:-translate-y-0.5 flex items-center gap-3.5 cursor-default">
            <div className="w-11 h-11 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200/90 dark:border-slate-700 text-[#0A3824] dark:text-emerald-400 flex items-center justify-center shrink-0 transition-transform duration-200 group-hover:scale-105">
              <Building2 className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0 flex flex-col justify-center">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Partner Companies</p>
              <h3 className="text-2xl font-bold text-slate-900 dark:text-white mt-0.5 leading-tight">{stats.totalCompanies}</h3>
              <p className="text-xs text-slate-400 mt-0.5 truncate">MoA Active Establishments</p>
            </div>
          </div>

          <div className="group h-full min-h-[104px] p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs hover:shadow-md hover:border-slate-300 dark:hover:border-slate-700 transition-all duration-200 hover:-translate-y-0.5 flex items-center gap-3.5 cursor-default">
            <div className="w-11 h-11 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200/90 dark:border-slate-700 text-red-600 dark:text-red-400 flex items-center justify-center shrink-0 transition-transform duration-200 group-hover:scale-105">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0 flex flex-col justify-center">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Low Progress Alert</p>
              <h3 className="text-2xl font-bold text-red-600 dark:text-red-400 mt-0.5 leading-tight">{stats.atRiskCount}</h3>
              <p className="text-xs text-slate-400 mt-0.5 truncate">&lt; 100 hrs rendered</p>
            </div>
          </div>
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
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Left / Primary Operations Hub (2 Columns on Large Screens) */}
        <div className="lg:col-span-2 space-y-5">
          {user.role === 'Coordinator' && (
            <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">OJT Coordinator Actions</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Direct shortcuts to verification queues and student rosters</p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                <Link
                  href="/coordinator/approvals"
                  className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 hover:bg-amber-50/50 dark:hover:bg-amber-950/30 border border-slate-200/80 dark:border-slate-800 hover:border-amber-500/30 transition-all flex flex-col gap-2 group"
                >
                  <div className="w-8 h-8 rounded-lg bg-amber-700 text-white flex items-center justify-center">
                    <UserCheck className="w-4 h-4" />
                  </div>
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-100 group-hover:text-amber-600 dark:group-hover:text-amber-400">Pending Registrations</span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400">{stats.pendingApprovals} trainees awaiting review</span>
                </Link>

                <Link
                  href="/coordinator/students"
                  className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 hover:bg-emerald-50/50 dark:hover:bg-emerald-950/30 border border-slate-200/80 dark:border-slate-800 hover:border-emerald-500/30 transition-all flex flex-col gap-2 group"
                >
                  <div className="w-8 h-8 rounded-lg bg-[#0A3824] text-[var(--cdm-sand)] flex items-center justify-center">
                    <Users className="w-4 h-4" />
                  </div>
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-100 group-hover:text-[#0A3824] dark:group-hover:text-emerald-400">Trainee Directory</span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400">View active student placements</span>
                </Link>

                <Link
                  href="/coordinator/submissions"
                  className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 hover:bg-emerald-50/50 dark:hover:bg-emerald-950/30 border border-slate-200/80 dark:border-slate-800 hover:border-emerald-500/30 transition-all flex flex-col gap-2 group"
                >
                  <div className="w-8 h-8 rounded-lg bg-[#0A3824] text-[var(--cdm-sand)] flex items-center justify-center">
                    <ClipboardCheck className="w-4 h-4" />
                  </div>
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-100 group-hover:text-[#0A3824] dark:group-hover:text-emerald-400">Review Submissions</span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400">Grade DTRs & requirement files</span>
                </Link>
              </div>
            </div>
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
        <div className="lg:col-span-1">
          <CampusBulletin announcements={latestAnnouncements || []} />
        </div>
      </div>
    </div>
  );
}
