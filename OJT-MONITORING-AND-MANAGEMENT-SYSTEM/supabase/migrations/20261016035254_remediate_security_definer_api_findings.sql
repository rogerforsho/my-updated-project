-- Keep privileged authorization helpers outside Supabase's exposed API schema.
-- The private schema must remain absent from the project's exposed API schemas.
BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$ BEGIN
  IF to_regprocedure('public.ojt_security_revision()') IS NULL
     OR public.ojt_security_revision() < 35 THEN
    RAISE EXCEPTION 'Apply and verify migrations through revision 35 first';
  END IF;
END $$;

CREATE SCHEMA IF NOT EXISTS private;
COMMENT ON SCHEMA private IS 'Internal security-definer functions; keep out of Supabase API exposed schemas.';
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA private
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- RLS and Storage policies retain their function dependencies when these
-- routines move schemas. They can still call them because authenticated has
-- schema usage and EXECUTE, while PostgREST exposes only public by default.
ALTER FUNCTION public.can_read_private_document(text) SET SCHEMA private;
ALTER FUNCTION public.get_my_department() SET SCHEMA private;
ALTER FUNCTION public.get_my_role() SET SCHEMA private;
ALTER FUNCTION public.get_my_student_id() SET SCHEMA private;
ALTER FUNCTION public.get_my_supervisor_id() SET SCHEMA private;
ALTER FUNCTION public.program_head_can_read_student(uuid) SET SCHEMA private;
ALTER FUNCTION public.program_head_can_read_user(uuid) SET SCHEMA private;
ALTER FUNCTION public.review_student_registration(uuid, text, text) SET SCHEMA private;
ALTER FUNCTION public.student_owns_active_assignment(uuid, uuid) SET SCHEMA private;
ALTER FUNCTION public.supervisor_has_active_student(uuid) SET SCHEMA private;

REVOKE ALL ON FUNCTION
  private.can_read_private_document(text),
  private.get_my_department(),
  private.get_my_role(),
  private.get_my_student_id(),
  private.get_my_supervisor_id(),
  private.program_head_can_read_student(uuid),
  private.program_head_can_read_user(uuid),
  private.student_owns_active_assignment(uuid, uuid),
  private.supervisor_has_active_student(uuid)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION
  private.can_read_private_document(text),
  private.get_my_department(),
  private.get_my_student_id(),
  private.get_my_supervisor_id(),
  private.program_head_can_read_student(uuid),
  private.program_head_can_read_user(uuid),
  private.student_owns_active_assignment(uuid, uuid),
  private.supervisor_has_active_student(uuid)
TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.get_my_role() TO authenticated;
REVOKE ALL ON FUNCTION private.review_student_registration(uuid, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.review_student_registration(uuid, text, text)
  TO authenticated;

-- Rebind privileged function bodies to private helpers. Function bodies that
-- contain SQL text do not follow a schema move automatically.
CREATE OR REPLACE FUNCTION private.program_head_can_read_user(p_user_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public SET row_security = off AS $$
  SELECT p_user_id = auth.uid() OR EXISTS (
    SELECT 1 FROM public.users u JOIN public.supervisors sp ON sp.user_id = u.user_id
    WHERE u.user_id = p_user_id AND u.role = 'Supervisor' AND u.account_status = 'active'
  ) OR EXISTS (
    SELECT 1 FROM public.students s WHERE s.user_id = p_user_id
      AND private.program_head_can_read_student(s.student_id)
  );
$$;

CREATE OR REPLACE FUNCTION private.supervisor_has_active_student(p_student_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public SET row_security = off AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.student_assignments sa
    WHERE sa.student_id = p_student_id
      AND sa.supervisor_id = private.get_my_supervisor_id()
      AND sa.assignment_status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION private.student_owns_active_assignment(
  p_student_id uuid,
  p_assignment_id uuid
)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public SET row_security = off AS $$
  SELECT p_student_id = private.get_my_student_id() AND EXISTS (
    SELECT 1 FROM public.student_assignments sa
    WHERE sa.assignment_id = p_assignment_id
      AND sa.student_id = p_student_id
      AND sa.assignment_status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION private.can_read_private_document(p_name text)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public SET row_security = off AS $$
  SELECT coalesce(private.get_my_role() IS NOT NULL AND (
    private.get_my_role() IN ('Coordinator', 'Admin')
    OR split_part(p_name, '/', 1) = auth.uid()::text
    OR EXISTS (
      SELECT 1 FROM public.students s
      WHERE split_part(p_name, '/', 1) IN (s.user_id::text, s.student_id::text)
        AND (s.user_id = auth.uid()
          OR private.program_head_can_read_student(s.student_id)
          OR (private.get_my_role() = 'Supervisor' AND EXISTS (
            SELECT 1 FROM public.student_assignments sa
            JOIN public.supervisors sp ON sp.supervisor_id = sa.supervisor_id
            WHERE sa.student_id = s.student_id
              AND sa.assignment_status = 'active'
              AND sp.user_id = auth.uid()
          )))
    )
  ), false);
$$;

CREATE OR REPLACE FUNCTION private.review_student_registration(
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
     AND NOT private.program_head_can_read_student(v_target.student_id) THEN
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

-- Keep the existing browser RPCs as SECURITY INVOKER entry points. The
-- supervisor lookup reads only rows already scoped to the caller by RLS;
-- registration review delegates to the private transaction with role checks.
CREATE OR REPLACE FUNCTION public.get_my_supervisor_id()
RETURNS uuid LANGUAGE sql SECURITY INVOKER STABLE
SET search_path = public AS $$
  SELECT s.supervisor_id
  FROM public.supervisors s
  JOIN public.users u ON u.user_id = s.user_id
  WHERE u.user_id = auth.uid()
    AND u.role = 'Supervisor'
    AND u.account_status = 'active';
$$;
CREATE OR REPLACE FUNCTION public.review_student_registration(
  p_user_id uuid,
  p_status text,
  p_reason text DEFAULT NULL
)
RETURNS TABLE(result_status text, notification_created boolean, email_queued boolean)
LANGUAGE sql SECURITY INVOKER
SET search_path = public AS $$
  SELECT * FROM private.review_student_registration(p_user_id, p_status, p_reason);
$$;
REVOKE ALL ON FUNCTION public.get_my_supervisor_id()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_my_supervisor_id()
  TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.review_student_registration(uuid, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.review_student_registration(uuid, text, text)
  TO authenticated;

-- Preserve the row-write guard after get_my_role moves to private.
CREATE OR REPLACE FUNCTION public.guard_ojt_client_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET row_security = off AS $$
DECLARE actor_role text; before_row jsonb; after_row jsonb; allowed text[];
BEGIN
  IF coalesce(current_setting('role', true), '') NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;
  actor_role := private.get_my_role();
  IF actor_role IS NULL THEN
    RAISE EXCEPTION 'Active account required' USING ERRCODE = '42501';
  END IF;
  after_row := to_jsonb(NEW);
  IF TG_OP = 'UPDATE' THEN
    before_row := to_jsonb(OLD);
    IF (after_row->'student_id') IS DISTINCT FROM (before_row->'student_id')
       OR (after_row->'user_id') IS DISTINCT FROM (before_row->'user_id')
       OR (TG_TABLE_NAME IN ('attendance', 'evaluations') AND
         ((after_row->'assignment_id') IS DISTINCT FROM (before_row->'assignment_id')
          OR (after_row->'supervisor_id') IS DISTINCT FROM (before_row->'supervisor_id'))) THEN
      RAISE EXCEPTION 'Record ownership cannot be changed' USING ERRCODE = '42501';
    END IF;
    IF actor_role = 'Student' AND TG_TABLE_NAME = 'attendance' THEN
      allowed := ARRAY['time_out','time_out_selfie_path','time_out_lat','time_out_lng','time_out_distance_meters','time_out_location_status','time_out_flag_reason','sync_status','synced_at','updated_at'];
      IF after_row - allowed IS DISTINCT FROM before_row - allowed OR OLD.time_out IS NOT NULL THEN
        RAISE EXCEPTION 'Only the first time-out may update a pending attendance record' USING ERRCODE = '42501';
      END IF;
    ELSIF actor_role = 'Supervisor' AND TG_TABLE_NAME = 'attendance' THEN
      allowed := ARRAY['verification_status','updated_at'];
      IF after_row - allowed IS DISTINCT FROM before_row - allowed OR OLD.verification_status <> 'pending' THEN
        RAISE EXCEPTION 'Only pending attendance verification may be changed' USING ERRCODE = '42501';
      END IF;
    ELSIF actor_role = 'Supervisor' AND TG_TABLE_NAME = 'reports' THEN
      allowed := ARRAY['supervisor_feedback','supervisor_endorsed_at','updated_at'];
      IF after_row - allowed IS DISTINCT FROM before_row - allowed THEN
        RAISE EXCEPTION 'Supervisor may change endorsement fields only' USING ERRCODE = '42501';
      END IF;
    ELSIF actor_role = 'Student' AND TG_TABLE_NAME = 'practicum_schedules' THEN
      IF OLD.status <> 'pending' OR NEW.status <> 'pending' OR NEW.reviewed_by IS NOT NULL
         OR NEW.reviewed_at IS NOT NULL OR NEW.coordinator_feedback IS NOT NULL THEN
        RAISE EXCEPTION 'Student cannot review a schedule' USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;
  IF TG_TABLE_NAME = 'attendance' THEN
    IF NEW.time_out IS NOT NULL AND NEW.time_out < NEW.time_in THEN
      RAISE EXCEPTION 'Time-out precedes time-in';
    END IF;
    IF NEW.attendance_date <> (NEW.time_in AT TIME ZONE 'Asia/Manila')::date THEN
      RAISE EXCEPTION 'Attendance date must match time-in in Asia/Manila';
    END IF;
  ELSIF TG_TABLE_NAME = 'evaluations' THEN
    IF NEW.performance_score IS NOT NULL AND NOT (NEW.performance_score >= 0 AND NEW.performance_score <= 100) THEN
      RAISE EXCEPTION 'Evaluation score must be between 0 and 100';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_ojt_client_write() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.ojt_security_revision()
RETURNS integer LANGUAGE sql STABLE SET search_path = public AS $$ SELECT 36 $$;
REVOKE ALL ON FUNCTION public.ojt_security_revision() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ojt_security_revision() TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
