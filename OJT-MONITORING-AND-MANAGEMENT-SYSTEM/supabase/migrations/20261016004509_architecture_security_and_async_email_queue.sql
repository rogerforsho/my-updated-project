-- Additive security and operations improvements.
-- Apply after the existing 035 and dated October 12 migrations.
BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$ BEGIN
  IF to_regprocedure('public.ojt_security_revision()') IS NULL
     OR public.ojt_security_revision() < 34 THEN
    RAISE EXCEPTION 'Apply and verify migrations through revision 34 first';
  END IF;
END $$;

-- Attendance evidence stays private and can only be read through an authenticated
-- signed URL when the caller may read the attendance record that references it.
DO $$ BEGIN
  UPDATE storage.buckets
  SET public = false, file_size_limit = 5242880
  WHERE id = 'attendance-selfies';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Expected attendance-selfies Storage bucket was not found';
  END IF;
END $$;

DROP POLICY IF EXISTS "Allow public/authenticated read for attendance-selfies" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view attendance selfies" ON storage.objects;
DROP POLICY IF EXISTS attendance_selfies_scoped_select ON storage.objects;
CREATE POLICY attendance_selfies_scoped_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'attendance-selfies'
    AND EXISTS (
      SELECT 1 FROM public.attendance a
      WHERE (a.time_in_selfie_path = storage.objects.name
         OR a.time_out_selfie_path = storage.objects.name)
        AND (
          a.student_id = public.get_my_student_id()
          OR public.get_my_role() IN ('Coordinator', 'Admin')
          OR (public.get_my_role() = 'ProgramHead' AND public.program_head_can_read_student(a.student_id))
          OR (public.get_my_role() = 'Supervisor' AND public.supervisor_has_active_student(a.student_id))
        )
    )
  );

DROP POLICY IF EXISTS attendance_selfies_write_boundary ON storage.objects;
CREATE POLICY attendance_selfies_write_boundary ON storage.objects
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id <> 'attendance-selfies'
    OR (
      (storage.foldername(name))[1] = (SELECT s.student_id::text FROM public.students s WHERE s.user_id = auth.uid())
      OR public.get_my_role() IN ('Coordinator', 'Admin')
    )
  );
DROP POLICY IF EXISTS attendance_selfies_update_boundary ON storage.objects;
CREATE POLICY attendance_selfies_update_boundary ON storage.objects
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (
    bucket_id <> 'attendance-selfies'
    OR (
      (storage.foldername(name))[1] = (SELECT s.student_id::text FROM public.students s WHERE s.user_id = auth.uid())
      OR public.get_my_role() IN ('Coordinator', 'Admin')
    )
  )
  WITH CHECK (
    bucket_id <> 'attendance-selfies'
    OR (
      (storage.foldername(name))[1] = (SELECT s.student_id::text FROM public.students s WHERE s.user_id = auth.uid())
      OR public.get_my_role() IN ('Coordinator', 'Admin')
    )
  );

-- ---------------------------------------------------------------------------
-- Queue account-review email only after the state change, notification, and
-- audit row are ready to commit. Queue tables stay outside the public API.
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgmq;
DO $$ BEGIN
  PERFORM pgmq.create('transactional_emails');
END $$;

REVOKE ALL ON SCHEMA pgmq FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON ALL TABLES IN SCHEMA pgmq FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA pgmq FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.review_student_registration(
  p_user_id uuid,
  p_status text,
  p_reason text DEFAULT NULL
)
RETURNS TABLE(result_status text, notification_created boolean, email_queued boolean)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET row_security = off AS $$
DECLARE
  v_actor public.users%ROWTYPE;
  v_target record;
  v_reason text := nullif(left(trim(coalesce(p_reason, '')), 1000), '');
  v_message text;
  v_queue_id bigint;
BEGIN
  IF auth.uid() IS NULL OR p_user_id IS NULL OR p_status IS NULL
     OR p_status NOT IN ('active', 'rejected') THEN
    RETURN QUERY SELECT 'invalid_request', false, false;
    RETURN;
  END IF;

  SELECT * INTO v_actor FROM public.users u
  WHERE u.user_id = auth.uid() AND u.account_status = 'active'
    AND u.role IN ('Coordinator', 'Admin', 'ProgramHead');
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'forbidden', false, false;
    RETURN;
  END IF;

  SELECT s.student_id, s.course, u.user_id, u.full_name, u.email
    INTO v_target
  FROM public.users u
  JOIN public.students s ON s.user_id = u.user_id
  WHERE u.user_id = p_user_id AND u.role = 'Student' AND u.account_status = 'pending'
  FOR UPDATE OF u;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_found', false, false;
    RETURN;
  END IF;

  IF v_actor.role = 'ProgramHead'
     AND NOT public.program_head_can_read_student(v_target.student_id) THEN
    RETURN QUERY SELECT 'forbidden', false, false;
    RETURN;
  END IF;

  IF p_status = 'active' AND NOT EXISTS (
    SELECT 1 FROM auth.users au
    WHERE au.id = p_user_id AND au.email_confirmed_at IS NOT NULL
  ) THEN
    RETURN QUERY SELECT 'email_unconfirmed', false, false;
    RETURN;
  END IF;

  UPDATE public.users u
  SET account_status = p_status, updated_at = now()
  WHERE u.user_id = p_user_id AND u.role = 'Student' AND u.account_status = 'pending';
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_found', false, false;
    RETURN;
  END IF;

  v_message := CASE WHEN p_status = 'active'
    THEN 'Account Verified: Welcome to CdM OJT! Please submit your pre-deployment requirements via the mobile app to unlock company assignment and daily attendance.'
    ELSE 'Registration Not Approved: ' || CASE WHEN v_reason IS NOT NULL
      THEN 'Please review the coordinator feedback in your account.'
      ELSE 'Please consult your Institute OJT Coordinator.' END
  END;
  INSERT INTO public.notifications(receiver_user_id, message, status, notification_date)
  VALUES (p_user_id, v_message, 'unread', now());

  INSERT INTO public.audit_logs(actor_user_id, action, entity_type, entity_id, details)
  VALUES (
    v_actor.user_id,
    CASE WHEN p_status = 'active' THEN 'STUDENT_REGISTRATION_APPROVED' ELSE 'STUDENT_REGISTRATION_REJECTED' END,
    'user', p_user_id::text,
    jsonb_build_object('status', p_status, 'reason', v_reason, 'student_id', v_target.student_id)
  );

  SELECT pgmq.send('transactional_emails', jsonb_build_object(
    'type', 'account_status',
    'to', v_target.email,
    'fullName', left(coalesce(nullif(v_target.full_name, ''), 'Trainee'), 200),
    'status', p_status,
    'reason', v_reason
  )) INTO v_queue_id;
  IF v_queue_id IS NULL THEN
    RAISE EXCEPTION 'Account status email could not be queued';
  END IF;

  RETURN QUERY SELECT 'ok', true, true;
END;
$$;
REVOKE ALL ON FUNCTION public.review_student_registration(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_student_registration(uuid, text, text) TO authenticated;

-- Worker-only wrappers: the queue schema itself is not exposed to clients.
CREATE OR REPLACE FUNCTION public.read_transactional_email_queue(p_batch_size integer DEFAULT 10)
RETURNS TABLE(msg_id bigint, read_ct integer, message jsonb)
LANGUAGE sql SECURITY DEFINER
SET search_path = public SET row_security = off AS $$
  SELECT q.msg_id, q.read_ct, q.message
  FROM pgmq.read('transactional_emails', 60, greatest(1, least(coalesce(p_batch_size, 10), 25))) q;
$$;
CREATE OR REPLACE FUNCTION public.delete_transactional_email(p_msg_id bigint)
RETURNS boolean LANGUAGE sql SECURITY DEFINER
SET search_path = public SET row_security = off AS $$
  SELECT pgmq.delete('transactional_emails', p_msg_id);
$$;
CREATE OR REPLACE FUNCTION public.archive_transactional_email(p_msg_id bigint)
RETURNS boolean LANGUAGE sql SECURITY DEFINER
SET search_path = public SET row_security = off AS $$
  SELECT pgmq.archive('transactional_emails', p_msg_id);
$$;
REVOKE ALL ON FUNCTION public.read_transactional_email_queue(integer), public.delete_transactional_email(bigint), public.archive_transactional_email(bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.read_transactional_email_queue(integer), public.delete_transactional_email(bigint), public.archive_transactional_email(bigint) TO service_role;

-- ---------------------------------------------------------------------------
-- Password-reset code replacement is serialized per user and commits the old
-- code invalidation with insertion of the new code.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enqueue_supervisor_welcome_email(
  p_email text,
  p_full_name text,
  p_company_name text,
  p_position text,
  p_employee_number text
)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET row_security = off AS $$
DECLARE
  v_queue_id bigint;
BEGIN
  IF nullif(trim(p_email), '') IS NULL OR length(p_email) > 320
     OR nullif(trim(p_full_name), '') IS NULL OR length(p_full_name) > 200
     OR nullif(trim(p_company_name), '') IS NULL OR length(p_company_name) > 200
     OR nullif(trim(p_position), '') IS NULL OR length(p_position) > 120
     OR nullif(trim(p_employee_number), '') IS NULL OR length(p_employee_number) > 50 THEN
    RAISE EXCEPTION 'Invalid supervisor welcome email request';
  END IF;

  SELECT pgmq.send('transactional_emails', jsonb_build_object(
    'type', 'supervisor_welcome',
    'to', lower(trim(p_email)),
    'fullName', trim(p_full_name),
    'companyName', trim(p_company_name),
    'position', trim(p_position),
    'employeeNumber', trim(p_employee_number)
  )) INTO v_queue_id;
  IF v_queue_id IS NULL THEN
    RAISE EXCEPTION 'Supervisor welcome email could not be queued';
  END IF;
  RETURN v_queue_id;
END;
$$;
REVOKE ALL ON FUNCTION public.enqueue_supervisor_welcome_email(text, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_supervisor_welcome_email(text, text, text, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.issue_password_reset_otp(
  p_user_id uuid,
  p_email text,
  p_otp_hash text,
  p_otp text,
  p_expires_at timestamptz
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET row_security = off AS $$
DECLARE
  v_otp_id uuid;
  v_full_name text;
  v_queue_id bigint;
BEGIN
  IF p_user_id IS NULL OR p_email IS NULL OR p_otp_hash IS NULL OR p_otp IS NULL
     OR p_expires_at IS NULL OR p_otp_hash !~ '^[0-9a-f]{64}$'
     OR p_otp !~ '^[0-9]{6}$'
     OR p_expires_at <= now() OR p_expires_at > now() + interval '15 minutes' THEN
    RAISE EXCEPTION 'Invalid password reset OTP request';
  END IF;

  SELECT u.full_name INTO v_full_name FROM public.users u
  WHERE u.user_id = p_user_id AND lower(u.email) = lower(p_email)
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Password reset account is unavailable';
  END IF;

  UPDATE public.password_reset_otps o SET used = true
  WHERE lower(o.email) = lower(p_email) AND o.used = false;

  INSERT INTO public.password_reset_otps(user_id, email, otp_hash, expires_at, attempts, used)
  VALUES (p_user_id, lower(p_email), p_otp_hash, p_expires_at, 0, false)
  RETURNING id INTO v_otp_id;

  SELECT pgmq.send('transactional_emails', jsonb_build_object(
    'type', 'password_reset',
    'otpId', v_otp_id,
    'to', lower(p_email),
    'fullName', left(coalesce(nullif(v_full_name, ''), 'Colegio de Montalban User'), 200),
    'otp', p_otp,
    'expiresMinutes', greatest(1, least(15, ceil(extract(epoch FROM (p_expires_at - now())) / 60)::integer))
  )) INTO v_queue_id;
  IF v_queue_id IS NULL THEN
    RAISE EXCEPTION 'Password reset email could not be queued';
  END IF;
  RETURN v_otp_id;
END;
$$;
REVOKE ALL ON FUNCTION public.issue_password_reset_otp(uuid, text, text, text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.issue_password_reset_otp(uuid, text, text, text, timestamptz) TO service_role;

-- Preserve user-token RLS for the staff workflows that previously relied on
-- service-role attendance updates and company deletion.
DROP POLICY IF EXISTS coordinator_admin_update_attendance ON public.attendance;
CREATE POLICY coordinator_admin_update_attendance ON public.attendance
  FOR UPDATE TO authenticated
  USING (public.get_my_role() IN ('Coordinator', 'Admin'))
  WITH CHECK (public.get_my_role() IN ('Coordinator', 'Admin'));

DROP POLICY IF EXISTS coordinator_admin_delete_companies ON public.companies;
CREATE POLICY coordinator_admin_delete_companies ON public.companies
  FOR DELETE TO authenticated
  USING (public.get_my_role() IN ('Coordinator', 'Admin'));
GRANT DELETE ON public.companies TO authenticated;

-- ---------------------------------------------------------------------------
-- Enforce the shared schedule policy at the database boundary and calculate
-- hours there, ignoring client-supplied daily/weekly totals.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_schedule_lunch_interval()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET row_security = off AS $$
DECLARE
  v_validate boolean := false;
  v_unique_days integer := 0;
  v_daily_minutes numeric := 0;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_validate := true;
  ELSE
    v_validate := ROW(NEW.work_days, NEW.time_in, NEW.time_out, NEW.lunch_break_minutes, NEW.lunch_break_start)
      IS DISTINCT FROM ROW(OLD.work_days, OLD.time_in, OLD.time_out, OLD.lunch_break_minutes, OLD.lunch_break_start);
  END IF;

  IF NOT v_validate THEN
    NEW.daily_hours := OLD.daily_hours;
    NEW.weekly_hours := OLD.weekly_hours;
    RETURN NEW;
  END IF;

  SELECT count(DISTINCT day_number) INTO v_unique_days
  FROM unnest(NEW.work_days) AS days(day_number);
  IF cardinality(NEW.work_days) < 1 OR cardinality(NEW.work_days) > 6
     OR v_unique_days <> cardinality(NEW.work_days)
     OR NOT (NEW.work_days <@ ARRAY[1,2,3,4,5,6]) THEN
    RAISE EXCEPTION 'Work days must be distinct Monday through Saturday values';
  END IF;
  IF NEW.time_in < time '06:00' OR NEW.time_out > time '21:00' OR NEW.time_out <= NEW.time_in
     OR NEW.lunch_break_minutes < 0 OR NEW.lunch_break_minutes > 120
     OR NEW.lunch_break_minutes > extract(epoch FROM (NEW.time_out - NEW.time_in)) / 60 THEN
    RAISE EXCEPTION 'Invalid shift or lunch duration';
  END IF;
  IF NEW.lunch_break_minutes > 0 AND NEW.lunch_break_start IS NULL THEN
    RAISE EXCEPTION 'Lunch start time is required when lunch duration is greater than zero';
  END IF;
  IF NEW.lunch_break_minutes = 0 AND NEW.lunch_break_start IS NOT NULL THEN
    RAISE EXCEPTION 'Lunch start time is not allowed when lunch duration is zero';
  END IF;
  IF NEW.lunch_break_start IS NOT NULL AND
     (NEW.lunch_break_start < NEW.time_in OR
      NEW.lunch_break_start + make_interval(mins => NEW.lunch_break_minutes) > NEW.time_out) THEN
    RAISE EXCEPTION 'Lunch interval must fit within the scheduled shift';
  END IF;

  v_daily_minutes := extract(epoch FROM (NEW.time_out - NEW.time_in)) / 60 - NEW.lunch_break_minutes;
  IF v_daily_minutes <= 0 OR v_daily_minutes > 480
     OR v_daily_minutes * cardinality(NEW.work_days) > 2400 THEN
    RAISE EXCEPTION 'Schedule exceeds the eight-hour daily or forty-hour weekly limit';
  END IF;
  NEW.daily_hours := round(v_daily_minutes / 60, 2);
  NEW.weekly_hours := round((v_daily_minutes * cardinality(NEW.work_days)) / 60, 2);
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS validate_schedule_lunch_interval ON public.practicum_schedules;
CREATE TRIGGER validate_schedule_lunch_interval
  BEFORE INSERT OR UPDATE ON public.practicum_schedules
  FOR EACH ROW EXECUTE FUNCTION public.validate_schedule_lunch_interval();
REVOKE ALL ON FUNCTION public.validate_schedule_lunch_interval() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.ojt_security_revision()
RETURNS integer LANGUAGE sql STABLE SET search_path = public AS $$ SELECT 35 $$;
REVOKE ALL ON FUNCTION public.ojt_security_revision() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ojt_security_revision() TO service_role;

COMMIT;
