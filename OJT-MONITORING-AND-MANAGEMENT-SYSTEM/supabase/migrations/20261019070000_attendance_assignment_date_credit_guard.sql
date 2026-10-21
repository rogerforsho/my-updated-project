BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$ BEGIN
  IF to_regprocedure('public.ojt_security_revision()') IS NULL
     OR public.ojt_security_revision() < 39 THEN
    RAISE EXCEPTION 'Apply and verify registration resubmission revision 39 first';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.guard_attendance_assignment_date_credit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET row_security = off AS $$
BEGIN
  IF NEW.verification_status = 'verified' AND NOT EXISTS (
    SELECT 1 FROM public.student_assignments sa
    WHERE sa.assignment_id = NEW.assignment_id
      AND sa.student_id = NEW.student_id
      AND NEW.attendance_date BETWEEN sa.start_date AND coalesce(sa.end_date, 'infinity'::date)
  ) THEN
    NEW.credited_hours := 0;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_attendance_assignment_date_credit() FROM PUBLIC, anon, authenticated;

-- Run after the snapshot trigger so invalid dates override its elapsed-hour fallback.
DROP TRIGGER IF EXISTS zz_attendance_assignment_date_credit_guard ON public.attendance;
CREATE TRIGGER zz_attendance_assignment_date_credit_guard
  BEFORE INSERT OR UPDATE OF assignment_id, student_id, attendance_date, time_in, time_out, verification_status, credited_hours
  ON public.attendance
  FOR EACH ROW EXECUTE FUNCTION public.guard_attendance_assignment_date_credit();

UPDATE public.attendance a
SET verification_status = a.verification_status
WHERE a.verification_status = 'verified'
  AND a.credited_hours IS DISTINCT FROM 0
  AND NOT EXISTS (
    SELECT 1 FROM public.student_assignments sa
    WHERE sa.assignment_id = a.assignment_id
      AND sa.student_id = a.student_id
      AND a.attendance_date BETWEEN sa.start_date AND coalesce(sa.end_date, 'infinity'::date)
  );

CREATE OR REPLACE FUNCTION public.ojt_security_revision()
RETURNS integer LANGUAGE sql STABLE SET search_path = public AS $$ SELECT 40 $$;
REVOKE ALL ON FUNCTION public.ojt_security_revision() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ojt_security_revision() TO service_role;

COMMIT;
