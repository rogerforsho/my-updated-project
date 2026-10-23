BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$ BEGIN
  IF to_regprocedure('public.ojt_security_revision()') IS NULL
     OR public.ojt_security_revision() < 44
     OR to_regclass('public.ojt_final_grades') IS NULL
     OR to_regclass('public.evaluation_appeals') IS NULL THEN
    RAISE EXCEPTION 'Apply and verify migrations through revision 44 first';
  END IF;
END $$;

-- Mirrors checkClearanceStatus() in apps/web/src/services/certificates.ts:
-- hours met, approved final report, midterm and final evaluations >= 75
-- (an adjusted appeal replaces the score), and no pending appeal.
CREATE OR REPLACE FUNCTION private.student_clearance_met(p_student_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' SET row_security = off AS $$
  SELECT
    coalesce((SELECT p.completed_hours FROM public.internship_progress p WHERE p.student_id = p_student_id LIMIT 1), 0)
      >= coalesce((SELECT s.required_hours FROM public.students s WHERE s.student_id = p_student_id), 486)
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

CREATE OR REPLACE FUNCTION public.require_ojt_clearance()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' SET row_security = off AS $$
BEGIN
  IF NOT private.student_clearance_met(NEW.student_id) THEN
    RAISE EXCEPTION 'Student has not met all OJT clearance requirements' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.require_ojt_clearance() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS require_ojt_clearance ON public.ojt_final_grades;
CREATE TRIGGER require_ojt_clearance BEFORE INSERT OR UPDATE ON public.ojt_final_grades
  FOR EACH ROW EXECUTE FUNCTION public.require_ojt_clearance();
DROP TRIGGER IF EXISTS require_ojt_clearance ON public.certificates;
CREATE TRIGGER require_ojt_clearance BEFORE INSERT ON public.certificates
  FOR EACH ROW EXECUTE FUNCTION public.require_ojt_clearance();

COMMIT;
