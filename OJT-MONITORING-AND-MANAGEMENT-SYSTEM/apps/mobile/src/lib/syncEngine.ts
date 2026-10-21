import { getAttendanceIdentity } from './attendanceCache';
import * as Network from 'expo-network';
import { supabase } from './supabase';
import { getOfflineQueue, removeOfflineQueueItem } from './offlineQueue';
import { syncAttendanceWorkflow, type QueuedAttendanceEvent } from './attendanceSyncWorkflow';
import { postWebBff } from './webBff';
import { uploadSelfieToStorage } from './storage';

export interface SyncResult {
  syncedCount: number;
  errors: string[];
}

/**
 * Checks if the device has an active, reachable internet connection.
 */
export async function isNetworkAvailable(): Promise<boolean> {
  try {
    const state = await Network.getNetworkStateAsync();
    return Boolean(state.isConnected && state.isInternetReachable !== false);
  } catch {
    return false;
  }
}

/**
 * Uploads a local sandboxed selfie file to Supabase Storage.
 */
async function uploadOfflineSelfie(
  item: QueuedAttendanceEvent
): Promise<string | null> {
  try {
    const safeEventId = item.id.replace(/[^a-zA-Z0-9_-]/g, '_');
    const result = await uploadSelfieToStorage(item.local_photo_uri, item.student_id, item.type, safeEventId);
    return result.data?.path || null;
  } catch (err) {
    console.error('[uploadOfflineSelfie] Exception:', err);
    return null;
  }
}

/**
 * Processes all pending items in the offline queue and uploads them to Supabase.
 */
let pendingSync: Promise<SyncResult> | null = null;

export function syncPendingOfflineAttendance(): Promise<SyncResult> {
  if (!pendingSync) {
    pendingSync = syncQueue().finally(() => { pendingSync = null; });
  }
  return pendingSync;
}

async function syncQueue(): Promise<SyncResult> {
  const online = await isNetworkAvailable();
  if (!online) {
    return { syncedCount: 0, errors: ['Network is currently offline.'] };
  }

  const identity = await getAttendanceIdentity(true);
  if (!identity) return { syncedCount: 0, errors: ['Sign in with an active student account before syncing.'] };
  const queue = (await getOfflineQueue()).filter(item => item.student_id === identity.student_id);
  if (queue.length === 0) {
    return { syncedCount: 0, errors: [] };
  }

  return syncAttendanceWorkflow(queue, identity.student_id, {
    async findTimeIn(studentId, attendanceDate) {
      const { data, error } = await supabase.from('attendance')
        .select('attendance_id, time_in').eq('student_id', studentId)
        .eq('attendance_date', attendanceDate).maybeSingle();
      return { data, error };
    },
    uploadSelfie: item => uploadOfflineSelfie(item),
    async insertTimeIn(payload) {
      const result = await postWebBff<{ attendance_id: string }>('/api/mobile/attendance', {
        action: 'time_in',
        assignment_id: payload.assignment_id,
        attendance_date: payload.attendance_date,
        time_in: payload.time_in,
        time_in_selfie_path: payload.time_in_selfie_path,
        latitude: payload.time_in_lat,
        longitude: payload.time_in_lng,
        distance_meters: payload.time_in_distance_meters,
        location_status: payload.time_in_location_status,
        flag_reason: payload.time_in_flag_reason,
      });
      return { error: result.error };
    },
    async findTimeOut(item, studentId) {
      let query = supabase.from('attendance').select('attendance_id, time_out').eq('student_id', studentId);
      query = item.attendance_id && !item.attendance_id.startsWith('offline_')
        ? query.eq('attendance_id', item.attendance_id)
        : query.eq('attendance_date', item.attendance_date);
      const { data, error } = await query.maybeSingle();
      return { data, error };
    },
    async updateTimeOut(item, storagePath) {
      const result = await postWebBff<null>('/api/mobile/attendance', {
        action: 'time_out',
        attendance_id: item.attendance_id,
        attendance_date: item.attendance_date,
        time_out: item.captured_at,
        time_out_selfie_path: storagePath,
        latitude: item.latitude ?? null,
        longitude: item.longitude ?? null,
        distance_meters: item.distance_meters ?? null,
        location_status: item.location_status ?? 'verified',
        flag_reason: item.flag_reason ?? null,
      });
      return { updated: !result.error, error: result.error };
    },
    removeQueueItem: removeOfflineQueueItem,
    now: () => new Date().toISOString(),
  });
}
