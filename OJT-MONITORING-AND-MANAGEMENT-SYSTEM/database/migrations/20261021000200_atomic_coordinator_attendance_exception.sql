BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$ BEGIN
  IF to_regprocedure('public.ojt_security_revision()') IS NULL
     OR public.ojt_security_revision() < 42
     OR to_regprocedure('private.get_my_role()') IS NULL
     OR to_regprocedure('private.staff_has_student(uuid)') IS NULL
     OR to_regclass('public.attendance') IS NULL
     OR to_regclass('public.audit_logs') IS NULL THEN
    RAISE EXCEPTION 'Apply and verify authorization and migrations through revision 42 first';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.coordinator_decide_attendance_exception(
  p_attendance_id uuid,
  p_verification_status text,
  p_override_reason text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
  v_actor_role text;
  v_actor_status text;
  v_student_id uuid;
  v_current_status text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'An authenticated OJT Coordinator is required' USING ERRCODE = '42501';
  END IF;

  SELECT u.role, u.account_status
    INTO v_actor_role, v_actor_status
    FROM public.users u
   WHERE u.user_id = auth.uid();
  IF v_actor_role IS DISTINCT FROM 'Coordinator' OR v_actor_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'An active OJT Coordinator is required' USING ERRCODE = '42501';
  END IF;

  IF p_verification_status IS NULL OR p_verification_status NOT IN ('verified', 'rejected') THEN
    RAISE EXCEPTION 'Invalid attendance decision' USING ERRCODE = '22023';
  END IF;
  IF p_override_reason IS NULL OR length(btrim(p_override_reason)) NOT BETWEEN 10 AND 1000 THEN
    RAISE EXCEPTION 'Attendance exception reason must contain 10 to 1000 characters' USING ERRCODE = '22023';
  END IF;

  SELECT a.student_id, a.verification_status
    INTO v_student_id, v_current_status
    FROM public.attendance a
   WHERE a.attendance_id = p_attendance_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Attendance record not found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT private.staff_has_student(v_student_id) THEN
    RAISE EXCEPTION 'Attendance is outside the Coordinator department grants' USING ERRCODE = '42501';
  END IF;
  IF v_current_status <> 'pending' THEN
    RAISE EXCEPTION 'Attendance was already reviewed' USING ERRCODE = '23505';
  END IF;

  UPDATE public.attendance
     SET verification_status = p_verification_status,
         updated_at = clock_timestamp()
   WHERE attendance_id = p_attendance_id;

  INSERT INTO public.audit_logs(actor_user_id, action, entity_type, entity_id, details)
  VALUES (
    auth.uid(),
    'ATTENDANCE_EXCEPTION_' || upper(p_verification_status),
    'attendance',
    p_attendance_id,
    jsonb_build_object(
      'student_id', v_student_id,
      'previous_status', 'pending',
      'new_status', p_verification_status,
      'override_reason', btrim(p_override_reason)
    )
  );

  RETURN p_attendance_id;
END;
$$;

REVOKE ALL ON FUNCTION public.coordinator_decide_attendance_exception(uuid, text, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.coordinator_decide_attendance_exception(uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.ojt_security_revision()
RETURNS integer LANGUAGE sql IMMUTABLE AS $$ SELECT 43 $$;
REVOKE ALL ON FUNCTION public.ojt_security_revision() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ojt_security_revision() TO service_role;

COMMIT;
