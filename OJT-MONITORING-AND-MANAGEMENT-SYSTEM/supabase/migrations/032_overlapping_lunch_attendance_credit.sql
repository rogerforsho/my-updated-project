-- Apply after 031 and before deploying code that submits lunch break start times.
-- No existing schedule or verified attendance rows are backfilled or recalculated.
BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$ BEGIN
  IF to_regprocedure('public.ojt_security_revision()') IS NULL
     OR public.ojt_security_revision() < 30 THEN
    RAISE EXCEPTION 'Apply and verify migrations 029-031 first';
  END IF;
END $$;

ALTER TABLE public.practicum_schedules
  ADD COLUMN IF NOT EXISTS lunch_break_start time;
ALTER TABLE public.attendance
  ADD COLUMN IF NOT EXISTS credited_hours numeric;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid='public.attendance'::regclass AND conname='attendance_credited_hours_range') THEN
    ALTER TABLE public.attendance ADD CONSTRAINT attendance_credited_hours_range
      CHECK (credited_hours IS NULL OR credited_hours BETWEEN 0 AND 12);
  END IF;
END $$;

-- Validate new/changed schedule timing at the database boundary. Legacy schedules
-- with no lunch start remain readable and can still be updated in review fields.
CREATE OR REPLACE FUNCTION public.validate_schedule_lunch_interval()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public SET row_security=off AS $$
DECLARE
  v_validate boolean := false;
BEGIN
  IF TG_OP='INSERT' THEN
    v_validate := true;
  ELSE
    v_validate := ROW(NEW.time_in, NEW.time_out, NEW.lunch_break_minutes, NEW.lunch_break_start)
      IS DISTINCT FROM ROW(OLD.time_in, OLD.time_out, OLD.lunch_break_minutes, OLD.lunch_break_start);
  END IF;
  IF v_validate THEN
    IF NEW.time_out <= NEW.time_in OR NEW.lunch_break_minutes < 0 OR NEW.lunch_break_minutes > 120
       OR NEW.lunch_break_minutes > extract(epoch FROM (NEW.time_out-NEW.time_in))/60 THEN
      RAISE EXCEPTION 'Invalid shift or lunch duration';
    END IF;
    IF NEW.lunch_break_minutes > 0 AND NEW.lunch_break_start IS NULL THEN
      RAISE EXCEPTION 'Lunch start time is required when lunch duration is greater than zero';
    END IF;
    IF NEW.lunch_break_start IS NOT NULL AND
       (NEW.lunch_break_start < NEW.time_in OR
        NEW.lunch_break_start + make_interval(mins=>NEW.lunch_break_minutes) > NEW.time_out) THEN
      RAISE EXCEPTION 'Lunch interval must fit within the scheduled shift';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS validate_schedule_lunch_interval ON public.practicum_schedules;
CREATE TRIGGER validate_schedule_lunch_interval
  BEFORE INSERT OR UPDATE ON public.practicum_schedules
  FOR EACH ROW EXECUTE FUNCTION public.validate_schedule_lunch_interval();
REVOKE ALL ON FUNCTION public.validate_schedule_lunch_interval() FROM PUBLIC, anon, authenticated;

-- Snapshot a verified session once it has a complete time range. A supervisor may
-- verify the time-in before the student submits time-out; in that case leave the
-- snapshot NULL and calculate it when time_out is added. Schedule edits made later
-- cannot rewrite approved attendance credits; legacy verified rows retain their
-- existing raw-hour calculation because their credited_hours remains NULL.
CREATE OR REPLACE FUNCTION public.snapshot_attendance_credited_hours()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public SET row_security=off AS $$
DECLARE
  v_lunch_start time;
  v_lunch_minutes integer;
  v_time_in_local timestamp;
  v_time_out_local timestamp;
  v_lunch_start_local timestamp;
  v_lunch_end_local timestamp;
  v_overlap_seconds numeric := 0;
  v_elapsed_hours numeric := 0;
  v_recalculate boolean := false;
BEGIN
  IF TG_OP='INSERT' THEN
    NEW.credited_hours := NULL;
    v_recalculate := NEW.verification_status='verified';
  ELSE
    v_recalculate := OLD.verification_status IS DISTINCT FROM NEW.verification_status
      OR OLD.credited_hours IS NULL
      OR ROW(OLD.time_in,OLD.time_out,OLD.attendance_date,OLD.assignment_id,OLD.student_id)
         IS DISTINCT FROM ROW(NEW.time_in,NEW.time_out,NEW.attendance_date,NEW.assignment_id,NEW.student_id);
  END IF;

  IF NEW.verification_status='verified' AND v_recalculate THEN
    IF NEW.time_out IS NULL OR NEW.time_out < NEW.time_in THEN
      NEW.credited_hours := NULL;
      RETURN NEW;
    END IF;

    v_elapsed_hours := extract(epoch FROM (NEW.time_out-NEW.time_in))/3600.0;
    SELECT ps.lunch_break_start, ps.lunch_break_minutes
      INTO v_lunch_start, v_lunch_minutes
    FROM public.practicum_schedules ps
    JOIN public.student_assignments sa
      ON sa.student_id=ps.student_id
     AND sa.assignment_id=NEW.assignment_id
     AND sa.assignment_status='active'
    WHERE ps.student_id=NEW.student_id
      AND ps.status='approved'
      AND NEW.attendance_date BETWEEN ps.start_date AND coalesce(ps.end_date,'infinity'::date)
      AND extract(isodow FROM NEW.attendance_date)::integer = ANY(ps.work_days)
    ORDER BY ps.start_date DESC, ps.reviewed_at DESC NULLS LAST, ps.updated_at DESC
    LIMIT 1;

    IF FOUND AND v_lunch_minutes > 0 AND v_lunch_start IS NOT NULL THEN
      v_time_in_local := NEW.time_in AT TIME ZONE 'Asia/Manila';
      v_time_out_local := NEW.time_out AT TIME ZONE 'Asia/Manila';
      v_lunch_start_local := NEW.attendance_date + v_lunch_start;
      v_lunch_end_local := v_lunch_start_local + make_interval(mins=>v_lunch_minutes);
      v_overlap_seconds := greatest(0,
        extract(epoch FROM (least(v_time_out_local,v_lunch_end_local)-greatest(v_time_in_local,v_lunch_start_local))));
    END IF;

    NEW.credited_hours := greatest(0,least(12,v_elapsed_hours-v_overlap_seconds/3600.0));
  ELSIF TG_OP='UPDATE' AND NEW.verification_status<>'verified' THEN
    NEW.credited_hours := NULL;
  ELSIF TG_OP='UPDATE' THEN
    -- Authenticated clients cannot supply or alter this server-owned snapshot.
    NEW.credited_hours := OLD.credited_hours;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS snapshot_attendance_credited_hours ON public.attendance;
CREATE TRIGGER snapshot_attendance_credited_hours
  BEFORE INSERT OR UPDATE OF verification_status, time_in, time_out, attendance_date,
    assignment_id, student_id, credited_hours ON public.attendance
  FOR EACH ROW EXECUTE FUNCTION public.snapshot_attendance_credited_hours();
REVOKE ALL ON FUNCTION public.snapshot_attendance_credited_hours() FROM PUBLIC, anon, authenticated;

-- Preserve legacy totals where no snapshot exists; new verified rows use the
-- lunch-adjusted snapshot. This migration deliberately does not update old rows.
CREATE OR REPLACE FUNCTION public.recompute_internship_progress()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public SET row_security=off AS $$
DECLARE
  v_student_id uuid;
  v_total_hours numeric := 0;
  v_required_hours numeric := 0;
  v_remaining_hours numeric := 0;
  v_status text := 'not_started';
BEGIN
  v_student_id := coalesce(new.student_id, old.student_id);
  SELECT coalesce(sum(greatest(0,least(12,coalesce(credited_hours,
    extract(epoch FROM (time_out-time_in))/3600.0)))),0)
    INTO v_total_hours
  FROM public.attendance
  WHERE student_id=v_student_id AND verification_status='verified'
    AND time_out IS NOT NULL AND time_out>=time_in;

  SELECT coalesce(required_hours,486) INTO v_required_hours
  FROM public.students WHERE student_id=v_student_id;
  v_remaining_hours := greatest(0,round(v_required_hours-v_total_hours,2));
  v_total_hours := round(v_total_hours,2);

  IF v_total_hours>=v_required_hours AND v_required_hours>0 THEN
    v_status := 'completed';
  ELSIF v_total_hours>0 THEN
    v_status := 'in_progress';
  END IF;

  INSERT INTO public.internship_progress(student_id,completed_hours,remaining_hours,progress_status,updated_at)
  VALUES(v_student_id,v_total_hours,v_remaining_hours,v_status,now())
  ON CONFLICT(student_id) DO UPDATE SET
    completed_hours=excluded.completed_hours, remaining_hours=excluded.remaining_hours,
    progress_status=excluded.progress_status, updated_at=now();
  RETURN coalesce(NEW,OLD);
END;
$$;
REVOKE ALL ON FUNCTION public.recompute_internship_progress() FROM PUBLIC, anon, authenticated;

-- Revision 31 means lunch-credit columns, validation, and snapshot triggers exist.
-- Readiness checks this revision so new app code cannot serve against the old schema.
CREATE OR REPLACE FUNCTION public.ojt_security_revision()
RETURNS integer LANGUAGE sql STABLE SET search_path=public AS $$ SELECT 31 $$;
REVOKE ALL ON FUNCTION public.ojt_security_revision() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ojt_security_revision() TO service_role;

COMMIT;
