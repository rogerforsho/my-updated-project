-- Required practicum hours depend on the program: BSIT 486, BS-CPE 240, BSBA-HRM 300, BSENTREP 300.
-- Mirrors REQUIRED_HOURS_BY_COURSE / requiredHoursForCourse() in shared/courses.ts.
-- Replaces the silent 486 fallback in the progress trigger and the clearance rule, defaults
-- students.required_hours from the course, and corrects existing students (empty or the old 486 default).
-- Students whose OJT is already completed (certificate issued) are left untouched: their records are read-only.
BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$ BEGIN
  IF to_regprocedure('public.ojt_security_revision()') IS NULL
     OR public.ojt_security_revision() < 44
     OR to_regclass('public.certificates') IS NULL THEN
    RAISE EXCEPTION 'Apply and verify migrations through revision 44 first';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.required_hours_for_course(p_course text)
RETURNS integer LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE
    WHEN upper(coalesce(p_course, '')) LIKE ANY (ARRAY['%BSIT%', '%INFORMATION TECHNOLOGY%']) THEN 486
    WHEN upper(coalesce(p_course, '')) LIKE ANY (ARRAY['%BS-CPE%', '%BSCPE%', '%COMPUTER ENGINEERING%']) THEN 240
    WHEN upper(coalesce(p_course, '')) LIKE ANY (ARRAY['%BSBA%', '%HUMAN RESOURCE%']) THEN 300
    WHEN upper(coalesce(p_course, '')) LIKE ANY (ARRAY['%BSENTREP%', '%ENTREPRENEURSHIP%']) THEN 300
    ELSE NULL END;
$$;
REVOKE ALL ON FUNCTION public.required_hours_for_course(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.required_hours_for_course(text) TO authenticated, service_role;

-- New students get their program's hours; changing course moves the hours only when they were still the old program's default.
CREATE OR REPLACE FUNCTION public.students_default_required_hours()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.required_hours IS NULL THEN
      NEW.required_hours := public.required_hours_for_course(NEW.course);
    END IF;
  ELSIF NEW.course IS DISTINCT FROM OLD.course
        AND (OLD.required_hours IS NULL OR OLD.required_hours = public.required_hours_for_course(OLD.course)) THEN
    NEW.required_hours := coalesce(public.required_hours_for_course(NEW.course), NEW.required_hours);
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.students_default_required_hours() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS students_default_required_hours ON public.students;
CREATE TRIGGER students_default_required_hours BEFORE INSERT OR UPDATE OF course ON public.students
  FOR EACH ROW EXECUTE FUNCTION public.students_default_required_hours();

-- Progress trigger: same as migration 032 except the required-hours lookup.
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

  SELECT coalesce(required_hours, public.required_hours_for_course(course), 486) INTO v_required_hours
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

-- Clearance rule: same as 20261024000100 except the required-hours lookup.
CREATE OR REPLACE FUNCTION private.student_clearance_met(p_student_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' SET row_security = off AS $$
  SELECT
    coalesce((SELECT p.completed_hours FROM public.internship_progress p WHERE p.student_id = p_student_id LIMIT 1), 0)
      >= coalesce((SELECT coalesce(s.required_hours, public.required_hours_for_course(s.course)) FROM public.students s WHERE s.student_id = p_student_id), 486)
    AND EXISTS (SELECT 1 FROM public.reports r
      WHERE r.student_id = p_student_id AND r.report_type = 'final_report' AND r.status = 'approved')
    AND NOT EXISTS (SELECT 1 FROM public.evaluation_appeals a
      WHERE a.student_id = p_student_id AND a.status = 'pending')
    AND coalesce((
      SELECT coalesce(
        (SELECT a.resolved_score FROM public.evaluation_appeals a
          WHERE a.evaluation_id = e.evaluation_id AND a.status = 'adjusted' AND a.resolved_score IS NOT NULL
          ORDER BY a.created_at DESC LIMIT 1),
        e.performance_score) >= 75
      FROM public.evaluations e
      WHERE e.student_id = p_student_id AND e.evaluation_type = 'midterm'
      ORDER BY e.evaluation_date DESC LIMIT 1), false)
    AND coalesce((
      SELECT coalesce(
        (SELECT a.resolved_score FROM public.evaluation_appeals a
          WHERE a.evaluation_id = e.evaluation_id AND a.status = 'adjusted' AND a.resolved_score IS NOT NULL
          ORDER BY a.created_at DESC LIMIT 1),
        e.performance_score) >= 75
      FROM public.evaluations e
      WHERE e.student_id = p_student_id AND e.evaluation_type = 'final'
      ORDER BY e.evaluation_date DESC LIMIT 1), false)
$$;
REVOKE ALL ON FUNCTION private.student_clearance_met(uuid) FROM PUBLIC, anon, authenticated;

-- Correct existing students (empty, or still the old 486 default) and refresh their progress snapshot.
DO $$
DECLARE
  v_ids uuid[];
BEGIN
  WITH changed AS (
    UPDATE public.students s SET required_hours = public.required_hours_for_course(s.course)
    WHERE public.required_hours_for_course(s.course) IS NOT NULL
      AND (s.required_hours IS NULL OR s.required_hours = 486)
      AND s.required_hours IS DISTINCT FROM public.required_hours_for_course(s.course)
      AND NOT EXISTS (SELECT 1 FROM public.certificates c WHERE c.student_id = s.student_id)
    RETURNING s.student_id
  )
  SELECT coalesce(array_agg(student_id), '{}') INTO v_ids FROM changed;
  RAISE NOTICE 'required_hours corrected for % student(s)', cardinality(v_ids);

  UPDATE public.internship_progress p SET
    remaining_hours = greatest(0, round(s.required_hours - p.completed_hours, 2)),
    progress_status = CASE
      WHEN p.completed_hours >= s.required_hours AND s.required_hours > 0 THEN 'completed'
      WHEN p.completed_hours > 0 THEN 'in_progress'
      ELSE 'not_started' END,
    updated_at = now()
  FROM public.students s
  WHERE s.student_id = p.student_id AND p.student_id = ANY (v_ids);
END $$;

-- Courses that map to no program keep a NULL/legacy value; list them so they can be fixed by hand.
DO $$
DECLARE v_unmapped integer;
BEGIN
  SELECT count(*) INTO v_unmapped FROM public.students WHERE public.required_hours_for_course(course) IS NULL;
  IF v_unmapped > 0 THEN RAISE NOTICE '% student(s) have a course with no program hours; they fall back to 486', v_unmapped; END IF;
END $$;

COMMIT;
