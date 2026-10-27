import { getAttendanceDate } from '@ojt/shared';
import * as FileSystem from 'expo-file-system/legacy';
import * as SecureStore from 'expo-secure-store';

const QUEUE_KEY = 'cdm_ojt_offline_attendance_queue';
const QUEUE_FILES = ['cdm_ojt_attendance_a.json', 'cdm_ojt_attendance_b.json']
  .map(name => `${FileSystem.documentDirectory}${name}`);

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

function validQueue(queue: unknown): queue is OfflineQueueItem[] {
  return Array.isArray(queue) && !queue.some(item => !item ||
        !['time_in', 'time_out'].includes(item.type) ||
        ['id', 'student_id', 'assignment_id', 'local_photo_uri', 'attendance_date', 'captured_at'].some(key => typeof item[key] !== 'string'));
}

async function readQueueUnsafe(): Promise<{ queue: OfflineQueueItem[]; version: number }> {
  const versions: Array<{ queue: OfflineQueueItem[]; version: number }> = [];
  let fileExists = false;
  for (const path of QUEUE_FILES) {
    if (!(await FileSystem.getInfoAsync(path)).exists) continue;
    fileExists = true;
    try {
      const saved = JSON.parse(await FileSystem.readAsStringAsync(path));
      if (Number.isSafeInteger(saved.version) && saved.version > 0 && validQueue(saved.queue))
        versions.push(saved);
    } catch { /* The other copy may still be readable after an interrupted write. */ }
  }
  if (versions.length) return versions.sort((a, b) => b.version - a.version)[0];
  const raw = await SecureStore.getItemAsync(QUEUE_KEY);
  // A half-written first file must not hide the legacy queue, which is only deleted after the file is saved.
  if (raw === null) {
    if (fileExists) throw new Error('Invalid queue files');
    return { queue: [], version: 0 };
  }
  const queue: unknown = JSON.parse(raw);
  if (!validQueue(queue)) throw new Error('Invalid legacy queue');
  return { queue, version: 0 };
}

async function readQueue(): Promise<{ queue: OfflineQueueItem[]; version: number }> {
  try { return await readQueueUnsafe(); }
  catch { throw new Error('Saved attendance could not be read. Do not clear app data. Retry or contact your coordinator.'); }
}

async function writeQueue(queue: OfflineQueueItem[], version: number): Promise<void> {
  // Alternate copies so an interrupted write leaves the previous queue intact.
  await FileSystem.writeAsStringAsync(QUEUE_FILES[version % 2], JSON.stringify({ version: version + 1, queue }));
  if (version === 0) {
    try { await SecureStore.deleteItemAsync(QUEUE_KEY); } catch { /* The file copy now takes precedence. */ }
  }
}

export async function getOfflineQueue(): Promise<OfflineQueueItem[]> {
  await mutationQueue;
  return (await readQueue()).queue;
}

let mutationQueue: Promise<unknown> = Promise.resolve();
function mutateQueue<T>(operation: () => Promise<T>): Promise<T> {
  const result = mutationQueue.then(operation, operation);
  mutationQueue = result.then(() => undefined, () => undefined);
  return result;
}

export function enqueueOfflineAttendance(item: Omit<OfflineQueueItem, 'id' | 'created_at'>): Promise<OfflineQueueItem> {
  return mutateQueue(async () => {
    const { queue, version } = await readQueue();
    const newItem: OfflineQueueItem = { ...item, id: 'offline_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7), created_at: new Date().toISOString() };
    await writeQueue([...queue, newItem], version);
    return newItem;
  });
}

export function removeOfflineQueueItem(id: string): Promise<void> {
  return mutateQueue(async () => {
    const { queue, version } = await readQueue();
    const item = queue.find(q => q.id === id);
    // Persist first: a failed write must leave both queue and photo recoverable.
    await writeQueue(queue.filter(q => q.id !== id), version);
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
