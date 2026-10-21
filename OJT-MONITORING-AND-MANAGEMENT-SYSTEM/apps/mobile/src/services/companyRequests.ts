import { supabase } from '../lib/supabase';
import { postWebBff } from '../lib/webBff';
import { uploadReportToStorage } from '../lib/storage';
import type { AppResult, DbCompanyRequest } from '@ojt/shared';

export interface CompanyRequestInput {
  requested_company_name: string;
  company_address: string;
  contact_person: string;
  contact_email: string;
  contact_number: string;
  requested_branch_name: string;
  branch_address: string;
  business_permit?: { uri: string; name: string; mimeType?: string } | null;
  moa?: { uri: string; name: string; mimeType?: string } | null;
}

export async function listMyCompanyRequests(): Promise<AppResult<DbCompanyRequest[]>> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: null, error: { code: 'UNAUTHORIZED', message: 'Sign in again to view HTE requests.' } };
  const { data, error } = await supabase.from('company_requests')
    .select('request_id, student_id, requested_company_name, company_address, contact_person, contact_email, contact_number, requested_branch_name, branch_address, business_permit_path, moa_path, status, feedback, company_id, branch_id, created_at')
    .order('created_at', { ascending: false }).limit(20);
  if (error) return { data: null, error: { code: 'SERVER_FAILURE', message: 'Could not load HTE requests.' } };
  return { data: data as DbCompanyRequest[], error: null };
}

export async function submitCompanyRequest(input: CompanyRequestInput): Promise<AppResult<unknown>> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: null, error: { code: 'UNAUTHORIZED', message: 'Sign in again before submitting an HTE request.' } };
  const { data: student, error } = await supabase.from('students').select('student_id').eq('user_id', user.id).single();
  if (error || !student) return { data: null, error: { code: 'NOT_FOUND', message: 'Student profile not found.' } };

  let business_permit_path: string | null = null;
  let moa_path: string | null = null;
  if (input.business_permit) {
    const uploaded = await uploadReportToStorage(input.business_permit.uri, input.business_permit.name, user.id, input.business_permit.mimeType);
    if (uploaded.error || !uploaded.data) return { data: null, error: uploaded.error };
    business_permit_path = uploaded.data.path;
  }
  if (input.moa) {
    const uploaded = await uploadReportToStorage(input.moa.uri, input.moa.name, user.id, input.moa.mimeType);
    if (uploaded.error || !uploaded.data) return { data: null, error: uploaded.error };
    moa_path = uploaded.data.path;
  }
  return postWebBff('/api/mobile/company-requests', { ...input, business_permit: undefined, moa: undefined, business_permit_path, moa_path });
}
