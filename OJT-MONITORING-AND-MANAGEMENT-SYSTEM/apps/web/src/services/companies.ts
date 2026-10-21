'use server';

import { createClient } from '@/src/lib/supabase/server';
import { recordAuditEvent } from '@/src/lib/audit';
import type { AppResult, DbCompany, DbCompanyBranch } from '@ojt/shared';

export interface CompanyInput {
  company_name: string;
  address: string;
  contact_person: string;
  contact_email: string;
  contact_number: string;
  latitude?: number | null;
  longitude?: number | null;
  geofence_radius_meters?: number;
  geofence_enabled?: boolean;
}

export interface CompanyWithSupervisors extends DbCompany {
  supervisors: { supervisor_id: string; user_id: string; position: string; users: { full_name: string; email: string } }[];
  active_interns_count?: number;
}

function validateCompanyInput(input: CompanyInput): string | null {
  if (!input.company_name?.trim()) return 'Company name is required.';
  if (!input.address?.trim()) return 'Address is required.';
  if (!input.contact_person?.trim()) return 'Contact person is required.';
  if (!input.contact_email?.trim()) return 'Contact email is required.';
  if (!input.contact_number?.trim()) return 'Contact number is required.';
  if (input.latitude != null && (isNaN(input.latitude) || input.latitude < -90 || input.latitude > 90)) {
    return 'Latitude must be a valid number between -90 and 90.';
  }
  if (input.longitude != null && (isNaN(input.longitude) || input.longitude < -180 || input.longitude > 180)) {
    return 'Longitude must be a valid number between -180 and 180.';
  }
  if (input.geofence_radius_meters != null && (input.geofence_radius_meters < 50 || input.geofence_radius_meters > 5000)) {
    return 'Workplace perimeter radius must be between 50 and 5,000 meters.';
  }
  return null;
}

async function assertCoordinator() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, authorized: false };
  const { data } = await supabase
    .from('users')
    .select('role, account_status')
    .eq('user_id', user.id)
    .single();
  return {
    supabase,
    user,
    authorized: data?.role === 'Coordinator' && data?.account_status === 'active',
  };
}

export async function listCompanies(
  page = 1,
  pageSize = 20
): Promise<AppResult<{ companies: CompanyWithSupervisors[]; total: number }>> {
  const { supabase, authorized } = await assertCoordinator();
  if (!authorized) return { data: null, error: { code: 'FORBIDDEN', message: 'Access denied.' } };

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data, error, count } = await supabase
    .from('companies')
    .select(`
      *,
      supervisors (
        supervisor_id, user_id, position,
        users ( full_name, email )
      )
    `, { count: 'exact' })
    .order('company_name', { ascending: true })
    .range(from, to);

  if (error) return { data: null, error: { code: 'SERVER_FAILURE', message: 'Failed to load companies.' } };
  return { data: { companies: data as CompanyWithSupervisors[], total: count ?? 0 }, error: null };
}

export async function listCompanyBranches(company_id: string): Promise<AppResult<DbCompanyBranch[]>> {
  if (!company_id) return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'Company ID is required.' } };
  const { supabase, authorized } = await assertCoordinator();
  if (!authorized) return { data: null, error: { code: 'FORBIDDEN', message: 'Access denied.' } };
  const { data, error } = await supabase.from('company_branches')
    .select('branch_id, company_id, branch_name, address, latitude, longitude, geofence_radius_meters, geofence_enabled, is_primary, status')
    .eq('company_id', company_id).eq('status', 'active').order('is_primary', { ascending: false }).order('branch_name');
  if (error) return { data: null, error: { code: 'SERVER_FAILURE', message: 'Failed to load company branches.' } };
  return { data: data as DbCompanyBranch[], error: null };
}

export async function createCompanyBranch(input: {
  company_id: string; branch_name: string; address: string; latitude: number; longitude: number; geofence_radius_meters?: number;
}): Promise<AppResult<DbCompanyBranch>> {
  if (!input.company_id || !input.branch_name.trim() || !input.address.trim() ||
      !Number.isFinite(input.latitude) || input.latitude < -90 || input.latitude > 90 ||
      !Number.isFinite(input.longitude) || input.longitude < -180 || input.longitude > 180 ||
      !Number.isInteger(input.geofence_radius_meters ?? 150) || (input.geofence_radius_meters ?? 150) < 50 || (input.geofence_radius_meters ?? 150) > 5000)
    return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'Provide a branch name, address, valid map coordinates, and a radius from 50 to 5,000 meters.' } };
  const { supabase, user, authorized } = await assertCoordinator();
  if (!authorized || !user) return { data: null, error: { code: 'FORBIDDEN', message: 'Access denied.' } };
  const { data: company } = await supabase.from('companies').select('company_id').eq('company_id', input.company_id).eq('status', 'active').maybeSingle();
  if (!company) return { data: null, error: { code: 'NOT_FOUND', message: 'Active HTE not found.' } };
  const { data, error } = await supabase.from('company_branches').insert({
    company_id: input.company_id, branch_name: input.branch_name.trim(), address: input.address.trim(),
    latitude: input.latitude, longitude: input.longitude, geofence_radius_meters: input.geofence_radius_meters ?? 150,
    geofence_enabled: true, is_primary: false, status: 'active',
  }).select('branch_id, company_id, branch_name, address, latitude, longitude, geofence_radius_meters, geofence_enabled, is_primary, status').single();
  if (error) return { data: null, error: { code: error.code === '23505' ? 'DUPLICATE_REQUEST' : 'SERVER_FAILURE', message: error.code === '23505' ? 'A branch with this name already exists for the HTE.' : 'Failed to create HTE branch.' } };
  await recordAuditEvent({ actor_user_id: user.id, action: 'COMPANY_BRANCH_CREATED', entity_type: 'company_branch', entity_id: data.branch_id, details: { company_id: data.company_id, geofence_enabled: true } });
  return { data: data as DbCompanyBranch, error: null };
}

export async function createCompany(input: CompanyInput): Promise<AppResult<DbCompany>> {
  const validationError = validateCompanyInput(input);
  if (validationError) return { data: null, error: { code: 'VALIDATION_FAILURE', message: validationError } };

  const { supabase, user, authorized } = await assertCoordinator();
  if (!authorized || !user) return { data: null, error: { code: 'FORBIDDEN', message: 'Access denied.' } };

  const normalizedName = input.company_name.trim();

  // Duplicate Company Detection
  const { data: existing } = await supabase
    .from('companies')
    .select('company_id, company_name')
    .ilike('company_name', normalizedName)
    .maybeSingle();

  if (existing) {
    return { data: null, error: { code: 'DUPLICATE_REQUEST', message: `A company named "${existing.company_name}" is already registered.` } };
  }

  const { data, error } = await supabase
    .from('companies')
    .insert({
      company_name: normalizedName,
      address: input.address.trim(),
      contact_person: input.contact_person.trim(),
      contact_email: input.contact_email.trim(),
      contact_number: input.contact_number.trim(),
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      geofence_radius_meters: input.geofence_radius_meters ?? 150,
      geofence_enabled: input.geofence_enabled ?? false,
      status: 'active',
    })
    .select()
    .single();

  if (error) return { data: null, error: { code: 'SERVER_FAILURE', message: 'Failed to create company.' } };

  await recordAuditEvent({
    actor_user_id: user.id,
    action: 'COMPANY_CREATED',
    entity_type: 'company',
    entity_id: data.company_id,
    details: { company_name: data.company_name, geofence_enabled: data.geofence_enabled },
  });

  return { data: data as DbCompany, error: null };
}

export async function updateCompany(
  company_id: string,
  input: CompanyInput
): Promise<AppResult<DbCompany>> {
  if (!company_id) return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'Company ID is required.' } };
  const validationError = validateCompanyInput(input);
  if (validationError) return { data: null, error: { code: 'VALIDATION_FAILURE', message: validationError } };

  const { supabase, user, authorized } = await assertCoordinator();
  if (!authorized || !user) return { data: null, error: { code: 'FORBIDDEN', message: 'Access denied.' } };

  const { data, error } = await supabase
    .from('companies')
    .update({
      company_name: input.company_name.trim(),
      address: input.address.trim(),
      contact_person: input.contact_person.trim(),
      contact_email: input.contact_email.trim(),
      contact_number: input.contact_number.trim(),
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      geofence_radius_meters: input.geofence_radius_meters ?? 150,
      geofence_enabled: input.geofence_enabled ?? false,
      updated_at: new Date().toISOString(),
    })
    .eq('company_id', company_id)
    .select()
    .single();

  if (error) return { data: null, error: { code: 'SERVER_FAILURE', message: 'Failed to update company.' } };

  await recordAuditEvent({
    actor_user_id: user.id,
    action: 'COMPANY_UPDATED',
    entity_type: 'company',
    entity_id: company_id,
    details: { company_name: data.company_name },
  });

  return { data: data as DbCompany, error: null };
}

export async function setCompanyStatus(
  company_id: string,
  status: 'active' | 'inactive'
): Promise<AppResult<{ activeInternsAffected: number }>> {
  if (!company_id) return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'Company ID is required.' } };

  const { supabase, user, authorized } = await assertCoordinator();
  if (!authorized || !user) return { data: null, error: { code: 'FORBIDDEN', message: 'Access denied.' } };

  // Check active student assignments at this establishment
  const { count: activeInterns } = await supabase
    .from('student_assignments')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', company_id)
    .eq('assignment_status', 'active');

  const { error } = await supabase
    .from('companies')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('company_id', company_id);

  if (error) return { data: null, error: { code: 'SERVER_FAILURE', message: 'Failed to update company status.' } };

  await recordAuditEvent({
    actor_user_id: user.id,
    action: `COMPANY_STATUS_${status.toUpperCase()}`,
    entity_type: 'company',
    entity_id: company_id,
    details: { status, active_interns_affected: activeInterns || 0 },
  });

  return { data: { activeInternsAffected: activeInterns || 0 }, error: null };
}

export async function getCompanyCapacity(
  company_id: string
): Promise<AppResult<{ company_id: string; active_interns: number; recommended_capacity: number; is_at_capacity: boolean }>> {
  if (!company_id) return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'Company ID is required.' } };

  const { supabase, authorized } = await assertCoordinator();
  if (!authorized) return { data: null, error: { code: 'FORBIDDEN', message: 'Access denied.' } };

  const { count, error } = await supabase
    .from('student_assignments')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', company_id)
    .eq('assignment_status', 'active');

  if (error) return { data: null, error: { code: 'SERVER_FAILURE', message: 'Failed to fetch capacity.' } };

  const active = count || 0;
  const recommendedCapacity = 5; // Institutional benchmark per partner establishment

  return {
    data: {
      company_id,
      active_interns: active,
      recommended_capacity: recommendedCapacity,
      is_at_capacity: active >= recommendedCapacity,
    },
    error: null,
  };
}

export async function deleteCompany(
  company_id: string
): Promise<AppResult<{ success: boolean; company_name: string }>> {
  if (!company_id) return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'Company ID is required.' } };

  const { supabase, user, authorized } = await assertCoordinator();
  if (!authorized || !user) return { data: null, error: { code: 'FORBIDDEN', message: 'Access denied.' } };

  // 1. Fetch company details
  const { data: company, error: compErr } = await supabase
    .from('companies')
    .select('company_id, company_name')
    .eq('company_id', company_id)
    .single();

  if (compErr || !company) {
    return { data: null, error: { code: 'NOT_FOUND', message: 'Company not found.' } };
  }

  // 2. Check for student assignments (which has on delete restrict)
  const { count: assignmentCount, error: assignErr } = await supabase
    .from('student_assignments')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', company_id);

  if (assignErr) {
    return { data: null, error: { code: 'SERVER_FAILURE', message: 'Failed to check company student assignments.' } };
  }

  if (assignmentCount && assignmentCount > 0) {
    return {
      data: null,
      error: {
        code: 'VALIDATION_FAILURE',
        message: `Cannot delete "${company.company_name}" because it is linked to ${assignmentCount} student practicum record${assignmentCount > 1 ? 's' : ''}. Please deactivate the establishment instead to preserve student OJT history.`,
      },
    };
  }

  // 3. Unassign supervisors through the authenticated client before removal.
  const { error: supervisorUpdateError } = await supabase
    .from('supervisors')
    .update({ company_id: null })
    .eq('company_id', company_id);
  if (supervisorUpdateError)
    return { data: null, error: { code: 'SERVER_FAILURE', message: 'Failed to unassign company supervisors.' } };

  // 4. Delete company under the coordinator's RLS policy.
  const { error: deleteError } = await supabase
    .from('companies')
    .delete()
    .eq('company_id', company_id);

  if (deleteError) {
    return { data: null, error: { code: 'SERVER_FAILURE', message: deleteError.message || 'Failed to delete company.' } };
  }

  // 5. Record audit trail
  await recordAuditEvent({
    actor_user_id: user.id,
    action: 'COMPANY_DELETED',
    entity_type: 'company',
    entity_id: company_id,
    details: { company_name: company.company_name },
  });

  return { data: { success: true, company_name: company.company_name }, error: null };
}

export interface MapTraineeItem {
  student_id: string;
  student_number: string;
  full_name: string;
  course: string;
}

export interface MapCompanyItem {
  company_id: string;
  company_name: string;
  address: string;
  contact_person: string;
  contact_email: string;
  contact_number: string;
  status: string;
  latitude: number | null;
  longitude: number | null;
  geofence_radius_meters: number;
  geofence_enabled: boolean;
  assigned_trainees: MapTraineeItem[];
}

export async function getDeploymentMapData(): Promise<AppResult<{
  companies: MapCompanyItem[];
  totalCompanies: number;
  geofencedCount: number;
  totalTraineesDeployed: number;
}>> {
  const { supabase, authorized } = await assertCoordinator();
  if (!authorized) return { data: null, error: { code: 'FORBIDDEN', message: 'Access denied.' } };

  const [{ data: companies, error: compErr }, { data: assignments }] = await Promise.all([
    supabase
      .from('companies')
      .select('company_id, company_name, address, contact_person, contact_email, contact_number, status, latitude, longitude, geofence_radius_meters, geofence_enabled')
      .order('company_name', { ascending: true }),
    supabase
      .from('student_assignments')
      .select(`
        company_id,
        assignment_status,
        students (
          student_id,
          student_number,
          course,
          users (
            full_name
          )
        )
      `)
      .eq('assignment_status', 'active'),
  ]);

  if (compErr) {
    return { data: null, error: { code: 'SERVER_FAILURE', message: 'Failed to load company deployment data.' } };
  }

  // Aggregate active trainees by company_id
  const traineeMap: Record<string, MapTraineeItem[]> = {};
  let totalTrainees = 0;

  (assignments || []).forEach((a: any) => {
    if (!a.company_id || !a.students) return;
    const s = a.students;
    const fullName = s.users?.full_name || 'Trainee';
    if (!traineeMap[a.company_id]) {
      traineeMap[a.company_id] = [];
    }
    traineeMap[a.company_id].push({
      student_id: s.student_id,
      student_number: s.student_number,
      full_name: fullName,
      course: s.course || '',
    });
    totalTrainees++;
  });

  const formatted: MapCompanyItem[] = (companies || []).map((c: any) => {
    const trainees = traineeMap[c.company_id] || [];
    return {
      ...c,
      latitude: c.latitude != null ? Number(c.latitude) : null,
      longitude: c.longitude != null ? Number(c.longitude) : null,
      geofence_radius_meters: c.geofence_radius_meters || 150,
      geofence_enabled: !!c.geofence_enabled,
      assigned_trainees: trainees,
    };
  });

  const geofencedCount = formatted.filter(
    (c) => c.latitude != null && c.longitude != null && c.geofence_enabled
  ).length;

  return {
    data: {
      companies: formatted,
      totalCompanies: formatted.length,
      geofencedCount,
      totalTraineesDeployed: totalTrainees,
    },
    error: null,
  };
}

