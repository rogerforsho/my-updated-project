'use server';

import { createClient } from '@/src/lib/supabase/server';
import { recordAuditEvent } from '@/src/lib/audit';
import type { AppResult } from '@ojt/shared';

export interface IncidentReportRow {
  incident_id: string;
  category: string;
  description: string;
  status: 'submitted' | 'acknowledged' | 'closed';
  coordinator_response: string | null;
  created_at: string;
  reviewed_at: string | null;
  student_name: string;
  student_number: string;
  course: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function coordinatorClient() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, allowed: false };
  const { data: profile } = await supabase.from('users').select('role, account_status').eq('user_id', user.id).maybeSingle();
  const { data: grant } = await supabase.from('staff_capability_grants').select('user_id')
    .eq('user_id', user.id).eq('capability', 'academic_workflows').is('revoked_at', null).limit(1).maybeSingle();
  return { supabase, user, allowed: profile?.role === 'Coordinator' && profile.account_status === 'active' && Boolean(grant) };
}

/** Reads with the Coordinator's session: RLS limits rows to students in the granted departments. */
export async function listIncidentReports(filter: 'open' | 'all' = 'open'): Promise<AppResult<IncidentReportRow[]>> {
  const { supabase, allowed } = await coordinatorClient();
  if (!allowed) return { data: null, error: { code: 'FORBIDDEN', message: 'Access denied.' } };
  let query = supabase.from('incident_reports')
    .select('incident_id, category, description, status, coordinator_response, created_at, reviewed_at, students(student_number, course, users(full_name))')
    .order('created_at', { ascending: false }).limit(200);
  if (filter === 'open') query = query.neq('status', 'closed');
  const { data, error } = await query;
  if (error) return { data: null, error: { code: 'SERVER_FAILURE', message: 'Could not load incident reports.' } };
  const one = <T,>(value: T | T[] | null | undefined) => (Array.isArray(value) ? value[0] : value) ?? null;
  return {
    data: (data ?? []).map((row: any) => {
      const student = one(row.students) as { student_number?: string; course?: string; users?: unknown } | null;
      const user = one(student?.users as { full_name?: string } | { full_name?: string }[] | null);
      return {
        incident_id: row.incident_id, category: row.category, description: row.description, status: row.status,
        coordinator_response: row.coordinator_response, created_at: row.created_at, reviewed_at: row.reviewed_at,
        student_name: user?.full_name ?? '', student_number: student?.student_number ?? '', course: student?.course ?? '',
      };
    }),
    error: null,
  };
}

export async function reviewIncidentReport(input: {
  incident_id: string;
  status: 'acknowledged' | 'closed';
  response?: string;
}): Promise<AppResult<null>> {
  const { supabase, user, allowed } = await coordinatorClient();
  if (!allowed || !user) return { data: null, error: { code: 'FORBIDDEN', message: 'Access denied.' } };
  const response = input.response?.trim() ?? '';
  if (!UUID.test(String(input.incident_id ?? '')) || !['acknowledged', 'closed'].includes(input.status) ||
      response.length > 3000 || (input.status === 'closed' && !response))
    return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'Closing a report requires a response to the student (3000 characters maximum).' } };

  // The guard trigger rejects anything except a forward status change by this Coordinator.
  const { data, error } = await supabase.from('incident_reports')
    .update({ status: input.status, coordinator_response: response || null, reviewed_by: user.id })
    .eq('incident_id', input.incident_id).neq('status', 'closed').select('incident_id');
  if (error || !data?.length)
    return { data: null, error: { code: 'FORBIDDEN', message: 'This report is closed or outside your department.' } };

  await recordAuditEvent({ actor_user_id: user.id, action: `INCIDENT_REPORT_${input.status.toUpperCase()}`, entity_type: 'incident_report', entity_id: input.incident_id });
  return { data: null, error: null };
}
