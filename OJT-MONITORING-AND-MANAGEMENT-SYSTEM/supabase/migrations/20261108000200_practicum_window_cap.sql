-- A practicum can last at most 5 calendar months (CHED CMO 104 / SIPP) and needs an end date.
-- Students and Coordinators can write practicum_schedules / student_assignments straight through RLS,
-- so the cap is enforced here as well as in the app (shared/schedulePolicy.ts, same month-end clamping).
-- Only new rows and changes to the dates are checked: existing rows that are already longer stay loadable,
-- and closing an overlong assignment (status change, end_date = today on completion) is never blocked.
BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$ BEGIN
  IF to_regprocedure('public.ojt_security_revision()') IS NULL OR public.ojt_security_revision() < 44 THEN
    RAISE EXCEPTION 'Apply and verify migrations through revision 44 first';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.enforce_practicum_window()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v_latest date;
BEGIN
  -- Closing or reassigning an assignment sets end_date = today; never block that.
  IF TG_TABLE_NAME = 'student_assignments' THEN
    IF NEW.assignment_status IS DISTINCT FROM 'active' THEN RETURN NEW; END IF;
  END IF;
  IF NEW.start_date IS NULL THEN RETURN NEW; END IF;
  IF NEW.end_date IS NULL THEN
    RAISE EXCEPTION 'Enter the practicum end date. A practicum can last at most 5 months.' USING ERRCODE = '22023';
  END IF;
  v_latest := (NEW.start_date + interval '5 months')::date;
  IF NEW.end_date > v_latest THEN
    RAISE EXCEPTION 'A practicum can last at most 5 months. For a % start, the latest end date is %.', NEW.start_date, v_latest
      USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.enforce_practicum_window() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS enforce_practicum_window ON public.practicum_schedules;
CREATE TRIGGER enforce_practicum_window BEFORE INSERT OR UPDATE OF start_date, end_date ON public.practicum_schedules
  FOR EACH ROW EXECUTE FUNCTION public.enforce_practicum_window();

DROP TRIGGER IF EXISTS enforce_practicum_window ON public.student_assignments;
CREATE TRIGGER enforce_practicum_window BEFORE INSERT OR UPDATE OF start_date, end_date ON public.student_assignments
  FOR EACH ROW EXECUTE FUNCTION public.enforce_practicum_window();

-- Report (do not change) rows that are already over the cap.
DO $$
DECLARE v_schedules integer; v_assignments integer;
BEGIN
  SELECT count(*) INTO v_schedules FROM public.practicum_schedules
    WHERE end_date IS NOT NULL AND end_date > (start_date + interval '5 months')::date;
  SELECT count(*) INTO v_assignments FROM public.student_assignments
    WHERE assignment_status = 'active' AND (end_date IS NULL OR end_date > (start_date + interval '5 months')::date);
  RAISE NOTICE 'Over the 5-month cap or without an end date: % schedule(s), % active assignment(s)', v_schedules, v_assignments;
END $$;

COMMIT;
