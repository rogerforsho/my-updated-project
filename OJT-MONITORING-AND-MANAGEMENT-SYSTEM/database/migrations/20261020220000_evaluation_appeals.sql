BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$ BEGIN
  IF to_regprocedure('private.get_my_student_id()') IS NULL
     OR to_regprocedure('private.staff_has_student(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Apply and verify the four-role authorization migrations first';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.evaluation_appeals (
  appeal_id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  evaluation_id uuid NOT NULL REFERENCES public.evaluations(evaluation_id) ON DELETE RESTRICT,
  student_id uuid NOT NULL REFERENCES public.students(student_id) ON DELETE RESTRICT,
  submitted_by uuid NOT NULL REFERENCES public.users(user_id) ON DELETE RESTRICT,
  appeal_reason text NOT NULL CHECK (length(trim(appeal_reason)) BETWEEN 20 AND 3000),
  supporting_details text CHECK (supporting_details IS NULL OR length(trim(supporting_details)) <= 3000),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'upheld', 'adjusted')),
  decision_reason text,
  resolved_score numeric(5,2) CHECK (resolved_score IS NULL OR resolved_score BETWEEN 0 AND 100),
  decided_by uuid REFERENCES public.users(user_id) ON DELETE RESTRICT,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (status = 'pending' AND decision_reason IS NULL AND resolved_score IS NULL AND decided_by IS NULL AND decided_at IS NULL)
    OR (status = 'upheld' AND length(trim(coalesce(decision_reason, ''))) > 0 AND resolved_score IS NULL AND decided_by IS NOT NULL AND decided_at IS NOT NULL)
    OR (status = 'adjusted' AND length(trim(coalesce(decision_reason, ''))) > 0 AND resolved_score IS NOT NULL AND decided_by IS NOT NULL AND decided_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_evaluation_appeals_student_created
  ON public.evaluation_appeals(student_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_evaluation_appeals_one_pending
  ON public.evaluation_appeals(evaluation_id) WHERE status = 'pending';

ALTER TABLE public.evaluation_appeals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.evaluation_appeals FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE ON public.evaluation_appeals TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.evaluation_appeals TO service_role;

DROP POLICY IF EXISTS evaluation_appeal_read_student_or_coordinator ON public.evaluation_appeals;
CREATE POLICY evaluation_appeal_read_student_or_coordinator ON public.evaluation_appeals
  FOR SELECT TO authenticated USING (
    (private.get_my_role() = 'Student' AND student_id = private.get_my_student_id())
    OR (private.get_my_role() = 'Coordinator' AND private.staff_has_student(student_id))
  );
DROP POLICY IF EXISTS evaluation_appeal_student_insert ON public.evaluation_appeals;
CREATE POLICY evaluation_appeal_student_insert ON public.evaluation_appeals
  FOR INSERT TO authenticated WITH CHECK (
    private.get_my_role() = 'Student'
    AND student_id = private.get_my_student_id()
    AND submitted_by = auth.uid()
  );
DROP POLICY IF EXISTS evaluation_appeal_coordinator_decide ON public.evaluation_appeals;
CREATE POLICY evaluation_appeal_coordinator_decide ON public.evaluation_appeals
  FOR UPDATE TO authenticated USING (
    private.get_my_role() = 'Coordinator'
    AND status = 'pending'
    AND private.staff_has_student(student_id)
  ) WITH CHECK (
    private.get_my_role() = 'Coordinator'
    AND status IN ('upheld', 'adjusted')
    AND private.staff_has_student(student_id)
  );

CREATE OR REPLACE FUNCTION public.guard_evaluation_appeal()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET row_security = off AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF private.get_my_role() IS DISTINCT FROM 'Student'
       OR NEW.student_id IS DISTINCT FROM private.get_my_student_id()
       OR NEW.submitted_by IS DISTINCT FROM auth.uid()
       OR NEW.status <> 'pending' THEN
      RAISE EXCEPTION 'Students may submit appeals only for their own evaluations' USING ERRCODE = '42501';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.evaluations e
      WHERE e.evaluation_id = NEW.evaluation_id AND e.student_id = NEW.student_id
    ) THEN
      RAISE EXCEPTION 'Evaluation does not belong to this student' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF private.get_my_role() IS DISTINCT FROM 'Coordinator'
     OR NOT private.staff_has_student(OLD.student_id)
     OR OLD.status <> 'pending'
     OR NEW.status NOT IN ('upheld', 'adjusted')
     OR NEW.appeal_id IS DISTINCT FROM OLD.appeal_id
     OR NEW.evaluation_id IS DISTINCT FROM OLD.evaluation_id
     OR NEW.student_id IS DISTINCT FROM OLD.student_id
     OR NEW.submitted_by IS DISTINCT FROM OLD.submitted_by
     OR NEW.appeal_reason IS DISTINCT FROM OLD.appeal_reason
     OR NEW.supporting_details IS DISTINCT FROM OLD.supporting_details
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.decided_by IS DISTINCT FROM auth.uid()
     OR length(trim(coalesce(NEW.decision_reason, ''))) = 0
     OR (NEW.status = 'adjusted' AND NEW.resolved_score IS NULL)
     OR (NEW.status = 'upheld' AND NEW.resolved_score IS NOT NULL) THEN
    RAISE EXCEPTION 'Only an assigned OJT Coordinator may decide a pending appeal once' USING ERRCODE = '42501';
  END IF;
  NEW.decided_at := now();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_evaluation_appeal() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS guard_evaluation_appeal ON public.evaluation_appeals;
CREATE TRIGGER guard_evaluation_appeal
  BEFORE INSERT OR UPDATE ON public.evaluation_appeals
  FOR EACH ROW EXECUTE FUNCTION public.guard_evaluation_appeal();

-- Original supervisor evaluations are immutable; appeals record decisions separately.
REVOKE UPDATE, DELETE ON public.evaluations FROM authenticated;
DROP POLICY IF EXISTS supervisor_update_evaluations ON public.evaluations;
DROP POLICY IF EXISTS department_staff_update_evaluations ON public.evaluations;
DROP POLICY IF EXISTS coordinator_admin_update_evaluations ON public.evaluations;

CREATE OR REPLACE FUNCTION public.notify_evaluation_appeal()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET row_security = off AS $$
DECLARE student_user_id uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.notifications(receiver_user_id, message, status, notification_date)
    SELECT u.user_id, 'A student submitted an evaluation appeal for your department.', 'unread', now()
    FROM public.staff_capability_grants g
    JOIN public.users u ON u.user_id = g.user_id AND u.role = 'Coordinator' AND u.account_status = 'active'
    JOIN public.students s ON s.student_id = NEW.student_id
    WHERE g.capability = 'academic_workflows' AND g.revoked_at IS NULL
      AND g.department_scope = public.course_department(s.course);
  ELSE
    SELECT user_id INTO student_user_id FROM public.students WHERE student_id = NEW.student_id;
    INSERT INTO public.notifications(receiver_user_id, message, status, notification_date)
    VALUES (student_user_id, 'Your evaluation appeal has been decided. Open Evaluation Results in the mobile app for the decision.', 'unread', now());
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.notify_evaluation_appeal() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS notify_evaluation_appeal ON public.evaluation_appeals;
CREATE TRIGGER notify_evaluation_appeal
  AFTER INSERT OR UPDATE ON public.evaluation_appeals
  FOR EACH ROW EXECUTE FUNCTION public.notify_evaluation_appeal();

COMMIT;
