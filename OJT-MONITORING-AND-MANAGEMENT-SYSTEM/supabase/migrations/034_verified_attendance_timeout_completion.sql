-- Allow one late time-out submission after supervisor verification.
-- Without this narrow exception, RLS blocks the time-out and the lunch credit
-- snapshot cannot be completed for records verified before time-out.
BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$ BEGIN
  IF to_regprocedure('public.ojt_security_revision()') IS NULL
     OR public.ojt_security_revision() < 32 THEN
    RAISE EXCEPTION 'Apply and verify migrations 029-033 first';
  END IF;
END $$;

DROP POLICY IF EXISTS student_complete_verified_attendance_timeout ON public.attendance;
CREATE POLICY student_complete_verified_attendance_timeout ON public.attendance
  FOR UPDATE TO authenticated
  USING (
    public.get_my_role() = 'Student'
    AND student_id = public.get_my_student_id()
    AND verification_status = 'verified'
    AND time_out IS NULL
    AND sync_status IS DISTINCT FROM 'conflict'
  )
  WITH CHECK (
    public.get_my_role() = 'Student'
    AND student_id = public.get_my_student_id()
    AND verification_status = 'verified'
    AND time_out IS NOT NULL
    AND sync_status IS DISTINCT FROM 'conflict'
  );

-- The existing BEFORE trigger still limits the student to time-out/evidence
-- fields and calculates credited_hours; readiness must require this policy.
CREATE OR REPLACE FUNCTION public.ojt_security_revision()
RETURNS integer LANGUAGE sql STABLE SET search_path = public AS $$ SELECT 33 $$;
REVOKE ALL ON FUNCTION public.ojt_security_revision() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ojt_security_revision() TO service_role;

COMMIT;
