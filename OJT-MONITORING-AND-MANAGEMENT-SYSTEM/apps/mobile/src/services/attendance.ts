import { supabase } from '../lib/supabase';
import { isNetworkAvailable } from '../lib/syncEngine';
import { uploadSelfieToStorage } from '../lib/storage';
import { postWebBff } from '../lib/webBff';
import {
  saveImageToSandbox,
  enqueueOfflineAttendance,
  getOfflineQueue,
} from '../lib/offlineQueue';
import { getAttendanceDate, getPhilippineClock, type AppResult, type DbAttendance } from '@ojt/shared';
import { getAttendanceIdentity, type AttendanceIdentity } from '../lib/attendanceCache';

// ─── Late Status ──────────────────────────────────────────────────────────────

import * as SecureStore from 'expo-secure-store';

const CACHED_ASSIGNMENT_KEY = 'cdm_ojt_cached_assignment';

export interface CachedCompanyAssignment {
  assignment_id: string;
  company_id: string;
  branch_id: string;
  company_name: string;
  latitude: number | null;
  longitude: number | null;
  geofence_radius_meters: number;
  geofence_enabled: boolean;
}

export interface LocationPayload {
  latitude?: number | null;
  longitude?: number | null;
  distanceMeters?: number | null;
  locationStatus?: 'verified' | 'flagged_out_of_bounds' | 'location_unavailable' | 'not_applicable';
  flagReason?: string | null;
  satelliteTimestamp?: string | null;
}

export async function getActiveAssignment(): Promise<CachedCompanyAssignment | null> {
  const online = await isNetworkAvailable();
  const identity = await getAttendanceIdentity(online);
  return identity ? loadActiveAssignment(identity, online) : null;
}

async function loadActiveAssignment(
  identity: AttendanceIdentity,
  online: boolean
): Promise<CachedCompanyAssignment | null> {
  const cacheKey = `${CACHED_ASSIGNMENT_KEY}_${identity.user.user_id}`;
  if (online) {
    const { data: assignment, error } = await supabase
      .from('student_assignments')
      .select(`assignment_id, company_id, branch_id, companies ( company_name ), company_branches (
        latitude, longitude, geofence_radius_meters, geofence_enabled
      )`)
      .eq('student_id', identity.student_id)
      .eq('assignment_status', 'active')
      .maybeSingle();
    if (error) return null;
    if (!assignment?.companies || !assignment.company_branches) {
      await SecureStore.deleteItemAsync(cacheKey);
      return null;
    }
    const company = Array.isArray(assignment.companies) ? assignment.companies[0] : assignment.companies;
    const branch = Array.isArray(assignment.company_branches) ? assignment.company_branches[0] : assignment.company_branches;
    const result: CachedCompanyAssignment = {
      assignment_id: assignment.assignment_id,
      company_id: assignment.company_id,
      branch_id: assignment.branch_id,
      company_name: company.company_name,
      latitude: branch.latitude ?? null,
      longitude: branch.longitude ?? null,
      geofence_radius_meters: branch.geofence_radius_meters ?? 150,
      geofence_enabled: branch.geofence_enabled ?? false,
    };
    await SecureStore.setItemAsync(cacheKey, JSON.stringify(result));
    return result;
  }
  try {
    const cached = await SecureStore.getItemAsync(cacheKey);
    return cached ? JSON.parse(cached) as CachedCompanyAssignment : null;
  } catch {
    return null;
  }
}

// ─── Time In ──────────────────────────────────────────────────────────────────

export async function recordTimeIn(
  selfie_uri: string,
  locationData?: LocationPayload
): Promise<AppResult<{ attendance_id: string; isOffline?: boolean }>> {
  const online = await isNetworkAvailable();
  const student = await getAttendanceIdentity(online);
  if (!student) {
    return { data: null, error: { code: 'UNAUTHORIZED', message: 'Sign in online first to prepare attendance for this account.' } };
  }

  const assignment = await loadActiveAssignment(student, online);
  if (!assignment) {
    return { data: null, error: { code: 'NOT_FOUND', message: 'No active company assignment found. Please contact your coordinator.' } };
  }

  const capturedAt = locationData?.satelliteTimestamp || new Date().toISOString();
  const today = getAttendanceDate(new Date(capturedAt));
  const dayOfWeek = getPhilippineClock(new Date(capturedAt)).getUTCDay();

  // Weekend check
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'Attendance is only recorded on weekdays.' } };
  }

  // If OFFLINE: queue locally
  if (!online) {
    const existing = await getTodayAttendance();
    if (existing) {
      return { data: null, error: { code: 'DUPLICATE_REQUEST', message: 'You already have an attendance record for today.' } };
    }
    try {
      const savedPath = await saveImageToSandbox(selfie_uri, `time_in_${Date.now()}.jpg`);
      await enqueueOfflineAttendance({
        type: 'time_in',
        student_id: student.student_id,
        assignment_id: assignment.assignment_id,
        local_photo_uri: savedPath,
        captured_at: capturedAt,
        attendance_date: today,
        latitude: locationData?.latitude ?? null,
        longitude: locationData?.longitude ?? null,
        distance_meters: locationData?.distanceMeters ?? null,
        location_status: locationData?.locationStatus ?? 'verified',
        flag_reason: locationData?.flagReason ?? null,
      });
      return { data: { attendance_id: 'offline_pending', isOffline: true }, error: null };
    } catch {
      return { data: null, error: { code: 'SERVER_FAILURE', message: 'Failed to save offline attendance.' } };
    }
  }

  // Duplicate check when online
  const { data: existing } = await supabase
    .from('attendance')
    .select('attendance_id')
    .eq('student_id', student.student_id)
    .eq('attendance_date', today)
    .maybeSingle();

  if (existing) {
    return { data: null, error: { code: 'DUPLICATE_REQUEST', message: 'You already have an attendance record for today.' } };
  }

  const selfieResult = await uploadSelfieToStorage(selfie_uri, student.student_id, 'time_in');
  if (selfieResult.error) {
    // Fallback to offline queue if upload fails due to network drop
    try {
      const savedPath = await saveImageToSandbox(selfie_uri, `time_in_${Date.now()}.jpg`);
      await enqueueOfflineAttendance({
        type: 'time_in',
        student_id: student.student_id,
        assignment_id: assignment.assignment_id,
        local_photo_uri: savedPath,
        captured_at: capturedAt,
        attendance_date: today,
        latitude: locationData?.latitude ?? null,
        longitude: locationData?.longitude ?? null,
        distance_meters: locationData?.distanceMeters ?? null,
        location_status: locationData?.locationStatus ?? 'verified',
        flag_reason: locationData?.flagReason ?? null,
      });
      return { data: { attendance_id: 'offline_pending', isOffline: true }, error: null };
    } catch {
      return { data: null, error: selfieResult.error };
    }
  }

  const result = await postWebBff<{ attendance_id: string }>('/api/mobile/attendance', {
    action: 'time_in',
    assignment_id: assignment.assignment_id,
    attendance_date: today,
    time_in: capturedAt,
    time_in_selfie_path: selfieResult.data!.path,
    latitude: locationData?.latitude ?? null,
    longitude: locationData?.longitude ?? null,
    distance_meters: locationData?.distanceMeters ?? null,
    location_status: locationData?.locationStatus ?? 'verified',
    flag_reason: locationData?.flagReason ?? null,
  });
  if (result.error?.code === 'SERVER_FAILURE') {
    try {
      const savedPath = await saveImageToSandbox(selfie_uri, `time_in_${Date.now()}.jpg`);
      await enqueueOfflineAttendance({
        type: 'time_in', student_id: student.student_id, assignment_id: assignment.assignment_id,
        local_photo_uri: savedPath, captured_at: capturedAt, attendance_date: today,
        latitude: locationData?.latitude ?? null, longitude: locationData?.longitude ?? null,
        distance_meters: locationData?.distanceMeters ?? null,
        location_status: locationData?.locationStatus ?? 'verified', flag_reason: locationData?.flagReason ?? null,
      });
      return { data: { attendance_id: 'offline_pending', isOffline: true }, error: null };
    } catch { /* Keep the server error when local recovery cannot be saved. */ }
  }
  if (result.error || !result.data) return { data: null, error: result.error || { code: 'SERVER_FAILURE', message: 'Failed to record Time In.' } };
  return { data: { attendance_id: result.data.attendance_id, isOffline: false }, error: null };
}

// ─── Time Out ─────────────────────────────────────────────────────────────────

export async function recordTimeOut(
  attendance_id: string,
  selfie_uri: string,
  locationData?: LocationPayload
): Promise<AppResult<{ isOffline?: boolean }>> {
  const online = await isNetworkAvailable();
  const student = await getAttendanceIdentity(online);
  if (!student) {
    return { data: null, error: { code: 'UNAUTHORIZED', message: 'Sign in online first to prepare attendance for this account.' } };
  }

  const capturedAt = locationData?.satelliteTimestamp || new Date().toISOString();
  const today = getAttendanceDate(new Date(capturedAt));

  // If OFFLINE: queue locally
  if (!online || attendance_id.startsWith('offline_')) {
    const existing = await getTodayAttendance();
    if (!existing || existing.time_out) {
      return { data: null, error: { code: 'VALIDATION_FAILURE', message: existing ? 'Time Out has already been recorded for today.' : 'Record Time In before Time Out.' } };
    }
    try {
      const savedPath = await saveImageToSandbox(selfie_uri, `time_out_${Date.now()}.jpg`);
      await enqueueOfflineAttendance({
        type: 'time_out',
        student_id: student.student_id,
        assignment_id: '',
        attendance_id: !attendance_id.startsWith('offline_') ? attendance_id : undefined,
        local_photo_uri: savedPath,
        captured_at: capturedAt,
        attendance_date: today,
        latitude: locationData?.latitude ?? null,
        longitude: locationData?.longitude ?? null,
        distance_meters: locationData?.distanceMeters ?? null,
        location_status: locationData?.locationStatus ?? 'verified',
        flag_reason: locationData?.flagReason ?? null,
      });
      return { data: { isOffline: true }, error: null };
    } catch {
      return { data: null, error: { code: 'SERVER_FAILURE', message: 'Failed to save offline Time Out.' } };
    }
  }

  const { data: record } = await supabase
    .from('attendance')
    .select('attendance_id, student_id, time_out')
    .eq('attendance_id', attendance_id)
    .eq('student_id', student.student_id)
    .single();

  if (!record) {
    return { data: null, error: { code: 'NOT_FOUND', message: 'Attendance record not found.' } };
  }

  if (record.time_out) {
    return { data: null, error: { code: 'DUPLICATE_REQUEST', message: 'Time Out has already been recorded for today.' } };
  }

  const selfieResult = await uploadSelfieToStorage(selfie_uri, student.student_id, 'time_out');
  if (selfieResult.error) {
    try {
      const savedPath = await saveImageToSandbox(selfie_uri, `time_out_${Date.now()}.jpg`);
      await enqueueOfflineAttendance({
        type: 'time_out',
        student_id: student.student_id,
        assignment_id: '',
        attendance_id,
        local_photo_uri: savedPath,
        captured_at: capturedAt,
        attendance_date: today,
        latitude: locationData?.latitude ?? null,
        longitude: locationData?.longitude ?? null,
        distance_meters: locationData?.distanceMeters ?? null,
        location_status: locationData?.locationStatus ?? 'verified',
        flag_reason: locationData?.flagReason ?? null,
      });
      return { data: { isOffline: true }, error: null };
    } catch {
      return { data: null, error: selfieResult.error };
    }
  }

  const result = await postWebBff<null>('/api/mobile/attendance', {
    action: 'time_out',
    attendance_id,
    attendance_date: today,
    time_out: capturedAt,
    time_out_selfie_path: selfieResult.data!.path,
    latitude: locationData?.latitude ?? null,
    longitude: locationData?.longitude ?? null,
    distance_meters: locationData?.distanceMeters ?? null,
    location_status: locationData?.locationStatus ?? 'verified',
    flag_reason: locationData?.flagReason ?? null,
  });
  if (result.error?.code === 'SERVER_FAILURE') {
    try {
      const savedPath = await saveImageToSandbox(selfie_uri, `time_out_${Date.now()}.jpg`);
      await enqueueOfflineAttendance({
        type: 'time_out', student_id: student.student_id, assignment_id: '', attendance_id,
        local_photo_uri: savedPath, captured_at: capturedAt, attendance_date: today,
        latitude: locationData?.latitude ?? null, longitude: locationData?.longitude ?? null,
        distance_meters: locationData?.distanceMeters ?? null,
        location_status: locationData?.locationStatus ?? 'verified', flag_reason: locationData?.flagReason ?? null,
      });
      return { data: { isOffline: true }, error: null };
    } catch { /* Keep the server error when local recovery cannot be saved. */ }
  }
  if (result.error) return { data: null, error: result.error };
  return { data: { isOffline: false }, error: null };
}

// ─── Fetch own attendance ─────────────────────────────────────────────────────

export async function fetchOwnAttendance(
  page = 1,
  pageSize = 20
): Promise<AppResult<{ records: DbAttendance[]; total: number }>> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { data: null, error: { code: 'UNAUTHORIZED', message: 'Not authenticated.' } };
  }

  const { data: student } = await supabase
    .from('students')
    .select('student_id')
    .eq('user_id', user.id)
    .single();

  if (!student) {
    return { data: null, error: { code: 'NOT_FOUND', message: 'Student profile not found.' } };
  }

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  try {
    const { data, error, count } = await supabase
      .from('attendance')
      .select('attendance_id, student_id, assignment_id, attendance_date, time_in, time_out, time_in_selfie_path, time_out_selfie_path, verification_status, late_status, sync_status, created_at, updated_at', { count: 'exact' })
      .eq('student_id', student.student_id)
      .order('attendance_date', { ascending: false })
      .range(from, to);

    if (error) {
      return { data: null, error: { code: 'SERVER_FAILURE', message: 'Failed to load attendance records.' } };
    }

    return { data: { records: (data as DbAttendance[]) ?? [], total: count ?? 0 }, error: null };
  } catch {
    return { data: { records: [], total: 0 }, error: null };
  }
}

export async function getTodayAttendance(): Promise<DbAttendance | null> {
  const online = await isNetworkAvailable();
  const student = await getAttendanceIdentity(online);
  if (!student) return null;
  const today = getAttendanceDate();
  const cacheKey = `cdm_ojt_today_${student.student_id}`;
  let record: DbAttendance | null = null;

  if (online) {
    const { data, error } = await supabase.from('attendance')
      .select('attendance_id, student_id, assignment_id, attendance_date, time_in, time_out, time_in_selfie_path, time_out_selfie_path, verification_status, late_status, sync_status, created_at, updated_at')
      .eq('student_id', student.student_id).eq('attendance_date', today).maybeSingle();
    if (!error) {
      record = data as DbAttendance | null;
      await SecureStore.setItemAsync(cacheKey, JSON.stringify(record));
    }
  } else {
    try {
      const raw = await SecureStore.getItemAsync(cacheKey);
      const cached = raw ? JSON.parse(raw) as DbAttendance : null;
      if (cached?.student_id === student.student_id && cached.attendance_date === today) record = cached;
    } catch {
      // Only same-account records from today can be used offline.
    }
  }

  const queue = (await getOfflineQueue()).filter(item =>
    item.student_id === student.student_id && item.attendance_date === today);
  const timeIn = queue.find(item => item.type === 'time_in');
  const timeOut = queue.find(item => item.type === 'time_out');
  if (!record && timeIn) {
    record = {
      attendance_id: 'offline_pending',
      student_id: timeIn.student_id,
      assignment_id: timeIn.assignment_id,
      attendance_date: timeIn.attendance_date,
      time_in: timeIn.captured_at,
      time_out: null,
      time_in_selfie_path: timeIn.local_photo_uri,
      time_out_selfie_path: null,
      verification_status: 'pending',
      late_status: 'unknown',
      sync_status: 'pending_sync',
      created_at: timeIn.created_at,
      updated_at: timeIn.created_at,
    } as DbAttendance;
  }
  if (record && timeOut) {
    record = { ...record, time_out: timeOut.captured_at,
      time_out_selfie_path: timeOut.local_photo_uri, sync_status: 'pending_sync' };
  }
  return record;
}
