-- COMPANIES: only coordinator/admin can insert, update
create policy "coordinator_insert_company" on companies
  for insert with check (get_my_role() in ('Coordinator', 'Admin'));

create policy "coordinator_update_company" on companies
  for update using (get_my_role() in ('Coordinator', 'Admin'));

-- SUPERVISORS: only coordinator/admin can insert, update
create policy "coordinator_insert_supervisor" on supervisors
  for insert with check (get_my_role() in ('Coordinator', 'Admin'));

create policy "coordinator_update_supervisor" on supervisors
  for update using (get_my_role() in ('Coordinator', 'Admin'));

-- STUDENT ASSIGNMENTS: only coordinator can insert, update
create policy "coordinator_insert_assignment" on student_assignments
  for insert with check (get_my_role() = 'Coordinator');

create policy "coordinator_update_assignment" on student_assignments
  for update using (get_my_role() = 'Coordinator');

-- USERS: coordinator/admin can update account_status only (approval/rejection)
create policy "coordinator_update_user_status" on users
  for update using (get_my_role() in ('Coordinator', 'Admin'));
