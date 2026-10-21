-- ==============================================================================
-- Migration 023: Midterm & Final Evaluations Rubric and Supervisor Reports RLS
-- Colegio de Montalban — Cross-Platform OJT Monitoring and Management System
-- ==============================================================================

-- 1. Extend evaluations table with evaluation_type and rubric_scores
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'evaluations' AND column_name = 'evaluation_type'
  ) THEN
    ALTER TABLE public.evaluations 
      ADD COLUMN evaluation_type text NOT NULL DEFAULT 'final' 
      CHECK (evaluation_type IN ('midterm', 'final'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'evaluations' AND column_name = 'rubric_scores'
  ) THEN
    ALTER TABLE public.evaluations 
      ADD COLUMN rubric_scores jsonb;
  END IF;
END $$;

-- 2. Clean up any existing duplicate evaluations for the same student and type before adding index
DELETE FROM public.evaluations e1
USING public.evaluations e2
WHERE e1.student_id = e2.student_id
  AND e1.evaluation_type = e2.evaluation_type
  AND e1.created_at < e2.created_at;

-- Unique index ensuring at most one midterm and one final evaluation per student
CREATE UNIQUE INDEX IF NOT EXISTS uq_evaluations_student_type 
ON public.evaluations (student_id, evaluation_type);

-- 3. Extend reports table with supervisor mentor feedback and endorsement timestamp
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'reports' AND column_name = 'supervisor_feedback'
  ) THEN
    ALTER TABLE public.reports ADD COLUMN supervisor_feedback text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'reports' AND column_name = 'supervisor_endorsed_at'
  ) THEN
    ALTER TABLE public.reports ADD COLUMN supervisor_endorsed_at timestamptz;
  END IF;
END $$;

-- 4. RLS POLICIES FOR SUPERVISORS & STUDENTS

-- Supervisors can read reports submitted by their assigned students
DROP POLICY IF EXISTS "supervisor_read_assigned_reports" ON public.reports;
CREATE POLICY "supervisor_read_assigned_reports" ON public.reports
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.student_assignments sa
      WHERE sa.student_id = reports.student_id
        AND sa.supervisor_id = get_my_supervisor_id()
    )
  );

-- Supervisors can update reports (to record supervisor feedback & endorsement)
DROP POLICY IF EXISTS "supervisor_update_assigned_reports" ON public.reports;
CREATE POLICY "supervisor_update_assigned_reports" ON public.reports
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.student_assignments sa
      WHERE sa.student_id = reports.student_id
        AND sa.supervisor_id = get_my_supervisor_id()
    )
  );

-- Students can read their own evaluation scores & mentor feedback
DROP POLICY IF EXISTS "student_read_own_evaluations" ON public.evaluations;
CREATE POLICY "student_read_own_evaluations" ON public.evaluations
  FOR SELECT USING (student_id = get_my_student_id());
