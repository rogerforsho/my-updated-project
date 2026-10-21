BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$ BEGIN
  IF to_regprocedure('public.ojt_security_revision()') IS NULL
     OR public.ojt_security_revision() < 40 THEN
    RAISE EXCEPTION 'Apply and verify migrations through revision 40 first';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.require_attendance_review_after_time_out()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.time_out IS DISTINCT FROM OLD.time_out AND NEW.time_out IS NOT NULL THEN
    NEW.verification_status := 'pending';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.require_attendance_review_after_time_out() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS require_attendance_review_after_time_out ON public.attendance;
CREATE TRIGGER require_attendance_review_after_time_out
  BEFORE UPDATE OF time_out ON public.attendance
  FOR EACH ROW EXECUTE FUNCTION public.require_attendance_review_after_time_out();

CREATE OR REPLACE FUNCTION public.ojt_security_revision()
RETURNS integer LANGUAGE sql IMMUTABLE AS $$ SELECT 41 $$;
REVOKE ALL ON FUNCTION public.ojt_security_revision() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ojt_security_revision() TO service_role;

COMMIT;
