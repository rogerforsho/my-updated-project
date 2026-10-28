-- Demo data for LOCAL Supabase only, to eyeball search/paging on long lists.
-- Every row is tagged: users @demo.local, companies "DEMO ...", audit details {"demo":true}.
-- Run:   docker exec -i supabase_db_cdm-ojt-test-local psql -U postgres -d postgres < scripts/seed-demo-data.sql
-- Undo:  docker exec -i supabase_db_cdm-ojt-test-local psql -U postgres -d postgres < scripts/clear-demo-data.sql
-- Demo users have no login (no auth row); sign in with the *@local.test accounts to see the lists.
-- Needs the three *@local.test accounts from scripts/seed-local-accounts.mjs.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL session_replication_role = replica; -- skip guard/notify triggers; we seed rows the app would normally create

-- Clear any earlier demo run first (same statements as clear-demo-data.sql).
DELETE FROM non_working_days    WHERE label LIKE 'DEMO %';
DELETE FROM evaluation_appeals WHERE student_id IN (SELECT student_id FROM students s JOIN users u USING (user_id) WHERE u.email LIKE '%@demo.local');
DELETE FROM incident_reports   WHERE student_id IN (SELECT student_id FROM students s JOIN users u USING (user_id) WHERE u.email LIKE '%@demo.local');
DELETE FROM company_requests   WHERE student_id IN (SELECT student_id FROM students s JOIN users u USING (user_id) WHERE u.email LIKE '%@demo.local');
DELETE FROM evaluations        WHERE student_id IN (SELECT student_id FROM students s JOIN users u USING (user_id) WHERE u.email LIKE '%@demo.local');
DELETE FROM student_assignments WHERE student_id IN (SELECT student_id FROM students s JOIN users u USING (user_id) WHERE u.email LIKE '%@demo.local');
DELETE FROM reports            WHERE file_path LIKE 'demo/%';
DELETE FROM audit_logs         WHERE details->>'demo' = 'true';
DELETE FROM students           WHERE user_id IN (SELECT user_id FROM users WHERE email LIKE '%@demo.local');
DELETE FROM supervisors        WHERE user_id IN (SELECT user_id FROM users WHERE email LIKE '%@demo.local');
DELETE FROM users              WHERE email LIKE '%@demo.local';
DELETE FROM companies          WHERE company_name LIKE 'DEMO %';

DO $$
DECLARE
  coord_user uuid := (SELECT user_id FROM users WHERE email = 'coordinator@local.test');
  admin_user uuid := (SELECT user_id FROM users WHERE email = 'admin@local.test');
  local_sup  uuid := (SELECT s.supervisor_id FROM supervisors s JOIN users u USING (user_id) WHERE u.email = 'supervisor@local.test');
  local_co   uuid := (SELECT company_id FROM supervisors WHERE supervisor_id = (SELECT s.supervisor_id FROM supervisors s JOIN users u USING (user_id) WHERE u.email = 'supervisor@local.test'));
  local_br   uuid;
  courses text[] := ARRAY['BSIT','BSBA','BSCS','BSA'];
  rtypes text[] := ARRAY['Pre-OJT Orientation Certificate','Endorsement Letter','Daily Journal','Weekly Progress','Accomplishment Report'];
  cats text[] := ARRAY['harassment','safety','supervisor_conduct','workplace_condition','other'];
  i int; d int; cid uuid; bid uuid; uid uuid; sid uuid; eid uuid; supid uuid;
  co_ids uuid[] := '{}'; br_ids uuid[] := '{}'; sup_ids uuid[] := '{}'; st_ids uuid[] := '{}'; st_users uuid[] := '{}'; ev_ids uuid[] := '{}';
BEGIN
  IF coord_user IS NULL OR admin_user IS NULL OR local_sup IS NULL THEN
    RAISE EXCEPTION 'Run scripts/seed-local-accounts.mjs first (admin/coordinator/supervisor @local.test missing).';
  END IF;
  SELECT branch_id INTO local_br FROM company_branches WHERE company_id = local_co ORDER BY is_primary DESC LIMIT 1;

  -- 60 companies (+ primary branch each)
  FOR i IN 1..60 LOOP
    INSERT INTO companies (company_name, address, contact_person, contact_email, contact_number, status, latitude, longitude, geofence_enabled)
    VALUES ('DEMO Company ' || lpad(i::text, 3, '0'), i || ' Demo Street, Rodriguez, Rizal', 'Contact Person ' || i,
            'contact' || i || '@demo.local', '09' || lpad(i::text, 9, '0'),
            CASE WHEN i % 10 = 0 THEN 'inactive' ELSE 'active' END,
            14.70 + i * 0.001, 121.13 + i * 0.001, i % 3 = 0)
    RETURNING company_id INTO cid;
    INSERT INTO company_branches (company_id, branch_name, address, latitude, longitude, geofence_radius_meters, geofence_enabled, is_primary)
    VALUES (cid, 'Main Branch', i || ' Demo Street, Rodriguez, Rizal', 14.70 + i * 0.001, 121.13 + i * 0.001, 50, i % 3 = 0, true)
    RETURNING branch_id INTO bid;
    co_ids := co_ids || cid; br_ids := br_ids || bid;
  END LOOP;

  -- 30 demo supervisors spread over the first 30 companies
  FOR i IN 1..30 LOOP
    INSERT INTO users (full_name, email, role, account_status) VALUES ('Demo Supervisor ' || lpad(i::text, 3, '0'), 'sup' || i || '@demo.local', 'Supervisor', 'active')
    RETURNING user_id INTO uid;
    INSERT INTO supervisors (user_id, company_id, position) VALUES (uid, co_ids[i], 'Demo Position ' || i) RETURNING supervisor_id INTO supid;
    sup_ids := sup_ids || supid;
  END LOOP;

  -- 90 demo students; a few non-active so Admin -> Users shows every status
  FOR i IN 1..90 LOOP
    INSERT INTO users (full_name, email, role, account_status)
    VALUES ('Demo Student ' || lpad(i::text, 3, '0'), 'student' || i || '@demo.local', 'Student',
            CASE WHEN i % 15 = 0 THEN 'pending' WHEN i % 20 = 0 THEN 'inactive' ELSE 'active' END)
    RETURNING user_id INTO uid;
    INSERT INTO students (user_id, student_number, course, year_level, required_hours)
    VALUES (uid, 'DEMO-' || lpad(i::text, 4, '0'), courses[1 + i % 4], 4, 486) RETURNING student_id INTO sid;
    st_ids := st_ids || sid; st_users := st_users || uid;
  END LOOP;

  -- students 1-50 -> the local supervisor; 51-90 -> demo supervisors
  FOR i IN 1..90 LOOP
    IF i <= 50 THEN
      INSERT INTO student_assignments (student_id, company_id, supervisor_id, start_date, branch_id) VALUES (st_ids[i], local_co, local_sup, current_date - 60, local_br);
    ELSE
      INSERT INTO student_assignments (student_id, company_id, supervisor_id, start_date, branch_id)
      VALUES (st_ids[i], co_ids[1 + (i % 30)], sup_ids[1 + (i % 30)], current_date - 60, br_ids[1 + (i % 30)]);
    END IF;
  END LOOP;

  -- 45 evaluations by the local supervisor (midterm/final mix)
  FOR i IN 1..45 LOOP
    INSERT INTO evaluations (student_id, supervisor_id, performance_score, feedback, evaluation_date, evaluation_type)
    VALUES (st_ids[i], local_sup, 70 + (i * 7) % 30, 'Demo feedback for trainee ' || i || '.', current_date - i, CASE WHEN i % 2 = 0 THEN 'final' ELSE 'midterm' END)
    RETURNING evaluation_id INTO eid;
    ev_ids := ev_ids || eid;
  END LOOP;
  -- a few demo-supervisor evaluations so the coordinator list has other supervisors
  FOR i IN 51..70 LOOP
    INSERT INTO evaluations (student_id, supervisor_id, performance_score, feedback, evaluation_date, evaluation_type)
    VALUES (st_ids[i], sup_ids[1 + (i % 30)], 75 + i % 20, 'Demo feedback ' || i, current_date - i, 'final');
  END LOOP;

  -- Schedules (Mon-Fri, 8h), hours, and ~3 weeks of attendance for the first 60 students.
  -- Every 6th student has no attendance in the last 10 days; every 7th skips a day now and then (absent rows).
  FOR i IN 1..60 LOOP
    INSERT INTO practicum_schedules (student_id, company_id, work_modality, work_days, time_in, time_out, lunch_break_minutes, daily_hours, weekly_hours, start_date, status)
    VALUES (st_ids[i], CASE WHEN i <= 50 THEN local_co ELSE co_ids[1 + (i % 30)] END, 'on_site', ARRAY[1,2,3,4,5], '08:00', '17:00', 60, 8, 40, current_date - 60, 'approved');
    INSERT INTO internship_progress (student_id, completed_hours, remaining_hours, progress_status)
    VALUES (st_ids[i], CASE WHEN i BETWEEN 41 AND 45 THEN 486 ELSE 40 + i * 5 END, CASE WHEN i BETWEEN 41 AND 45 THEN 0 ELSE 486 - (40 + i * 5) END,
            CASE WHEN i BETWEEN 41 AND 45 THEN 'completed' ELSE 'in_progress' END);
    FOR d IN 1..21 LOOP
      CONTINUE WHEN extract(isodow FROM current_date - d) > 5;
      CONTINUE WHEN i % 6 = 0 AND d <= 10;
      CONTINUE WHEN i % 7 = 0 AND d % 4 = 0;
      INSERT INTO attendance (student_id, assignment_id, attendance_date, time_in, time_out, time_in_selfie_path, time_out_selfie_path, late_status, verification_status, credited_hours, time_in_location_status)
      SELECT st_ids[i], a.assignment_id, current_date - d,
             (current_date - d) + time '08:00' + ((i + d) % 40 || ' minutes')::interval,
             (current_date - d) + time '17:00', 'demo/in.png', CASE WHEN d % 5 = 0 THEN NULL ELSE 'demo/out.png' END,
             CASE WHEN (i + d) % 9 = 0 THEN 'late' ELSE 'on_time' END, 'verified', 8,
             CASE WHEN (i + d) % 11 = 0 THEN 'flagged_out_of_bounds' ELSE 'verified' END
      FROM student_assignments a WHERE a.student_id = st_ids[i] AND a.assignment_status = 'active';
    END LOOP;
  END LOOP;
  -- Students 41-45 finished: completed placement with the full 486 hours (graduated).
  UPDATE student_assignments SET assignment_status = 'completed', end_date = current_date - 1 WHERE student_id = ANY (st_ids[41:45]);

  -- Holidays: two national, one department, one company.
  INSERT INTO non_working_days (day_date, scope, label, created_by) VALUES
    (current_date + 30, 'global', 'DEMO National Holiday A', admin_user), (current_date + 45, 'global', 'DEMO National Holiday B', admin_user);
  INSERT INTO non_working_days (day_date, scope, department, label, created_by) VALUES (current_date + 20, 'department', 'ICS', 'DEMO ICS Foundation Day', coord_user);
  INSERT INTO non_working_days (day_date, scope, department, company_id, label, created_by) VALUES (current_date + 25, 'company', 'ICS', local_co, 'DEMO Company Outing', coord_user);

  -- 18 appeals: 14 pending, 4 decided
  FOR i IN 1..18 LOOP
    IF i <= 14 THEN
      INSERT INTO evaluation_appeals (evaluation_id, student_id, submitted_by, appeal_reason)
      VALUES (ev_ids[i], st_ids[i], st_users[i], 'Demo appeal reason number ' || i || ': I believe my score should be reviewed.');
    ELSE
      INSERT INTO evaluation_appeals (evaluation_id, student_id, submitted_by, appeal_reason, status, decision_reason, decided_by, decided_at)
      VALUES (ev_ids[i], st_ids[i], st_users[i], 'Demo appeal reason number ' || i || ': please review my evaluation.', 'upheld', 'Original evaluation stands.', coord_user, now());
    END IF;
  END LOOP;

  -- 120 submitted documents (statuses mixed)
  FOR i IN 1..120 LOOP
    INSERT INTO reports (student_id, report_type, file_path, submission_date, status)
    VALUES (st_ids[1 + i % 90], rtypes[1 + i % 5], 'demo/' || i || '.pdf', now() - (i || ' hours')::interval,
            (ARRAY['submitted','approved','rejected','reviewed'])[1 + i % 4]);
  END LOOP;

  -- 32 incident reports (students 1-32; first 22 open)
  FOR i IN 1..32 LOOP
    IF i <= 22 THEN
      INSERT INTO incident_reports (student_id, submitted_by, category, description, created_at)
      VALUES (st_ids[i], st_users[i], cats[1 + i % 5], 'Demo incident description number ' || i || ' for testing.', now() - (i || ' hours')::interval);
    ELSE
      INSERT INTO incident_reports (student_id, submitted_by, category, description, status, coordinator_response, reviewed_by, reviewed_at, created_at)
      VALUES (st_ids[i], st_users[i], cats[1 + i % 5], 'Demo incident description number ' || i || ' for testing.', 'closed', 'Resolved with the company.', coord_user, now(), now() - (i || ' hours')::interval);
    END IF;
  END LOOP;

  -- 35 pending HTE requests
  FOR i IN 1..35 LOOP
    INSERT INTO company_requests (student_id, submitted_by, requested_company_name, company_address, contact_person, contact_email, contact_number, requested_branch_name, branch_address)
    VALUES (st_ids[1 + i % 90], st_users[1 + i % 90], 'DEMO Requested Company ' || lpad(i::text, 3, '0'), i || ' Request Ave, Rizal', 'Request Contact ' || i,
            'req' || i || '@demo.local', '09' || lpad(i::text, 9, '0'), 'Request Branch ' || i, i || ' Request Ave, Rizal');
  END LOOP;

  -- 120 audit events
  FOR i IN 1..120 LOOP
    INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, details, created_at)
    VALUES (admin_user, (ARRAY['USER_DEACTIVATED','USER_INVITED','ANNOUNCEMENT_CREATED','LOGIN_SUCCESS','COMPANY_UPDATED'])[1 + i % 5],
            (ARRAY['user','announcement','auth','company'])[1 + i % 4], gen_random_uuid()::text, '{"demo":true}', now() - (i * 7 || ' hours')::interval);
  END LOOP;
END $$;

COMMIT;
SELECT 'companies' t, count(*) FROM companies WHERE company_name LIKE 'DEMO %'
UNION ALL SELECT 'users', count(*) FROM users WHERE email LIKE '%@demo.local'
UNION ALL SELECT 'reports', count(*) FROM reports WHERE file_path LIKE 'demo/%'
UNION ALL SELECT 'audit', count(*) FROM audit_logs WHERE details->>'demo' = 'true';
