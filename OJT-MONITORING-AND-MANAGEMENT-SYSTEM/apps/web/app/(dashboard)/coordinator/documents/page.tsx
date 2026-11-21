import { redirect } from 'next/navigation';
import CoordinatorDocuments, { type DocumentStudent, type SentDocument } from '@/src/components/documents/CoordinatorDocuments';
import { getTrustedActor } from '@/src/lib/trusted-actor';
import { departmentScope, restrictDepartment } from '@/src/lib/department-scope';

export default async function CoordinatorDocumentsPage() {
  const { supabase, user, profile } = await getTrustedActor();
  if (!user || profile?.role !== 'Coordinator') redirect('/dashboard?reason=unauthorized');
  const scope = await departmentScope(supabase, user.id, 'Coordinator');
  if (scope.error || !scope.departments.length) redirect('/dashboard?reason=unauthorized');

  const students: DocumentStudent[] = [];
  for (const department of scope.departments as ('ICS' | 'IBE')[]) {
    const { data } = await restrictDepartment(
      supabase.from('students').select('user_id, student_number, course, users!inner ( full_name, account_status )')
        .eq('users.account_status', 'active'), department).limit(1000);
    for (const row of (data ?? []) as unknown as { user_id: string; student_number: string; users: { full_name: string } }[]) {
      students.push({ user_id: row.user_id, name: row.users.full_name, student_number: row.student_number, department });
    }
  }
  students.sort((a, b) => a.name.localeCompare(b.name));

  const { data: docs } = await supabase.from('coordinator_documents')
    .select('document_id, department, title, file_name, created_at, coordinator_document_recipients ( count )')
    .order('created_at', { ascending: false }).limit(50);
  const documents: SentDocument[] = ((docs ?? []) as unknown as (Omit<SentDocument, 'recipient_count'> & { coordinator_document_recipients: { count: number }[] })[])
    .map(({ coordinator_document_recipients, ...rest }) => ({ ...rest, recipient_count: coordinator_document_recipients?.[0]?.count ?? 0 }));

  return <CoordinatorDocuments departments={scope.departments} students={students} documents={documents} />;
}
