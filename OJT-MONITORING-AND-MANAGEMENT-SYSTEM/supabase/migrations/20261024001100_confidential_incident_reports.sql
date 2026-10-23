BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$ BEGIN
  IF to_regprocedure('private.get_my_student_id()') IS NULL
     OR to_regprocedure('private.staff_has_student(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Apply and verify the four-role authorization migrations first';
  END IF;
END $$;

-- Confidential incident or harassment reports. Only the reporting student and the OJT
-- Coordinator(s) granted the student's department can read a row: there is deliberately
-- no Supervisor or Super Admin policy, so RLS returns them nothing.
CREATE TABLE IF NOT EXISTS public.incident_reports (
  incident_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(student_id) ON DELETE RESTRICT,
  submitted_by uuid NOT NULL REFERENCES public.users(user_id) ON DELETE RESTRICT,
  category text NOT NULL CHECK (category IN ('harassment', 'safety', 'supervisor_conduct', 'workplace_condition', 'other')),
  description text NOT NULL CHECK (length(trim(description)) BETWEEN 10 AND 4000),
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'acknowledged', 'closed')),
  coordinator_response text CHECK (coordinator_response IS NULL OR length(trim(coordinator_response)) <= 3000),
  reviewed_by uuid REFERENCES public.users(user_id) ON DELETE RESTRICT,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((status = 'submitted') = (reviewed_by IS NULL AND reviewed_at IS NULL)),
  CHECK (status <> 'closed' OR length(trim(coalesce(coordinator_response, ''))) > 0)
);

CREATE INDEX IF NOT EXISTS idx_incident_reports_student_created
  ON public.incident_reports(student_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_incident_reports_open
  ON public.incident_reports(created_at DESC) WHERE status <> 'closed';

ALTER TABLE public.incident_reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.incident_reports FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE ON public.incident_reports TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.incident_reports TO service_role;

DROP POLICY IF EXISTS incident_report_read_student_or_coordinator ON public.incident_reports;
CREATE POLICY incident_report_read_student_or_coordinator ON public.incident_reports
  FOR SELECT TO authenticated USING (
    (private.get_my_role() = 'Student' AND student_id = private.get_my_student_id())
    OR (private.get_my_role() = 'Coordinator' AND private.staff_has_student(student_id))
  );
DROP POLICY IF EXISTS incident_report_student_insert ON public.incident_reports;
CREATE POLICY incident_report_student_insert ON public.incident_reports
  FOR INSERT TO authenticated WITH CHECK (
    private.get_my_role() = 'Student'
    AND student_id = private.get_my_student_id()
    AND submitted_by = auth.uid()
  );
DROP POLICY IF EXISTS incident_report_coordinator_review ON public.incident_reports;
CREATE POLICY incident_report_coordinator_review ON public.incident_reports
  FOR UPDATE TO authenticated USING (
    private.get_my_role() = 'Coordinator' AND status <> 'closed' AND private.staff_has_student(student_id)
  ) WITH CHECK (
    private.get_my_role() = 'Coordinator' AND private.staff_has_student(student_id)
  );

CREATE OR REPLACE FUNCTION public.guard_incident_report()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET row_security = off AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF private.get_my_role() IS DISTINCT FROM 'Student'
       OR NEW.student_id IS DISTINCT FROM private.get_my_student_id()
       OR NEW.submitted_by IS DISTINCT FROM auth.uid()
       OR NEW.status <> 'submitted'
       OR NEW.coordinator_response IS NOT NULL
       OR NEW.reviewed_by IS NOT NULL OR NEW.reviewed_at IS NOT NULL THEN
      RAISE EXCEPTION 'Students may submit incident reports only for themselves' USING ERRCODE = '42501';
    END IF;
    NEW.created_at := now();
    RETURN NEW;
  END IF;

  IF private.get_my_role() IS DISTINCT FROM 'Coordinator'
     OR NOT private.staff_has_student(OLD.student_id)
     OR NEW.incident_id IS DISTINCT FROM OLD.incident_id
     OR NEW.student_id IS DISTINCT FROM OLD.student_id
     OR NEW.submitted_by IS DISTINCT FROM OLD.submitted_by
     OR NEW.category IS DISTINCT FROM OLD.category
     OR NEW.description IS DISTINCT FROM OLD.description
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.reviewed_by IS DISTINCT FROM auth.uid()
     OR NOT ((OLD.status = 'submitted' AND NEW.status IN ('acknowledged', 'closed'))
          OR (OLD.status = 'acknowledged' AND NEW.status IN ('acknowledged', 'closed'))) THEN
    RAISE EXCEPTION 'Only an assigned OJT Coordinator may move an open incident report forward' USING ERRCODE = '42501';
  END IF;
  NEW.reviewed_at := now();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_incident_report() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS guard_incident_report ON public.incident_reports;
CREATE TRIGGER guard_incident_report
  BEFORE INSERT OR UPDATE ON public.incident_reports
  FOR EACH ROW EXECUTE FUNCTION public.guard_incident_report();

-- Messages carry no report details, only that something needs the Coordinator's attention.
CREATE OR REPLACE FUNCTION public.notify_incident_report()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET row_security = off AS $$
DECLARE student_user_id uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.notifications(receiver_user_id, message, status, notification_date)
    SELECT u.user_id, 'A confidential incident report was submitted for your department.', 'unread', now()
    FROM public.staff_capability_grants g
    JOIN public.users u ON u.user_id = g.user_id AND u.role = 'Coordinator' AND u.account_status = 'active'
    JOIN public.students s ON s.student_id = NEW.student_id
    WHERE g.capability = 'academic_workflows' AND g.revoked_at IS NULL
      AND g.department_scope = public.course_department(s.course);
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    SELECT user_id INTO student_user_id FROM public.students WHERE student_id = NEW.student_id;
    INSERT INTO public.notifications(receiver_user_id, message, status, notification_date)
    VALUES (student_user_id,
      CASE NEW.status WHEN 'acknowledged' THEN 'Your OJT Coordinator acknowledged your incident report.'
        ELSE 'Your OJT Coordinator closed your incident report. Open it in the mobile app to read the response.' END,
      'unread', now());
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.notify_incident_report() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS notify_incident_report ON public.incident_reports;
CREATE TRIGGER notify_incident_report
  AFTER INSERT OR UPDATE ON public.incident_reports
  FOR EACH ROW EXECUTE FUNCTION public.notify_incident_report();

COMMIT;
