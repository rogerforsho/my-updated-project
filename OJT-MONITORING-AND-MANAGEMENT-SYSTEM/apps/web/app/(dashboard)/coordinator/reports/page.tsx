import { redirect } from 'next/navigation';
import { createClient } from '@/src/lib/supabase/server';
import { getDepartmentSummary, listCohortProgress } from '@/src/services/progress';
import DepartmentReportsClient from './DepartmentReportsClient';
import { departmentScope } from '@/src/lib/department-scope';

export default async function CoordinatorReportsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/sign-in');

  const { data: profile } = await supabase.from('users')
    .select('role, account_status').eq('user_id', user.id).single();

  if (!profile || profile.role !== 'Coordinator' || profile.account_status !== 'active') {
    redirect('/dashboard');
  }

  const scope = await departmentScope(supabase, user.id, profile.role);
  if (scope.error) {
    throw new Error('Your department assignment could not be verified. Contact an administrator.');
  }
  const userDepartment = scope.department ?? 'ALL';

  const [summaryRes, cohortRes] = await Promise.all([
    getDepartmentSummary(),
    listCohortProgress(1, 200),
  ]);

  if (summaryRes.error || !summaryRes.data || cohortRes.error || !cohortRes.data) {
    throw new Error('Unable to load the department report. Please retry.');
  }
  const summary = summaryRes.data;
  // The report and its export must cover the complete authorized cohort.
  const initialStudents = [...cohortRes.data.students];
  for (let page = 2; initialStudents.length < cohortRes.data.total; page++) {
    const result = await listCohortProgress(page, 200);
    if (result.error || !result.data?.students.length) {
      throw new Error('The cohort changed or could not be fully loaded. Please reload the report.');
    }
    initialStudents.push(...result.data.students);
  }

  return (
    <DepartmentReportsClient
      summary={summary}
      initialStudents={initialStudents}
      userDepartment={userDepartment}
    />
  );
}

