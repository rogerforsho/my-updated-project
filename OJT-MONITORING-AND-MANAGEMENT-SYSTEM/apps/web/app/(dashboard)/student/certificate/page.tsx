import { redirect } from 'next/navigation';
import { createClient } from '@/src/lib/supabase/server';
import { checkClearanceStatus } from '@/src/services/certificates';
import CertificateClientView from './CertificateClientView';

export default async function StudentCertificatePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/sign-in');

  const { data: student } = await supabase
    .from('students')
    .select('student_id')
    .eq('user_id', user.id)
    .single();

  if (!student) redirect('/dashboard');

  const clearance = await checkClearanceStatus(student.student_id);

  return (
    <CertificateClientView clearance={clearance.data} />
  );
}