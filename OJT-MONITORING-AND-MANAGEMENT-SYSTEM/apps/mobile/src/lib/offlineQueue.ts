import { getAttendanceDate } from '@ojt/shared';
import * as FileSystem from 'expo-file-system/legacy';
import * as SecureStore from 'expo-secure-store';

const QUEUE_KEY = 'cdm_ojt_offline_attendance_queue';

export interface OfflineQueueItem {
  id: string;
  type: 'time_in' | 'time_out';
  student_id: string;
  assignment_id: string;
  attendance_id?: string;
  local_photo_uri: string;
  captured_at: string;
  attendance_date: string;
  created_at: string;
  latitude?: number | null;
  longitude?: number | null;
  distance_meters?: number | null;
  location_status?: 'verified' | 'flagged_out_of_bounds' | 'location_unavailable' | 'not_applicable';
  flag_reason?: string | null;
}

/**
 * Saves photo to app private document sandbox directory to avoid OS temp cache deletion.
 * Supports both local file URIs (file://, content://) and raw/data-URL base64 strings.
 */
export async function saveImageToSandbox(source: string, filename: string): Promise<string> {
  const dir = `${FileSystem.documentDirectory}offline_selfies/`;
  const dirInfo = await FileSystem.getInfoAsync(dir);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }

  const destination = `${dir}${filename}`;

  // Detect if source is base64 (data URI or raw base64 like JPEG /9j/) vs local file URI
  const isBase64 =
    source.startsWith('data:') ||
    source.startsWith('/9j/') ||
    (!source.startsWith('file://') && !source.startsWith('content://') && source.length > 500);

  if (isBase64) {
    // Clean base64 header if present (e.g. data:image/jpeg;base64,...)
    const base64Data = source.replace(/^data:[^;]+;base64,/, '').trim();
    await FileSystem.writeAsStringAsync(destination, base64Data, {
      encoding: 'base64',
    });
  } else {
    const fromUri = source.startsWith('/') ? `file://${source}` : source;
    await FileSystem.copyAsync({ from: fromUri, to: destination });
  }

  return destination;
}

/**
 * Retrieves the entire offline queue from SecureStore.
 */
export async function getOfflineQueue(): Promise<OfflineQueueItem[]> {
  try {
    const raw = await SecureStore.getItemAsync(QUEUE_KEY);
    if (raw === null) return [];
    const queue: unknown = JSON.parse(raw);
    if (!Array.isArray(queue) || queue.some(item => !item ||
        !['time_in', 'time_out'].includes(item.type) ||
        ['id', 'student_id', 'assignment_id', 'local_photo_uri', 'attendance_date', 'captured_at'].some(key => typeof item[key] !== 'string'))) {
      throw new Error('Invalid queue');
    }
    return queue as OfflineQueueItem[];
  } catch {
    // Never turn an unreadable queue into [], which a later save would overwrite.
    throw new Error('Saved attendance could not be read. Do not clear app data. Retry or contact your coordinator.');
  }
}

let mutationQueue: Promise<unknown> = Promise.resolve();
function mutateQueue<T>(operation: () => Promise<T>): Promise<T> {
  const result = mutationQueue.then(operation, operation);
  mutationQueue = result.then(() => undefined, () => undefined);
  return result;
}

export function enqueueOfflineAttendance(item: Omit<OfflineQueueItem, 'id' | 'created_at'>): Promise<OfflineQueueItem> {
  return mutateQueue(async () => {
    const queue = await getOfflineQueue();
    const newItem: OfflineQueueItem = { ...item, id: 'offline_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7), created_at: new Date().toISOString() };
    await SecureStore.setItemAsync(QUEUE_KEY, JSON.stringify([...queue, newItem]));
    return newItem;
  });
}

export function removeOfflineQueueItem(id: string): Promise<void> {
  return mutateQueue(async () => {
    const queue = await getOfflineQueue();
    const item = queue.find(q => q.id === id);
    // Persist first: a failed write must leave both queue and photo recoverable.
    await SecureStore.setItemAsync(QUEUE_KEY, JSON.stringify(queue.filter(q => q.id !== id)));
    if (item?.local_photo_uri?.startsWith(FileSystem.documentDirectory + 'offline_selfies/') &&
        !queue.some(q => q.id !== id && q.local_photo_uri === item.local_photo_uri)) {
      try { await FileSystem.deleteAsync(item.local_photo_uri, { idempotent: true }); } catch { /* Cleanup can be retried without losing attendance. */ }
    }
  });
}

/**
 * Checks if there is a pending offline record for today for the given student.
 */
export async function getOfflineAttendanceForToday(student_id: string): Promise<OfflineQueueItem | null> {
  const queue = await getOfflineQueue();
  const today = getAttendanceDate();
  const found = queue.find(q => q.type === 'time_in' && q.student_id === student_id && q.attendance_date === today);
  return found || null;
}
