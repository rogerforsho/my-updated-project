import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { DEPARTMENT_PROGRAMS } from '@ojt/shared';
import { DEPARTMENT_COURSE_PATTERNS } from '@/src/lib/departments';
import { recordStudentId, studentInScope, type DepartmentRecordTable, type DepartmentScope, type RecordKeys } from '@/src/lib/department-access';

const patterns = DEPARTMENT_COURSE_PATTERNS;

export async function departmentScope(client: SupabaseClient, userId: string, role: string): Promise<DepartmentScope> {
  if (role === 'Student') return { department: null, departments: [], error: null };
  if (role !== 'Coordinator') return { department: null, departments: [], error: 'OJT Coordinator access required.' };
  const { data, error } = await client.from('staff_capability_grants')
    .select('department_scope, program_scope').eq('user_id', userId)
    .eq('capability', 'academic_workflows').is('revoked_at', null);
  const departments = (data ?? []).map(row => row.department_scope);
  // Row-level security already limits every read to these programs; this is for code that uses the service client or builds menus.
  const programs = (data ?? []).some(row => row.program_scope)
    ? (data ?? []).flatMap(row => row.program_scope ?? DEPARTMENT_PROGRAMS[row.department_scope as 'ICS' | 'IBE'])
    : null;
  if (error || !departments.length || departments.some(department => !['ICS', 'IBE'].includes(department))) {
    return { department: null, departments: [], error: 'Your department assignment could not be verified. Contact an administrator.' };
  }
  return { department: departments.length === 1 ? departments[0] as 'ICS' | 'IBE' : null, departments, programs, error: null };
}

export function restrictDepartment<T extends { or(filters: string): T; not(column: string, operator: string, value: string): T }>(query: T, department: 'ICS' | 'IBE' | null): T {
  if (!department) return query;
  query = query.or(patterns[department].map(pattern => `course.ilike.*${pattern}*`).join(','));
  // Match the database's ICS-first classification even for ambiguous legacy data.
  if (department === 'IBE') {
    for (const pattern of patterns.ICS) query = query.not('course', 'ilike', `%${pattern}%`);
  }
  return query;
}

// Pass `scope` when the caller already resolved it, to skip a second staff_capability_grants query.
export async function canManageDepartmentStudent(client: SupabaseClient, actorId: string, role: string, targetId: string, column: 'student_id' | 'user_id' = 'student_id', scope?: DepartmentScope) {
  if (role !== 'Coordinator') return false;
  return studentInScope(client, scope ?? await departmentScope(client, actorId, role), targetId, column, restrictDepartment);
}

export async function canManageDepartmentRecord<T extends DepartmentRecordTable>(client: SupabaseClient, actorId: string, role: string, table: T, column: RecordKeys[T], recordId: string) {
  if (role !== 'Coordinator') return false;
  const studentId = await recordStudentId(client, table, column, recordId);
  return !!studentId && await canManageDepartmentStudent(client, actorId, role, studentId);
}
