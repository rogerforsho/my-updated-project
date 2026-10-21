-- WORK SCHEDULES
-- Required for late status determination per FR-ATT-007
-- Late status requires an assigned schedule; a total-hour goal alone cannot determine lateness
create table work_schedules (
  schedule_id uuid primary key default extensions.uuid_generate_v4(),
  company_id uuid not null references companies(company_id) on delete cascade,
  day_of_week int not null check (day_of_week between 1 and 5), -- 1=Mon, 5=Fri (no weekends per FR-ATT-005)
  time_in_start time not null,
  time_in_cutoff time not null, -- after this time = late
  time_out time not null,
  created_at timestamptz not null default now()
);
create index idx_work_schedules_company_id on work_schedules(company_id);

-- RLS for work schedules
alter table work_schedules enable row level security;

create policy "coordinator_manage_schedules" on work_schedules
  for all using (get_my_role() in ('Coordinator', 'Admin'));

create policy "supervisor_read_schedules" on work_schedules
  for select using (
    exists (
      select 1 from supervisors s
      where s.company_id = work_schedules.company_id
        and s.user_id = auth.uid()
    )
  );

create policy "student_read_own_schedule" on work_schedules
  for select using (
    exists (
      select 1 from student_assignments sa
      join students st on st.student_id = sa.student_id
      where sa.company_id = work_schedules.company_id
        and st.user_id = auth.uid()
        and sa.assignment_status = 'active'
    )
  );

-- QR TOKENS
-- Server-issued, short-lived tokens for attendance validation per FR-QR-001
create table qr_tokens (
  token_id uuid primary key default extensions.uuid_generate_v4(),
  token text not null unique,
  company_id uuid not null references companies(company_id) on delete cascade,
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used boolean not null default false
);
create index idx_qr_tokens_token on qr_tokens(token);
create index idx_qr_tokens_expires_at on qr_tokens(expires_at);

alter table qr_tokens enable row level security;

create policy "coordinator_manage_qr" on qr_tokens
  for all using (get_my_role() in ('Coordinator', 'Admin'));

-- Students need read access to validate QR tokens during Time In
create policy "student_read_qr_for_validation" on qr_tokens
  for select using (get_my_role() = 'Student');

-- ATTENDANCE write policies
create policy "student_insert_attendance" on attendance
  for insert with check (student_id = get_my_student_id());

create policy "student_update_own_attendance" on attendance
  for update using (
    student_id = get_my_student_id()
    and verification_status = 'pending'
    and sync_status != 'conflict'
  );

create policy "supervisor_update_verification" on attendance
  for update using (
    exists (
      select 1 from student_assignments sa
      where sa.student_id = attendance.student_id
        and sa.supervisor_id = get_my_supervisor_id()
    )
  );
