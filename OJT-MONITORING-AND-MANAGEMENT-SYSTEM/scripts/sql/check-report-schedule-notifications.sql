-- Rolled back. Run: docker exec -i supabase_db_cdm-ojt-test-local psql -U postgres -v ON_ERROR_STOP=1 < scripts/sql/check-report-schedule-notifications.sql
begin;
create temp table _r(check_name text, got int, want int);
do $$
declare s record; before_c int; sid uuid; got int; coord uuid;
begin
  select st.student_id, st.user_id, st.course into s from students st
    join users u on u.user_id = st.user_id and u.account_status = 'active'
    where public.course_department(st.course) = 'ICS' limit 1;
  select u.user_id into coord from users u join staff_capability_grants g on g.user_id = u.user_id
    where u.role = 'Coordinator' and g.capability = 'academic_workflows' and g.revoked_at is null
      and g.department_scope = 'ICS' limit 1;

  -- 1. a submitted pre-deployment document notifies the department's coordinators
  select count(*) into before_c from notifications where receiver_user_id = coord;
  insert into reports(student_id, report_type, file_path, status) values (s.student_id, 'Endorsement Letter', 'x/test.pdf', 'submitted');
  select count(*) - before_c into got from notifications where receiver_user_id = coord;
  insert into _r values ('report submit -> coordinator notified', got, 1);

  -- 1b. a routine daily journal belongs to the Supervisor, not the Coordinator
  select count(*) into before_c from notifications where receiver_user_id = coord;
  insert into reports(student_id, report_type, file_path, status) values (s.student_id, 'Daily Journal', 'x/j.pdf', 'submitted');
  select count(*) - before_c into got from notifications where receiver_user_id = coord;
  insert into _r values ('daily journal -> coordinator NOT notified', got, 0);

  -- 2a. a submitted schedule proposal notifies the department's coordinators
  select count(*) into before_c from notifications where receiver_user_id = coord;
  insert into practicum_schedules(student_id, start_date, status, time_out, lunch_break_minutes) values (s.student_id, current_date, 'pending', '16:00', 0) returning schedule_id into sid;
  select count(*) into got from notifications where receiver_user_id = coord and message ilike '%schedule proposal%' and notification_date >= now();
  insert into _r values ('schedule submit -> coordinator notified', got, 1);
  delete from practicum_schedules where schedule_id = sid;

  -- 2. a rejected schedule proposal notifies the student, with the reason
  insert into practicum_schedules(student_id, start_date, status, time_out, lunch_break_minutes) values (s.student_id, current_date, 'pending', '16:00', 0) returning schedule_id into sid;
  update practicum_schedules set status = 'rejected', coordinator_feedback = 'Please pick on-site days' where schedule_id = sid;
  select count(*) into got from notifications where receiver_user_id = s.user_id and message ilike '%rejected%' and message ilike '%on-site days%';
  insert into _r values ('schedule rejected -> student notified w/ reason', got, 1);
end $$;
select check_name, got, want, case when got = want then 'PASS' else 'FAIL' end result from _r;
rollback;
