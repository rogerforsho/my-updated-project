'use server';

import { createClient } from '@/src/lib/supabase/server';
import { getServiceClient } from '@/src/lib/supabase/service';
import { toPublicSupabaseUrl } from '@/src/lib/supabase/public-url';
import type { AppResult, DbCompanyRequest } from '@ojt/shared';

async function coordinatorClient() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, allowed: false };
  const { data: profile } = await supabase.from('users').select('role, account_status').eq('user_id', user.id).maybeSingle();
  const { data: grant } = await supabase.from('staff_capability_grants').select('user_id')
    .eq('user_id', user.id).eq('capability', 'academic_workflows').is('revoked_at', null).maybeSingle();
  return { supabase, user, allowed: profile?.role === 'Coordinator' && profile.account_status === 'active' && Boolean(grant) };
}

export async function listPendingCompanyRequests(): Promise<AppResult<DbCompanyRequest[]>> {
  const { supabase, allowed } = await coordinatorClient();
  if (!allowed) return { data: null, error: { code: 'FORBIDDEN', message: 'Access denied.' } };
  const { data, error } = await supabase.from('company_requests')
    .select('request_id, student_id, requested_company_name, company_address, contact_person, contact_email, contact_number, requested_branch_name, branch_address, business_permit_path, moa_path, status, feedback, company_id, branch_id, created_at')
    .eq('status', 'pending').order('created_at');
  if (error) return { data: null, error: { code: 'SERVER_FAILURE', message: 'Could not load HTE requests.' } };
  return { data: data as DbCompanyRequest[], error: null };
}

export async function decideCompanyRequest(input: {
  request_id: string; decision: 'approve' | 'reject'; feedback?: string;
  latitude?: number; longitude?: number; radius?: number;
}): Promise<AppResult<null>> {
  const { supabase, allowed } = await coordinatorClient();
  if (!allowed) return { data: null, error: { code: 'FORBIDDEN', message: 'Access denied.' } };
  if (!input.request_id || (input.decision === 'reject' && !input.feedback?.trim()) ||
      (input.decision === 'approve' && (!Number.isFinite(input.latitude) || !Number.isFinite(input.longitude) ||
        input.latitude! < -90 || input.latitude! > 90 || input.longitude! < -180 || input.longitude! > 180 ||
        !Number.isInteger(input.radius) || input.radius! < 30 || input.radius! > 50)))
    return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'Provide feedback for rejection or a valid branch location for approval.' } };
  const { data, error } = await supabase.rpc('review_company_request', {
    p_request_id: input.request_id, p_decision: input.decision, p_feedback: input.feedback?.trim() || null,
    p_latitude: input.decision === 'approve' ? input.latitude : null,
    p_longitude: input.decision === 'approve' ? input.longitude : null,
    p_radius: input.decision === 'approve' ? input.radius : 50,
  });
  if (error || data !== 'ok') return { data: null, error: { code: data === 'duplicate_company' ? 'DUPLICATE_REQUEST' : 'SERVER_FAILURE', message: data === 'duplicate_company' ? 'An HTE with this name already exists. Match the request to the existing HTE.' : 'The HTE request decision could not be saved.' } };
  return { data: null, error: null };
}

export async function getCompanyRequestEvidenceUrl(request_id: string, kind: 'business_permit' | 'moa'): Promise<AppResult<string>> {
  const { supabase, allowed } = await coordinatorClient();
  if (!allowed) return { data: null, error: { code: 'FORBIDDEN', message: 'Access denied.' } };
  let path: string | null | undefined;
  let submittedBy: string | undefined;
  if (kind === 'business_permit') {
    const { data, error } = await supabase.from('company_requests').select('submitted_by, business_permit_path').eq('request_id', request_id).maybeSingle();
    if (error || !data) return { data: null, error: { code: 'FORBIDDEN', message: 'Evidence is not available.' } };
    path = data.business_permit_path; submittedBy = data.submitted_by;
  } else {
    const { data, error } = await supabase.from('company_requests').select('submitted_by, moa_path').eq('request_id', request_id).maybeSingle();
    if (error || !data) return { data: null, error: { code: 'FORBIDDEN', message: 'Evidence is not available.' } };
    path = data.moa_path; submittedBy = data.submitted_by;
  }
  if (typeof path !== 'string' || !path.startsWith(`${submittedBy}/reports/`))
    return { data: null, error: { code: 'FORBIDDEN', message: 'Evidence is not available.' } };
  const { data, error: storageError } = await getServiceClient().storage.from('private-documents').createSignedUrl(path, 60);
  if (storageError || !data?.signedUrl) return { data: null, error: { code: 'SERVER_FAILURE', message: 'Could not open the uploaded evidence.' } };
  return { data: toPublicSupabaseUrl(data.signedUrl), error: null };
}
