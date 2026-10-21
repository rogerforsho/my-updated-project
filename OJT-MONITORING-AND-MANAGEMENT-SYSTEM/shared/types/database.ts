import type { UserRole, AccountStatus } from './roles';

export type { UserRole, AccountStatus };

export type StudentStatus = 'active' | 'completed' | 'dropped' | 'failed' | 'withdrawn';
export type AssignmentStatus = 'active' | 'completed' | 'terminated' | 'reassigned';

export interface DbUser {
  user_id: string;
  full_name: string;
  email: string;
  role: UserRole;
  account_status: AccountStatus;
  employee_number?: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbStudent {
  student_id: string;
  user_id: string;
  student_number: string;
  course: string;
  year_level: number;
  required_hours: number | null;
  status: StudentStatus;
  id_card_path?: string | null;
  id_card_front_path?: string | null;
  id_card_back_path?: string | null;
  users?: DbUser;
}

export type WorkModality = 'on_site' | 'hybrid' | 'remote';
export type PracticumScheduleStatus = 'pending' | 'approved' | 'rejected' | 'modified';

export interface DbPracticumSchedule {
  schedule_id: string;
  student_id: string;
  company_id: string | null;
  branch_id?: string | null;
  custom_company_name: string | null;
  work_modality: WorkModality;
  work_days: number[];
  time_in: string;
  time_out: string;
  lunch_break_minutes: number;
  lunch_break_start: string | null;
  daily_hours: number;
  weekly_hours: number;
  start_date: string;
  end_date: string | null;
  status: PracticumScheduleStatus;
  student_notes: string | null;
  coordinator_feedback: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
  students?: DbStudent & { users?: DbUser };
  companies?: DbCompany;
}

export interface DbCoordinator {
  coordinator_id: string;
  user_id: string;
  department: string;
}

export interface DbSupervisor {
  supervisor_id: string;
  user_id: string;
  company_id: string;
  position: string;
  users?: DbUser;
  companies?: DbCompany;
}

export interface DbProgramHead {
  program_head_id: string;
  user_id: string;
  department_or_program: string;
}

export interface DbAdmin {
  admin_id: string;
  user_id: string;
}

export interface DbCompany {
  company_id: string;
  company_name: string;
  address: string;
  contact_person: string;
  contact_email: string;
  contact_number: string;
  status: string;
  latitude?: number | null;
  longitude?: number | null;
  geofence_radius_meters?: number;
  geofence_enabled?: boolean;
  created_at: string;
  updated_at: string;
}

export interface DbCompanyBranch {
  branch_id: string;
  company_id: string;
  branch_name: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  geofence_radius_meters: number;
  geofence_enabled: boolean;
  is_primary: boolean;
  status: 'active' | 'inactive';
}

export type CompanyRequestStatus = 'pending' | 'approved' | 'rejected';

export interface DbCompanyRequest {
  request_id: string;
  student_id: string;
  requested_company_name: string;
  company_address: string;
  contact_person: string;
  contact_email: string;
  contact_number: string;
  requested_branch_name: string;
  branch_address: string;
  business_permit_path: string | null;
  moa_path: string | null;
  status: CompanyRequestStatus;
  feedback: string | null;
  company_id: string | null;
  branch_id: string | null;
  created_at: string;
}

export interface DbStudentAssignment {
  assignment_id: string;
  student_id: string;
  company_id: string;
  branch_id: string;
  supervisor_id: string;
  start_date: string;
  end_date: string | null;
  assignment_status: AssignmentStatus;
  created_at: string;
}

export type QrValidationStatus = 'valid' | 'invalid' | 'expired';
export type VerificationStatus = 'pending' | 'verified' | 'rejected';
export type LateStatus = 'on_time' | 'late' | 'unknown';
export type SyncStatus = 'synced' | 'pending_sync' | 'conflict';
export type LocationStatus = 'verified' | 'flagged_out_of_bounds' | 'location_unavailable' | 'not_applicable';

export interface DbAttendance {
  attendance_id: string;
  student_id: string;
  assignment_id: string;
  attendance_date: string;
  time_in: string;
  time_out: string | null;
  time_in_selfie_path: string;
  time_out_selfie_path: string | null;
  qr_validation_status?: QrValidationStatus;
  verification_status: VerificationStatus;
  late_status: LateStatus;
  sync_status: SyncStatus;
  time_in_lat?: number | null;
  time_in_lng?: number | null;
  time_in_distance_meters?: number | null;
  time_in_location_status?: LocationStatus;
  time_in_flag_reason?: string | null;
  time_out_lat?: number | null;
  time_out_lng?: number | null;
  time_out_distance_meters?: number | null;
  time_out_location_status?: LocationStatus;
  time_out_flag_reason?: string | null;
  time_in_received_at?: string | null;
  time_out_received_at?: string | null;
  synced_at?: string | null;
  created_at: string;
  updated_at: string;
}

export type ReportStatus = 'submitted' | 'reviewed' | 'approved' | 'rejected';

export interface DbReport {
  report_id: string;
  student_id: string;
  report_type: string;
  file_path: string;
  submission_date: string;
  status: ReportStatus;
  remarks: string | null;
  supervisor_feedback?: string | null;
  supervisor_endorsed_at?: string | null;
  supervisor_decision?: 'approved' | 'returned' | null;
  supervisor_decided_by?: string | null;
  supervisor_decided_at?: string | null;
  created_at: string;
  updated_at: string;
}

export type EvaluationType = 'midterm' | 'final';

export interface DbEvaluation {
  evaluation_id: string;
  student_id: string;
  supervisor_id: string;
  performance_score: number | null;
  feedback: string;
  evaluation_date: string;
  evaluation_type?: EvaluationType;
  rubric_scores?: Record<string, number> | null;
  created_at: string;
}

export type EvaluationAppealStatus = 'pending' | 'upheld' | 'adjusted';

export interface DbEvaluationAppeal {
  appeal_id: string;
  evaluation_id: string;
  student_id: string;
  submitted_by: string;
  appeal_reason: string;
  supporting_details: string | null;
  status: EvaluationAppealStatus;
  decision_reason: string | null;
  resolved_score: number | null;
  decided_by: string | null;
  decided_at: string | null;
  created_at: string;
}

export type NotificationStatus = 'unread' | 'read';

export interface DbNotification {
  notification_id: string;
  sender_user_id: string | null;
  receiver_user_id: string;
  message: string;
  notification_date: string;
  status: NotificationStatus;
  related_conversation_id?: string | null;
}

export type ProgressStatus = 'not_started' | 'in_progress' | 'completed';

export interface DbInternshipProgress {
  progress_id: string;
  student_id: string;
  completed_hours: number;
  remaining_hours: number;
  progress_status: ProgressStatus;
  updated_at: string;
}

export interface DbAnnouncement {
  announcement_id: string;
  author_user_id: string | null;
  title: string;
  content: string;
  target_role: string;
  target_department: string;
  created_at: string;
}

export type CertificateStatus = 'active' | 'revoked';

export interface DbCertificate {
  certificate_id: string;
  student_id: string;
  verification_code: string;
  hours_rendered: number;
  host_company_name: string;
  academic_year: string;
  status: CertificateStatus;
  revocation_reason?: string | null;
  issued_at: string;
  finalized_at?: string;
  issued_by_user_id?: string | null;
}

