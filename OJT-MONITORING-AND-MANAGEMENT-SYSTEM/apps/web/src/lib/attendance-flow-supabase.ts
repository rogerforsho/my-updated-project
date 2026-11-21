import { AUTO_TIME_OUT_REASON } from '@ojt/shared';
import type { getServiceClient } from '@/src/lib/supabase/service';
import { validateUploadedBytes } from '@/src/lib/uploadValidation';
import type { AttendanceAdapter, AttendanceRow } from './attendance-flow';
import type { AttendancePolicy } from './attendance-recording';

const MAX_SELFIE_SIZE = 5 * 1024 * 1024;
type Service = ReturnType<typeof getServiceClient>;

/** Supabase + storage implementation of AttendanceAdapter. */
export function supabaseAttendanceAdapter(service: Service): AttendanceAdapter {
  return {
    async hasValidSelfie(path) {
      const storage = service.storage.from('attendance-selfies');
      const { data: metadata, error: infoError } = await storage.info(path);
      if (infoError || !metadata || typeof metadata.size !== 'number' || !Number.isSafeInteger(metadata.size) || metadata.size < 1 ||
          metadata.size > MAX_SELFIE_SIZE || metadata.contentType !== 'image/jpeg') return false;
      const { data: file, error: downloadError } = await storage.download(path);
      if (downloadError || !file) return false;
      const checked = validateUploadedBytes(new Uint8Array(await file.arrayBuffer()), path, file.type, ['.jpg'], MAX_SELFIE_SIZE);
      return !checked.error && Boolean(checked.data);
    },

    async loadPolicy(studentId, assignmentId, attendanceDate): Promise<AttendancePolicy | 'unavailable' | null> {
      const { data: assignment, error: assignmentError } = await service.from('student_assignments')
        .select('assignment_id, company_id, branch_id, start_date, end_date')
        .eq('assignment_id', assignmentId).eq('student_id', studentId).maybeSingle();
      if (assignmentError) return 'unavailable';
      if (!assignment) return null;
      if (assignment.start_date > attendanceDate || (assignment.end_date && assignment.end_date < attendanceDate)) return null;

      const { data: company, error: companyError } = await service.from('company_branches')
        .select('latitude, longitude, geofence_radius_meters, geofence_enabled')
        .eq('company_id', assignment.company_id).eq('branch_id', assignment.branch_id).maybeSingle();
      if (companyError) return 'unavailable';
      if (!company) return null;

      const { data: schedule, error: scheduleError } = await service.from('practicum_schedules')
        .select('work_modality, time_in, work_days')
        .eq('student_id', studentId)
        .eq('company_id', assignment.company_id)
        .eq('branch_id', assignment.branch_id)
        .eq('status', 'approved')
        .lte('start_date', attendanceDate)
        .or(`end_date.is.null,end_date.gte.${attendanceDate}`)
        .order('start_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (scheduleError) return 'unavailable';

      const latitude = company.latitude == null ? null : Number(company.latitude);
      const longitude = company.longitude == null ? null : Number(company.longitude);
      return {
        companyId: assignment.company_id,
        remote: schedule?.work_modality === 'remote',
        geofenceEnabled: company.geofence_enabled === true,
        latitude: Number.isFinite(latitude) ? latitude : null,
        longitude: Number.isFinite(longitude) ? longitude : null,
        radiusMeters: Number(company.geofence_radius_meters) || 150,
        schedule: schedule ? { timeIn: schedule.time_in, workDays: schedule.work_days } : null,
      };
    },

    async findByDate(studentId, attendanceDate) {
      const { data, error } = await service.from('attendance').select('attendance_id')
        .eq('student_id', studentId).eq('attendance_date', attendanceDate).maybeSingle();
      if (error) throw error;
      return data;
    },

    async insertTimeIn(row) {
      const { data, error } = await service.from('attendance').insert(row).select('attendance_id').single();
      return error || !data ? null : data.attendance_id;
    },

    async findForTimeOut(studentId, attendanceDate, attendanceId) {
      let query = service.from('attendance')
        .select('attendance_id, assignment_id, time_in, time_out, time_out_flag_reason, verification_status')
        .eq('student_id', studentId).eq('attendance_date', attendanceDate);
      if (attendanceId) query = query.eq('attendance_id', attendanceId);
      const { data, error } = await query.maybeSingle();
      if (error) throw error;
      return data as AttendanceRow | null;
    },

    async writeTimeOut(studentId, record, patch, replacing) {
      let update = service.from('attendance').update(patch)
        .eq('student_id', studentId).eq('attendance_id', record.attendance_id);
      update = replacing
        ? update.eq('verification_status', 'pending').eq('time_out', record.time_out!).eq('time_out_flag_reason', AUTO_TIME_OUT_REASON)
        : update.is('time_out', null);
      const { data, error } = await update.select('attendance_id').maybeSingle();
      if (error) throw error;
      return Boolean(data);
    },
  };
}
