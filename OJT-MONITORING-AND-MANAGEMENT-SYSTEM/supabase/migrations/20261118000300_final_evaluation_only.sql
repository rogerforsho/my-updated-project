-- The practicum has one Supervisor evaluation: the Final evaluation, given after the trainee finished the required hours.
-- 1. Clearance no longer asks for a passing midterm (same body as 20261108000100 minus the midterm block).
-- 2. New evaluations must be 'final' and the trainee's Credited Hours must have reached the required hours.
-- Existing midterm rows and the CHECK constraint stay, so old records remain readable; a midterm just no longer counts.
BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$ BEGIN
  IF to_regprocedure('public.ojt_security_revision()') IS NULL OR public.ojt_security_revision() < 44
     OR to_regprocedure('public.required_hours_for_course(text)') IS NULL THEN
    RAISE EXCEPTION 'Apply and verify migrations through 20261108000100 first';
  END IF;
END $$;

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
      WHERE e.student_id = p_student_id AND e.evaluation_type = 'final'
      ORDER BY e.evaluation_date DESC LIMIT 1), false)
$$;
REVOKE ALL ON FUNCTION private.student_clearance_met(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.guard_evaluation_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' SET row_security = off AS $$
DECLARE
  v_done numeric;
  v_required numeric;
BEGIN
  IF NEW.evaluation_type IS DISTINCT FROM 'final' THEN
    RAISE EXCEPTION 'Only the final evaluation is recorded.' USING ERRCODE = '23514';
  END IF;
  SELECT coalesce((SELECT p.completed_hours FROM public.internship_progress p WHERE p.student_id = NEW.student_id), 0),
         coalesce(s.required_hours, public.required_hours_for_course(s.course), 486)
    INTO v_done, v_required
  FROM public.students s WHERE s.student_id = NEW.student_id;
  IF v_done < coalesce(v_required, 486) THEN
    RAISE EXCEPTION 'The trainee has not finished the required practicum hours (% of % hours).', v_done, v_required
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_evaluation_insert() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS guard_evaluation_insert ON public.evaluations;
CREATE TRIGGER guard_evaluation_insert BEFORE INSERT ON public.evaluations
  FOR EACH ROW EXECUTE FUNCTION public.guard_evaluation_insert();

COMMIT;
