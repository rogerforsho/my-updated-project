// Pure helpers behind department-scope.ts (no server-only/alias imports so node --test can load it).
// Role/department policy stays in each workflow (ADR 0001 #3); this only types the lookup.
import type { SupabaseClient } from '@supabase/supabase-js';

export type DepartmentScope = { department: 'ICS' | 'IBE' | null; departments: string[]; error: string | null };

// Closed table -> id-column map: a typo in either is a compile error, not a runtime miss.
export type RecordKeys = {
  student_assignments: 'assignment_id';
  evaluations: 'evaluation_id';
  evaluation_appeals: 'appeal_id';
  reports: 'report_id';
};
export type DepartmentRecordTable = keyof RecordKeys;

export async function recordStudentId<T extends DepartmentRecordTable>(client: SupabaseClient, table: T, column: RecordKeys[T], recordId: string): Promise<string | null> {
  const { data, error } = await client.from(table).select('student_id').eq(column as string, recordId).maybeSingle();
  return !error && data ? data.student_id : null;
}

export async function studentInScope(
  client: SupabaseClient, scope: DepartmentScope, targetId: string, column: 'student_id' | 'user_id',
  restrict: (q: any, department: 'ICS' | 'IBE' | null) => any,
) {
  if (scope.error) return false;
  const { data, error } = await restrict(client.from('students').select('student_id').eq(column, targetId), scope.department).maybeSingle();
  return !error && !!data;
}
