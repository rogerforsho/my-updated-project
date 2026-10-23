import { supabase } from '../lib/supabase';
import { postWebBff } from '../lib/webBff';
import type { AppResult } from '@ojt/shared';

export const INCIDENT_CATEGORIES = [
  { value: 'harassment', label: 'Harassment' },
  { value: 'safety', label: 'Safety concern' },
  { value: 'supervisor_conduct', label: 'Supervisor conduct' },
  { value: 'workplace_condition', label: 'Workplace condition' },
  { value: 'other', label: 'Other' },
] as const;

export type IncidentCategory = (typeof INCIDENT_CATEGORIES)[number]['value'];

export interface MyIncidentReport {
  incident_id: string;
  category: IncidentCategory;
  description: string;
  status: 'submitted' | 'acknowledged' | 'closed';
  coordinator_response: string | null;
  created_at: string;
}

export async function listMyIncidentReports(): Promise<AppResult<MyIncidentReport[]>> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: null, error: { code: 'UNAUTHORIZED', message: 'Sign in again to view your reports.' } };
  const { data, error } = await supabase.from('incident_reports')
    .select('incident_id, category, description, status, coordinator_response, created_at')
    .order('created_at', { ascending: false }).limit(20);
  if (error) return { data: null, error: { code: 'SERVER_FAILURE', message: 'Could not load your incident reports.' } };
  return { data: data as MyIncidentReport[], error: null };
}

export async function submitIncidentReport(input: { category: IncidentCategory; description: string }): Promise<AppResult<unknown>> {
  const description = input.description.trim();
  if (description.length < 10)
    return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'Describe what happened in at least 10 characters.' } };
  return postWebBff('/api/mobile/incident-reports', { category: input.category, description });
}
