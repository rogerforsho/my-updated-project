-- Clearance gets a 4th gateway: the student has submitted the Evaluation of the Host Training Establishment.
-- Same body as 20261118000300_final_evaluation_only.sql plus the hte_evaluations check.
-- The certificate trigger (20261024000100) already calls this function, so the database enforces it.
BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$ BEGIN
  IF to_regclass('public.hte_evaluations') IS NULL THEN
    RAISE EXCEPTION 'Apply and verify migrations through 20261118000200 first';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION private.student_clearance_met(p_student_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' SET row_security = off AS $$
  SELECT
    coalesce((SELECT p.completed_hours FROM public.internship_progress p WHERE p.student_id = p_student_id LIMIT 1), 0)
      >= coalesce((SELECT coalesce(s.required_hours, public.required_hours_for_course(s.course)) FROM public.students s WHERE s.student_id = p_student_id), 486)
    AND EXISTS (SELECT 1 FROM public.reports r
      WHERE r.student_id = p_student_id AND r.report_type = 'final_report' AND r.status = 'approved')
    AND EXISTS (SELECT 1 FROM public.hte_evaluations h WHERE h.student_id = p_student_id)
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

COMMIT;
