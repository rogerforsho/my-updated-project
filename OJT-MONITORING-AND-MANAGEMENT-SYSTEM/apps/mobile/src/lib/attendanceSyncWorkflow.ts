export interface QueuedAttendanceEvent {
  id: string;
  type: 'time_in' | 'time_out';
  student_id: string;
  assignment_id: string;
  attendance_id?: string;
  local_photo_uri: string;
  captured_at: string;
  attendance_date: string;
  latitude?: number | null;
  longitude?: number | null;
  distance_meters?: number | null;
  location_status?: 'verified' | 'flagged_out_of_bounds' | 'location_unavailable' | 'not_applicable';
  flag_reason?: string | null;
}

export interface SyncResult {
  syncedCount: number;
  errors: string[];
}

interface AttendanceSnapshot {
  attendance_id: string;
  time_in?: string | null;
  time_out?: string | null;
}

export interface AttendanceSyncAdapter {
  findTimeIn(studentId: string, attendanceDate: string): Promise<{ data: AttendanceSnapshot | null; error?: unknown }>;
  uploadSelfie(item: QueuedAttendanceEvent): Promise<string | null>;
  insertTimeIn(payload: Record<string, unknown>): Promise<{ error?: { message?: string } | null }>;
  findTimeOut(item: QueuedAttendanceEvent, studentId: string): Promise<{ data: AttendanceSnapshot | null; error?: unknown }>;
  updateTimeOut(item: QueuedAttendanceEvent, storagePath: string): Promise<{ updated: boolean; error?: { message?: string } | null }>;
  removeQueueItem(id: string): Promise<void>;
  now(): string;
}

function sameInstant(left: string | null | undefined, right: string): boolean {
  const leftTime = left ? new Date(left).getTime() : NaN;
  const rightTime = new Date(right).getTime();
  return Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime === rightTime;
}

function conflictMessage(item: QueuedAttendanceEvent, kind: 'time in' | 'time out'): string {
  return `A different ${kind} attendance record already exists for ${item.attendance_date}. Your pending record and evidence remain on this device. Contact your OJT Coordinator to resolve it; the existing server record was not changed.`;
}

/** Runs retry and conflict decisions independently from device and Supabase APIs. */
export async function syncAttendanceWorkflow(
  queuedItems: QueuedAttendanceEvent[],
  studentId: string,
  adapter: AttendanceSyncAdapter
): Promise<SyncResult> {
  let syncedCount = 0;
  const errors: string[] = [];

  for (const item of queuedItems) {
    try {
      if (item.type === 'time_in') {
        const { data: existing, error: lookupError } = await adapter.findTimeIn(studentId, item.attendance_date);
        if (lookupError) { errors.push('Could not check existing attendance.'); continue; }
        if (existing) {
          if (sameInstant(existing.time_in, item.captured_at)) {
            await adapter.removeQueueItem(item.id);
            syncedCount++;
          } else errors.push(conflictMessage(item, 'time in'));
          continue;
        }

        const storagePath = await adapter.uploadSelfie(item);
        if (!storagePath) {
          errors.push(`Failed to upload photo evidence for record on ${item.attendance_date}`);
          continue;
        }
        const { error: insertError } = await adapter.insertTimeIn({
          student_id: item.student_id,
          assignment_id: item.assignment_id,
          attendance_date: item.attendance_date,
          time_in: item.captured_at,
          time_in_selfie_path: storagePath,
          verification_status: 'pending',
          late_status: 'unknown',
          sync_status: 'synced',
          time_in_lat: item.latitude ?? null,
          time_in_lng: item.longitude ?? null,
          time_in_distance_meters: item.distance_meters ?? null,
          time_in_location_status: item.location_status ?? 'verified',
          time_in_flag_reason: item.flag_reason ?? null,
          synced_at: adapter.now(),
        });
        if (insertError) {
          errors.push(`Failed to sync database record for ${item.attendance_date}: ${insertError.message || 'unknown database error'}`);
          continue;
        }
        await adapter.removeQueueItem(item.id);
        syncedCount++;
      } else {
        const { data: existing, error: lookupError } = await adapter.findTimeOut(item, studentId);
        if (lookupError || !existing) {
          errors.push(`No attendance record found for ${item.attendance_date}; Time Out remains queued.`);
          continue;
        }
        if (existing.time_out) {
          if (sameInstant(existing.time_out, item.captured_at)) {
            await adapter.removeQueueItem(item.id);
            syncedCount++;
          } else errors.push(conflictMessage(item, 'time out'));
          continue;
        }

        const storagePath = await adapter.uploadSelfie(item);
        if (!storagePath) {
          errors.push(`Failed to upload time out photo for record on ${item.attendance_date}`);
          continue;
        }
        const { updated, error: updateError } = await adapter.updateTimeOut(item, storagePath);
        if (updateError) {
          errors.push(`Failed to update time out for ${item.attendance_date}: ${updateError.message || 'unknown database error'}`);
          continue;
        }
        if (!updated) {
          errors.push(`No open attendance record found for ${item.attendance_date}; Time Out remains queued.`);
          continue;
        }
        await adapter.removeQueueItem(item.id);
        syncedCount++;
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'Unknown sync error');
    }
  }

  return { syncedCount, errors };
}
