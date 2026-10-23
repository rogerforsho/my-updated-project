import 'server-only';
import { createClient as createSupabaseClient, type SupabaseClient, type User } from '@supabase/supabase-js';

type BffTable<
  Row extends Record<string, unknown>,
  Insert extends Record<string, unknown> = Partial<Row>,
  Update extends Record<string, unknown> = Partial<Row>,
> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

type MobileAttendanceRow = {
  attendance_id: string;
  student_id: string;
  assignment_id: string;
  attendance_date: string;
  time_in: string;
  time_out: string | null;
  time_in_selfie_path: string;
  time_out_selfie_path: string | null;
  verification_status: 'pending' | 'verified' | 'rejected';
  late_status: 'on_time' | 'late' | 'unknown';
  sync_status: 'synced' | 'pending_sync' | 'conflict';
  time_in_lat: number | null;
  time_in_lng: number | null;
  time_in_distance_meters: number | null;
  time_in_location_status: string;
  time_in_flag_reason: string | null;
  time_out_lat: number | null;
  time_out_lng: number | null;
  time_out_distance_meters: number | null;
  time_out_location_status: string | null;
  time_out_flag_reason: string | null;
  synced_at: string | null;
  updated_at: string;
}

interface MobileBffDatabase {
  public: {
    Tables: {
      certificates: BffTable<{ certificate_id: string; student_id: string }>;
      users: BffTable<{ user_id: string; role: string; account_status: string }>;
      students: BffTable<{ student_id: string; user_id: string }>;
      student_assignments: BffTable<{
        assignment_id: string;
        student_id: string;
        company_id: string;
        assignment_status: string;
      }>;
      work_schedules: BffTable<{ company_id: string; day_of_week: number; time_in_cutoff: string }>;
      attendance: BffTable<
        MobileAttendanceRow,
        Partial<MobileAttendanceRow> & Pick<MobileAttendanceRow,
          'student_id' | 'assignment_id' | 'attendance_date' | 'time_in' | 'time_in_selfie_path' | 'verification_status' | 'late_status' | 'sync_status'>,
        Partial<MobileAttendanceRow>
      >;
      reports: BffTable<
        { report_id: string; student_id: string; report_type: string; file_path: string; status: string; remarks: string | null },
        { student_id: string; report_type: string; file_path: string; status: string; remarks?: string | null }
      >;
      notifications: BffTable<
        { notification_id: string; receiver_user_id: string; status: 'unread' | 'read' },
        Partial<{ notification_id: string; receiver_user_id: string; status: 'unread' | 'read' }>,
        { status?: 'unread' | 'read' }
      >;
      company_requests: BffTable<
        { request_id: string; student_id: string; submitted_by: string; status: string; created_at: string },
        { student_id: string; submitted_by: string; requested_company_name: string; company_address: string; contact_person: string; contact_email: string; contact_number: string; requested_branch_name: string; branch_address: string; business_permit_path?: string | null; moa_path?: string | null }
      >;
      incident_reports: BffTable<
        { incident_id: string; student_id: string; submitted_by: string; category: string; status: string; created_at: string },
        { student_id: string; submitted_by: string; category: string; description: string }
      >;
    };
    Views: Record<never, never>;
    Functions: Record<never, never>;
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
}

export type MobileSupabaseClient = SupabaseClient<MobileBffDatabase>;

interface MobileActor {
  supabase: MobileSupabaseClient;
  user: User;
  studentId: string;
}

type MobileActorResult =
  | { actor: MobileActor; error: null }
  | { actor: null; error: { status: number; code: string; message: string } };

export async function authenticateMobileStudent(
  request: Request,
  requiredStatus: 'active' | 'rejected' = 'active'
): Promise<MobileActorResult> {
  const authorization = request.headers.get('authorization');
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key)
    return { actor: null, error: { status: 503, code: 'SERVER_FAILURE', message: 'The student API is temporarily unavailable.' } };
  if (!token)
    return { actor: null, error: { status: 401, code: 'UNAUTHORIZED', message: 'Sign in again before continuing.' } };

  const supabase = createSupabaseClient<MobileBffDatabase>(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user)
    return { actor: null, error: { status: 401, code: 'UNAUTHORIZED', message: 'Your session expired. Sign in again.' } };

  const { data: profile, error: profileError } = await supabase.from('users')
    .select('role, account_status').eq('user_id', user.id).maybeSingle();
  if (profileError || profile?.role !== 'Student' || profile.account_status !== requiredStatus)
    return { actor: null, error: { status: 403, code: 'FORBIDDEN', message: requiredStatus === 'rejected' ? 'A rejected student registration is required.' : 'An active student account is required.' } };

  const { data: student, error: studentError } = await supabase.from('students')
    .select('student_id').eq('user_id', user.id).maybeSingle();
  if (studentError || !student)
    return { actor: null, error: { status: 404, code: 'NOT_FOUND', message: 'Student profile not found.' } };

  return { actor: { supabase, user, studentId: student.student_id }, error: null };
}

export function mobileBffFailure(error: { status: number; code: string; message: string }) {
  return Response.json(
    { data: null, error: { code: error.code, message: error.message } },
    { status: error.status, headers: { 'Cache-Control': 'no-store' } }
  );
}
