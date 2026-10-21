import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getAuthUser } from '@/src/services/auth';
import { createClient } from '@/src/lib/supabase/server';
import SettingsClient from './SettingsClient';
import { departmentScope } from '@/src/lib/department-scope';

export const metadata: Metadata = {
  title: 'Account Settings',
};

export default async function SettingsPage() {
  const user = await getAuthUser();
  if (!user) redirect('/auth/sign-in');

  const supabase = await createClient();

  const extraDetails: {
    course?: string;
    studentNumber?: string;
    employeeNumber?: string;
    department?: string;
    companyName?: string;
  } = {
    employeeNumber: (user as any).employee_number || undefined,
  };

  if (user.role === 'Student') {
    const { data: student } = await supabase
      .from('students')
      .select('course, student_number')
      .eq('user_id', user.user_id)
      .maybeSingle();

    if (student) {
      extraDetails.course = student.course || undefined;
      extraDetails.studentNumber = student.student_number || undefined;
    }
  } else if (user.role === 'Coordinator') {
    const scope = await departmentScope(supabase, user.user_id, user.role);
    extraDetails.department = scope.departments.join(' / ') || undefined;
  } else if (user.role === 'Supervisor') {
    const { data: supervisor } = await supabase
      .from('supervisors')
      .select('companies(company_name)')
      .eq('user_id', user.user_id)
      .maybeSingle();
    extraDetails.companyName = (supervisor?.companies as any)?.company_name || 'Industry Partner';
  }

  return <SettingsClient user={user} extraDetails={extraDetails} />;
}
