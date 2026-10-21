-- Migration 018: Add RLS policies for Supervisors to read assigned students and their user profiles
-- This ensures that client-side queries or joins from student_assignments -> students -> users resolve cleanly.

-- Allow supervisors to view students assigned to them
create policy "supervisor_read_assigned_students" on students
  for select using (
    exists (
      select 1 from student_assignments sa
      where sa.student_id = students.student_id
        and sa.supervisor_id = get_my_supervisor_id()
    )
  );

-- Allow supervisors to view basic user profile info of students assigned to them
create policy "supervisor_read_assigned_users" on users
  for select using (
    exists (
      select 1 from students s
      join student_assignments sa on sa.student_id = s.student_id
      where s.user_id = users.user_id
        and sa.supervisor_id = get_my_supervisor_id()
    )
  );
