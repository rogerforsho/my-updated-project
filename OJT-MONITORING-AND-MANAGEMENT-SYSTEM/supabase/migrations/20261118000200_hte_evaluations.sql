-- Evaluation of Host Training Establishment (HTE): one form per student, filled in after the
-- Required Hours are complete. Only the student and the department's OJT Coordinator can read it;
-- Supervisors get no policy, so students can rate their HTE honestly. Rows are written by the web
-- BFF (service role), never by the client, and are never updated or deleted.
-- Deliberately NOT in the completion-freeze trigger list (20261021000100): a student whose OJT is
-- already finalized must still be able to submit it.
BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$ BEGIN
  IF to_regprocedure('private.get_my_student_id()') IS NULL
     OR to_regprocedure('private.staff_has_student(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Apply and verify the four-role authorization migrations first';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.hte_evaluations (
  hte_evaluation_id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  student_id uuid NOT NULL UNIQUE REFERENCES public.students(student_id) ON DELETE RESTRICT,
  company_id uuid NOT NULL REFERENCES public.companies(company_id) ON DELETE RESTRICT,
  branch_id uuid REFERENCES public.company_branches(branch_id) ON DELETE RESTRICT,
  department_assigned text NOT NULL CHECK (length(trim(department_assigned)) BETWEEN 1 AND 120),
  field_of_training text NOT NULL CHECK (length(trim(field_of_training)) BETWEEN 1 AND 120),
  ratings jsonb NOT NULL CHECK (jsonb_typeof(ratings) = 'object'),
  total_score numeric(5,2) NOT NULL CHECK (total_score BETWEEN 0 AND 100),
  comments text CHECK (comments IS NULL OR length(comments) <= 3000),
  submitted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hte_evaluations_company ON public.hte_evaluations(company_id);

ALTER TABLE public.hte_evaluations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hte_evaluations FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.hte_evaluations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hte_evaluations TO service_role;

DROP POLICY IF EXISTS hte_evaluation_read_student_or_coordinator ON public.hte_evaluations;
CREATE POLICY hte_evaluation_read_student_or_coordinator ON public.hte_evaluations
  FOR SELECT TO authenticated USING (
    (private.get_my_role() = 'Student' AND student_id = private.get_my_student_id())
    OR (private.get_my_role() = 'Coordinator' AND private.staff_has_student(student_id))
  );

COMMIT;
