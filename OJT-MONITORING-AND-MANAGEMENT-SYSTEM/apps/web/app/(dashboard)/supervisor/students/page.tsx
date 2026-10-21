import { redirect } from 'next/navigation';
import { createClient } from '@/src/lib/supabase/server';
import { listAssignedStudents } from '@/src/services/evaluations';
import { Card, CardHeader, CardTitle, CardContent } from '@/src/components/ui/Card';
import { Badge } from '@/src/components/ui/Badge';
import { Button } from '@/src/components/ui/Button';
import { Users } from '@/src/components/ui/Icons';
import Link from 'next/link';

interface Trainee {
  student_id: string;
  full_name: string;
  student_number: string;
  course: string;
}

export default async function SupervisorStudentsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/sign-in');

  const { data: students } = await listAssignedStudents();
  const traineeList: Trainee[] = (students ?? []) as Trainee[];

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-5xl mx-auto page-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Assigned Trainees</h1>
          <p className="text-sm text-slate-500 mt-1">Manage attendance, verify daily selfies, and conduct performance evaluations for your trainees.</p>
        </div>
        <Badge variant="outline" className="px-3 py-1 text-sm font-medium">
          {traineeList.length} Active Trainees
        </Badge>
      </div>

      {traineeList.length === 0 ? (
        <Card className="border-dashed border-slate-200 bg-slate-50/50">
          <CardContent className="p-12 text-center text-slate-400">
            <Users className="w-10 h-10 mx-auto text-slate-300 mb-3" />
            <h3 className="text-base font-semibold text-slate-700">No Assigned Trainees Yet</h3>
            <p className="text-sm text-slate-400 mt-1 max-w-md mx-auto">
              Your OJT Coordinator will assign student interns to your company supervisor profile once pre-deployment requirements are verified.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {traineeList.map((t) => (
            <Card key={t.student_id} className="border-slate-200/90 shadow-sm hover:shadow-md transition-all">
              <CardHeader className="p-5 pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-base font-bold text-slate-900">{t.full_name}</CardTitle>
                    <p className="text-xs text-slate-400 mt-0.5">{t.student_number}</p>
                  </div>
                  <Badge className="bg-teal-50 text-teal-700 border-teal-200 text-xs">
                    {t.course}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="p-5 pt-0 space-y-4">
                <div className="grid grid-cols-2 gap-3 py-3 border-y border-slate-100 text-xs">
                  <div>
                    <span className="text-slate-400 block font-medium">Institution</span>
                    <span className="text-slate-700 font-semibold mt-0.5 block">Colegio de Montalban</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block font-medium">Year Level</span>
                    <span className="text-slate-700 font-semibold mt-0.5 block">4th Year Intern</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <Link href="/supervisor/attendance" className="flex-1">
                    <Button variant="outline" size="sm" className="w-full text-xs text-slate-700">
                      Verify Attendance
                    </Button>
                  </Link>
                  <Link href="/supervisor/evaluations" className="flex-1">
                    <Button size="sm" className="w-full text-xs bg-teal-700 hover:bg-teal-800 text-white">
                      Evaluate Trainee
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
