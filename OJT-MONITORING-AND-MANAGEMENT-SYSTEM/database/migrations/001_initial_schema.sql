-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- USERS
create table users (
  user_id uuid primary key default extensions.uuid_generate_v4(),
  full_name text not null,
  email text not null unique,
  role text not null check (role in ('Student','Coordinator','Supervisor','ProgramHead','Admin')),
  account_status text not null default 'pending' check (account_status in ('pending','active','rejected','inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_users_email on users(email);
create index idx_users_role on users(role);
create index idx_users_account_status on users(account_status);

-- STUDENTS
create table students (
  student_id uuid primary key default extensions.uuid_generate_v4(),
  user_id uuid not null unique references users(user_id) on delete cascade,
  student_number text not null unique,
  course text not null,
  year_level int not null,
  required_hours int not null,
  status text not null default 'active'
);
create index idx_students_student_number on students(student_number);
create index idx_students_user_id on students(user_id);

-- COORDINATORS
create table coordinators (
  coordinator_id uuid primary key default extensions.uuid_generate_v4(),
  user_id uuid not null unique references users(user_id) on delete cascade,
  department text not null
);

-- SUPERVISORS (company_id FK added after companies table)
create table supervisors (
  supervisor_id uuid primary key default extensions.uuid_generate_v4(),
  user_id uuid not null unique references users(user_id) on delete cascade,
  company_id uuid,
  position text not null
);

-- PROGRAM HEADS
create table program_heads (
  program_head_id uuid primary key default extensions.uuid_generate_v4(),
  user_id uuid not null unique references users(user_id) on delete cascade,
  department_or_program text not null
);

-- ADMINS
create table admins (
  admin_id uuid primary key default extensions.uuid_generate_v4(),
  user_id uuid not null unique references users(user_id) on delete cascade
);

-- COMPANIES
create table companies (
  company_id uuid primary key default extensions.uuid_generate_v4(),
  company_name text not null,
  address text not null,
  contact_person text not null,
  contact_email text not null,
  contact_number text not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_companies_status on companies(status);

-- Add FK from supervisors to companies
alter table supervisors
  add constraint fk_supervisors_company
  foreign key (company_id) references companies(company_id) on delete set null;

-- STUDENT ASSIGNMENTS
create table student_assignments (
  assignment_id uuid primary key default extensions.uuid_generate_v4(),
  student_id uuid not null references students(student_id) on delete cascade,
  company_id uuid not null references companies(company_id) on delete restrict,
  supervisor_id uuid not null references supervisors(supervisor_id) on delete restrict,
  start_date date not null,
  end_date date,
  assignment_status text not null default 'active',
  created_at timestamptz not null default now()
);
create index idx_assignments_student_id on student_assignments(student_id);
create index idx_assignments_company_id on student_assignments(company_id);
create index idx_assignments_supervisor_id on student_assignments(supervisor_id);

-- ATTENDANCE
create table attendance (
  attendance_id uuid primary key default extensions.uuid_generate_v4(),
  student_id uuid not null references students(student_id) on delete cascade,
  assignment_id uuid not null references student_assignments(assignment_id) on delete cascade,
  attendance_date date not null,
  time_in timestamptz not null,
  time_out timestamptz,
  time_in_selfie_path text not null,
  time_out_selfie_path text,
  qr_validation_status text not null check (qr_validation_status in ('valid','invalid','expired')),
  verification_status text not null default 'pending' check (verification_status in ('pending','verified','rejected')),
  late_status text not null default 'unknown' check (late_status in ('on_time','late','unknown')),
  sync_status text not null default 'synced' check (sync_status in ('synced','pending_sync','conflict')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_attendance_student_id on attendance(student_id);
create index idx_attendance_date on attendance(attendance_date);
create index idx_attendance_verification_status on attendance(verification_status);
create index idx_attendance_sync_status on attendance(sync_status);

-- REPORTS
create table reports (
  report_id uuid primary key default extensions.uuid_generate_v4(),
  student_id uuid not null references students(student_id) on delete cascade,
  report_type text not null,
  file_path text not null,
  submission_date timestamptz not null default now(),
  status text not null default 'submitted' check (status in ('submitted','reviewed','approved','rejected')),
  remarks text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_reports_student_id on reports(student_id);
create index idx_reports_status on reports(status);

-- EVALUATIONS
create table evaluations (
  evaluation_id uuid primary key default extensions.uuid_generate_v4(),
  student_id uuid not null references students(student_id) on delete cascade,
  supervisor_id uuid not null references supervisors(supervisor_id) on delete restrict,
  performance_score numeric,
  feedback text not null,
  evaluation_date date not null,
  created_at timestamptz not null default now()
);
create index idx_evaluations_student_id on evaluations(student_id);
create index idx_evaluations_supervisor_id on evaluations(supervisor_id);

-- NOTIFICATIONS
create table notifications (
  notification_id uuid primary key default extensions.uuid_generate_v4(),
  sender_user_id uuid references users(user_id) on delete set null,
  receiver_user_id uuid not null references users(user_id) on delete cascade,
  message text not null,
  notification_date timestamptz not null default now(),
  status text not null default 'unread' check (status in ('unread','read'))
);
create index idx_notifications_receiver_user_id on notifications(receiver_user_id);
create index idx_notifications_status on notifications(status);

-- INTERNSHIP PROGRESS
create table internship_progress (
  progress_id uuid primary key default extensions.uuid_generate_v4(),
  student_id uuid not null unique references students(student_id) on delete cascade,
  completed_hours numeric not null default 0,
  remaining_hours numeric not null default 0,
  progress_status text not null default 'not_started' check (progress_status in ('not_started','in_progress','completed')),
  updated_at timestamptz not null default now()
);
create index idx_progress_student_id on internship_progress(student_id);
