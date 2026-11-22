-- Target Hours are set by the OJT Coordinator per course, not hard-coded.
-- The hours come from the school / CHED / curriculum, so the Coordinator of the course's department sets them once:
-- Coordinator > Target Hours > pick the course > enter the hours (e.g. 486).
-- public.required_hours_for_course() keeps its name and signature, so the student trigger, the progress trigger and
-- the clearance rule (20261108000100, 20261118000300, 20261119000100) keep working and now read this table.
-- The four rows are seeded with the values already in use (BSIT 486, BS-CPE 240, BSBA-HRM 300, BSENTREP 300) and stay
-- "not confirmed" (confirmed_at NULL) until a Coordinator saves them.
BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$ BEGIN
  IF to_regprocedure('public.ojt_security_revision()') IS NULL
     OR public.ojt_security_revision() < 44
     OR to_regprocedure('public.required_hours_for_course(text)') IS NULL
     OR to_regprocedure('public.course_department(text)') IS NULL
     OR to_regprocedure('private.staff_has_department(text)') IS NULL
     OR to_regclass('public.certificates') IS NULL THEN
    RAISE EXCEPTION 'Apply and verify migrations through 20261120000100 first';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.program_target_hours (
  course text PRIMARY KEY CHECK (course IN ('BSIT', 'BS-CPE', 'BSBA-HRM', 'BSENTREP')),
  -- 840 = 40 hours a week for 21 weeks, the most that fits the five-month Practicum Window.
  required_hours integer NOT NULL CHECK (required_hours BETWEEN 1 AND 840),
  confirmed_at timestamptz,
  updated_by uuid REFERENCES public.users(user_id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.program_target_hours (course, required_hours) VALUES
  ('BSIT', 486), ('BS-CPE', 240), ('BSBA-HRM', 300), ('BSENTREP', 300)
ON CONFLICT (course) DO NOTHING;

ALTER TABLE public.program_target_hours ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.program_target_hours FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.program_target_hours TO authenticated, service_role;

-- Read only: a Coordinator sees the courses of a department they are granted; the Super Admin sees all.
-- There is no write policy. Every change goes through set_program_target_hours() below.
DROP POLICY IF EXISTS program_target_hours_read ON public.program_target_hours;
CREATE POLICY program_target_hours_read ON public.program_target_hours
  FOR SELECT TO authenticated
  USING (private.get_my_role() = 'Admin' OR private.staff_has_department(public.course_department(course)));

-- The program a course belongs to, using the same contains-matching as shared/courses.ts requiredHoursForCourse().
CREATE OR REPLACE FUNCTION public.program_key_for_course(p_course text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE
    WHEN upper(coalesce(p_course, '')) LIKE ANY (ARRAY['%BSIT%', '%INFORMATION TECHNOLOGY%']) THEN 'BSIT'
    WHEN upper(coalesce(p_course, '')) LIKE ANY (ARRAY['%BS-CPE%', '%BSCPE%', '%COMPUTER ENGINEERING%']) THEN 'BS-CPE'
    WHEN upper(coalesce(p_course, '')) LIKE ANY (ARRAY['%BSBA%', '%HUMAN RESOURCE%']) THEN 'BSBA-HRM'
    WHEN upper(coalesce(p_course, '')) LIKE ANY (ARRAY['%BSENTREP%', '%ENTREPRENEURSHIP%']) THEN 'BSENTREP'
    ELSE NULL END;
$$;
REVOKE ALL ON FUNCTION public.program_key_for_course(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.program_key_for_course(text) TO authenticated, service_role;

-- Same name and signature as before. It now reads the Coordinator's value instead of a fixed list.
-- SECURITY DEFINER because the student trigger runs as the caller, who cannot read the table.
-- STABLE, not IMMUTABLE: the value can change. No index or generated column uses it.
CREATE OR REPLACE FUNCTION public.required_hours_for_course(p_course text)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' SET row_security = off AS $$
  SELECT t.required_hours FROM public.program_target_hours t WHERE t.course = public.program_key_for_course(p_course);
$$;
REVOKE ALL ON FUNCTION public.required_hours_for_course(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.required_hours_for_course(text) TO authenticated, service_role;

-- The only way to change Target Hours. Returns how many students moved to the new value.
CREATE OR REPLACE FUNCTION public.set_program_target_hours(p_course text, p_hours integer)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' SET row_security = off AS $$
DECLARE
  v_old integer;
  v_ids uuid[];
BEGIN
  IF p_course IS NULL OR p_course NOT IN ('BSIT', 'BS-CPE', 'BSBA-HRM', 'BSENTREP') THEN
    RAISE EXCEPTION 'Choose one of the four programs' USING ERRCODE = '22023';
  END IF;
  IF p_hours IS NULL OR p_hours < 1 OR p_hours > 840 THEN
    RAISE EXCEPTION 'Target Hours must be between 1 and 840' USING ERRCODE = '22023';
  END IF;
  -- Only an active Coordinator granted the course's department. The Super Admin does not edit academic rules (ADR 0006).
  IF NOT private.staff_has_department(public.course_department(p_course)) THEN
    RAISE EXCEPTION 'You are not granted this program''s department' USING ERRCODE = '42501';
  END IF;

  SELECT required_hours INTO v_old FROM public.program_target_hours WHERE course = p_course FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Program not found' USING ERRCODE = '22023';
  END IF;

  UPDATE public.program_target_hours
  SET required_hours = p_hours, confirmed_at = now(), updated_by = auth.uid(), updated_at = now()
  WHERE course = p_course;

  -- Students still on the old value (or with none) follow the new one. A value set on purpose stays.
  -- Students with a certificate are read-only after Coordinator completion, so they are skipped.
  WITH moved AS (
    UPDATE public.students s SET required_hours = p_hours
    WHERE public.program_key_for_course(s.course) = p_course
      AND (s.required_hours IS NULL OR s.required_hours = v_old)
      AND s.required_hours IS DISTINCT FROM p_hours
      AND NOT EXISTS (SELECT 1 FROM public.certificates c WHERE c.student_id = s.student_id)
    RETURNING s.student_id
  )
  SELECT coalesce(array_agg(student_id), '{}') INTO v_ids FROM moved;

  -- Refresh the progress snapshot for them: raising the hours can turn 'completed' back into 'in_progress'.
  UPDATE public.internship_progress p SET
    remaining_hours = greatest(0, round(p_hours - p.completed_hours, 2)),
    progress_status = CASE
      WHEN p.completed_hours >= p_hours THEN 'completed'
      WHEN p.completed_hours > 0 THEN 'in_progress'
      ELSE 'not_started' END,
    updated_at = now()
  WHERE p.student_id = ANY (v_ids);

  RETURN cardinality(v_ids);
END;
$$;
REVOKE ALL ON FUNCTION public.set_program_target_hours(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_program_target_hours(text, integer) TO authenticated;

-- A Coordinator needs the count before saving, to show "this changes N students".
CREATE OR REPLACE FUNCTION public.count_students_following_target_hours(p_course text)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' SET row_security = off AS $$
  SELECT CASE WHEN private.staff_has_department(public.course_department(p_course)) THEN (
    SELECT count(*)::integer FROM public.students s
    WHERE public.program_key_for_course(s.course) = p_course
      AND (s.required_hours IS NULL OR s.required_hours = (SELECT t.required_hours FROM public.program_target_hours t WHERE t.course = p_course))
      AND NOT EXISTS (SELECT 1 FROM public.certificates c WHERE c.student_id = s.student_id)
  ) ELSE 0 END;
$$;
REVOKE ALL ON FUNCTION public.count_students_following_target_hours(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.count_students_following_target_hours(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.ojt_security_revision()
RETURNS integer LANGUAGE sql IMMUTABLE AS $$ SELECT 45 $$;
REVOKE ALL ON FUNCTION public.ojt_security_revision() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ojt_security_revision() TO service_role;

COMMIT;
