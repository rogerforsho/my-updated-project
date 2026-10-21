import { redirect } from 'next/navigation';
import { createClient } from '@/src/lib/supabase/server';
import { getOwnStudentProgress } from '@/src/services/progress';
import { Card, CardHeader, CardTitle, CardContent } from '@/src/components/ui/Card';
import { Badge } from '@/src/components/ui/Badge';
import { CheckCircle2, Clock, Building2, BookOpen, AlertCircle } from '@/src/components/ui/Icons';

export default async function StudentProgressPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/sign-in');

  const { data: progress, error } = await getOwnStudentProgress();

  if (error || !progress) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto space-y-6 page-fade-in">
        <h1 className="text-2xl font-bold text-slate-900">Internship Progress</h1>
        <Card className="border-red-200 bg-red-50/50">
          <CardContent className="p-6 flex items-center gap-3 text-red-700">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <p className="text-sm font-medium">{error?.message || 'Unable to load progress data at this time.'}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isCompleted = progress.progress_status === 'completed';

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto space-y-6 page-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Internship Progress</h1>
        <p className="text-sm text-slate-500 mt-1">Track your total rendered hours, milestones, and graduation readiness.</p>
      </div>

      {/* Hero Progress Banner */}
      <Card className="border border-teal-100 bg-gradient-to-br from-teal-900 via-teal-800 to-slate-900 text-white shadow-md overflow-hidden relative">
        <div className="absolute right-0 top-0 w-96 h-96 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />
        <CardContent className="p-8 relative z-10">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge className={isCompleted ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' : 'bg-teal-500/20 text-teal-300 border-teal-500/30'}>
                  {isCompleted ? 'Internship Completed' : 'In Progress'}
                </Badge>
                <span className="text-xs text-teal-200/80">• 4th Year {progress.course}</span>
              </div>
              <h2 className="text-3xl font-extrabold tracking-tight">{progress.completed_hours} <span className="text-xl font-normal text-teal-200">/ {progress.required_hours} Hours</span></h2>
              <p className="text-sm text-teal-100/80">
                {isCompleted 
                  ? 'Congratulations! You have satisfied all required on-the-job training hours.' 
                  : `You have ${progress.remaining_hours} hours remaining to complete your program requirements.`}
              </p>
            </div>

            <div className="flex flex-col items-center md:items-end justify-center">
              <div className="text-4xl font-black tracking-tight text-teal-300">{progress.percentage}%</div>
              <span className="text-xs text-teal-200/70 uppercase font-semibold mt-0.5 tracking-wider">Completed</span>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="mt-8">
            <div className="w-full bg-slate-800/80 rounded-full h-3.5 p-0.5 overflow-hidden border border-teal-500/20">
              <div 
                className={`h-full rounded-full transition-all duration-500 ${isCompleted ? 'bg-emerald-400' : 'bg-gradient-to-r from-teal-400 to-emerald-400'}`}
                style={{ width: `${progress.percentage}%` }}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Metrics Breakdown Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <Card className="border-slate-200/80 shadow-sm hover:border-slate-300 transition-all">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center flex-shrink-0">
              <Clock className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Rendered Hours</p>
              <h3 className="text-2xl font-bold text-slate-900 mt-0.5">{progress.completed_hours} hrs</h3>
              <p className="text-xs text-slate-400 mt-0.5">{progress.verified_sessions_count} verified sessions</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200/80 shadow-sm hover:border-slate-300 transition-all">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center flex-shrink-0">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Remaining Hours</p>
              <h3 className="text-2xl font-bold text-slate-900 mt-0.5">{progress.remaining_hours} hrs</h3>
              <p className="text-xs text-slate-400 mt-0.5">Target: {progress.required_hours} hrs</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200/80 shadow-sm hover:border-slate-300 transition-all">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0">
              <Building2 className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Host Company</p>
              <h3 className="text-base font-bold text-slate-900 mt-0.5 line-clamp-1">{progress.company_name}</h3>
              <p className="text-xs text-slate-400 mt-0.5">Active Assignment</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Trainee Details Card */}
      <Card className="border-slate-200/80 shadow-sm">
        <CardHeader className="border-b border-slate-100 py-4 px-6">
          <CardTitle className="text-base font-semibold text-slate-900 flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-teal-600" /> Academic & Program Profile
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <dl className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
            <div>
              <dt className="text-xs font-medium text-slate-400 uppercase tracking-wider">Student Name</dt>
              <dd className="text-sm font-semibold text-slate-800 mt-1">{progress.full_name}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-400 uppercase tracking-wider">Student Number</dt>
              <dd className="text-sm font-semibold text-slate-800 mt-1">{progress.student_number}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-400 uppercase tracking-wider">Course & Year</dt>
              <dd className="text-sm font-semibold text-slate-800 mt-1">{progress.course} — Year {progress.year_level}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-400 uppercase tracking-wider">Institution</dt>
              <dd className="text-sm font-semibold text-slate-800 mt-1">Colegio de Montalban</dd>
            </div>
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
