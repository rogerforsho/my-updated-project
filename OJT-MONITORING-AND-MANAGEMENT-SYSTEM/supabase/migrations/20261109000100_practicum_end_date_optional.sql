-- The practicum end date is no longer entered by students; it is projected from the schedule (shared/expectedEnd.ts).
-- A missing end date is now allowed. When one is present (coordinator-entered) the 5-month cap still applies.
-- Approving a schedule without an end date therefore creates an open-ended active assignment; attendance,
-- timecards and the supervisor board already treat a null end_date as "still running".
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.enforce_practicum_window()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v_latest date;
BEGIN
  -- Closing or reassigning an assignment sets end_date = today; never block that.
  IF TG_TABLE_NAME = 'student_assignments' THEN
    IF NEW.assignment_status IS DISTINCT FROM 'active' THEN RETURN NEW; END IF;
  END IF;
  IF NEW.start_date IS NULL OR NEW.end_date IS NULL THEN RETURN NEW; END IF;
  v_latest := (NEW.start_date + interval '5 months')::date;
  IF NEW.end_date > v_latest THEN
    RAISE EXCEPTION 'A practicum can last at most 5 months. For a % start, the latest end date is %.', NEW.start_date, v_latest
      USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.enforce_practicum_window() FROM PUBLIC, anon, authenticated;

COMMIT;
