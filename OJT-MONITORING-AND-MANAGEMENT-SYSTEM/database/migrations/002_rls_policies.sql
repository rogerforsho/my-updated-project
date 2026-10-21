-- Enable RLS on all sensitive tables
alter table users enable row level security;
alter table students enable row level security;
alter table coordinators enable row level security;
alter table supervisors enable row level security;
alter table program_heads enable row level security;
alter table admins enable row level security;
alter table companies enable row level security;
alter table student_assignments enable row level security;
alter table attendance enable row level security;
alter table reports enable row level security;
alter table evaluations enable row level security;
alter table notifications enable row level security;
alter table internship_progress enable row level security;

-- Helper: get current user's role
create or replace function get_my_role()
returns text language sql security definer stable as $$
  select role from users where user_id = auth.uid()
$$;

-- Helper: get current user's student_id
create or replace function get_my_student_id()
returns uuid language sql security definer stable as $$
  select student_id from students where user_id = auth.uid()
$$;

-- Helper: get current user's supervisor_id
create or replace function get_my_supervisor_id()
returns uuid language sql security definer stable as $$
  select supervisor_id from supervisors where user_id = auth.uid()
$$;

-- USERS
create policy "users_read_own" on users
  for select using (user_id = auth.uid());

create policy "coordinator_admin_read_users" on users
  for select using (get_my_role() in ('Coordinator','Admin'));

-- STUDENTS
create policy "student_read_own" on students
  for select using (user_id = auth.uid());

create policy "coordinator_read_students" on students
  for select using (get_my_role() in ('Coordinator','Admin','ProgramHead'));

-- STUDENT ASSIGNMENTS
create policy "student_read_own_assignment" on student_assignments
  for select using (student_id = get_my_student_id());

create policy "supervisor_read_assigned" on student_assignments
  for select using (supervisor_id = get_my_supervisor_id());

create policy "coordinator_read_assignments" on student_assignments
  for select using (get_my_role() in ('Coordinator','Admin','ProgramHead'));

-- ATTENDANCE
create policy "student_read_own_attendance" on attendance
  for select using (student_id = get_my_student_id());

create policy "supervisor_read_assigned_attendance" on attendance
  for select using (
    exists (
      select 1 from student_assignments sa
      where sa.student_id = attendance.student_id
        and sa.supervisor_id = get_my_supervisor_id()
    )
  );

create policy "coordinator_read_attendance" on attendance
  for select using (get_my_role() in ('Coordinator','Admin'));

-- REPORTS
create policy "student_read_own_reports" on reports
  for select using (student_id = get_my_student_id());

create policy "coordinator_read_reports" on reports
  for select using (get_my_role() in ('Coordinator','Admin'));

-- EVALUATIONS
create policy "supervisor_read_own_evaluations" on evaluations
  for select using (supervisor_id = get_my_supervisor_id());

create policy "coordinator_read_evaluations" on evaluations
  for select using (get_my_role() in ('Coordinator','Admin','ProgramHead'));

-- NOTIFICATIONS
create policy "read_own_notifications" on notifications
  for select using (receiver_user_id = auth.uid());

-- INTERNSHIP PROGRESS
create policy "student_read_own_progress" on internship_progress
  for select using (student_id = get_my_student_id());

create policy "coordinator_read_progress" on internship_progress
  for select using (get_my_role() in ('Coordinator','Admin','ProgramHead'));

-- COMPANIES
create policy "read_active_companies" on companies
  for select using (
    status = 'active' or get_my_role() in ('Coordinator','Admin')
  );
