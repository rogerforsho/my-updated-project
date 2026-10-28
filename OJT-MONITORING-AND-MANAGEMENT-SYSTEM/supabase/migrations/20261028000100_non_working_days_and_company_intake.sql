BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$ BEGIN
  IF to_regprocedure('private.get_my_role()') IS NULL
     OR to_regprocedure('public.ojt_security_revision()') IS NULL
     OR public.ojt_security_revision() < 44 THEN
    RAISE EXCEPTION 'Apply and verify migrations through revision 44 first';
  END IF;
END $$;

-- ───────────────────────────── Non-working days ─────────────────────────────
-- Holidays and suspensions only move the projected end date; rendered hours always count.
CREATE TABLE IF NOT EXISTS public.non_working_days (
  day_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  day_date date NOT NULL,
  scope text NOT NULL CHECK (scope IN ('global', 'department', 'company')),
  department text CHECK (department IN ('ICS', 'IBE')),
  company_id uuid REFERENCES public.companies(company_id) ON DELETE CASCADE,
  label text NOT NULL CHECK (length(trim(label)) BETWEEN 1 AND 150),
  created_by uuid REFERENCES public.users(user_id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- global: national holiday. department: one institute. company: one HTE, recorded under the granted department that entered it.
  CHECK (
    (scope = 'global' AND department IS NULL AND company_id IS NULL)
    OR (scope = 'department' AND department IS NOT NULL AND company_id IS NULL)
    OR (scope = 'company' AND department IS NOT NULL AND company_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_non_working_days_scope
  ON public.non_working_days (day_date, scope, coalesce(department, ''), coalesce(company_id::text, ''));
CREATE INDEX IF NOT EXISTS idx_non_working_days_date ON public.non_working_days (day_date);

ALTER TABLE public.non_working_days ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.non_working_days FROM PUBLIC, anon;
GRANT SELECT, INSERT, DELETE ON public.non_working_days TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.non_working_days TO service_role;

-- Every signed-in role needs these dates to show a correct expected end date.
DROP POLICY IF EXISTS non_working_days_read ON public.non_working_days;
CREATE POLICY non_working_days_read ON public.non_working_days
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS non_working_days_admin_global ON public.non_working_days;
CREATE POLICY non_working_days_admin_global ON public.non_working_days
  FOR ALL TO authenticated
  USING (private.get_my_role() = 'Admin' AND scope = 'global')
  WITH CHECK (private.get_my_role() = 'Admin' AND scope = 'global' AND created_by = auth.uid());

DROP POLICY IF EXISTS non_working_days_coordinator_scoped ON public.non_working_days;
CREATE POLICY non_working_days_coordinator_scoped ON public.non_working_days
  FOR ALL TO authenticated
  USING (
    private.get_my_role() = 'Coordinator' AND scope IN ('department', 'company')
    AND EXISTS (SELECT 1 FROM public.staff_capability_grants g
                WHERE g.user_id = auth.uid() AND g.capability = 'academic_workflows'
                  AND g.department_scope = non_working_days.department AND g.revoked_at IS NULL)
  )
  WITH CHECK (
    private.get_my_role() = 'Coordinator' AND scope IN ('department', 'company') AND created_by = auth.uid()
    AND EXISTS (SELECT 1 FROM public.staff_capability_grants g
                WHERE g.user_id = auth.uid() AND g.capability = 'academic_workflows'
                  AND g.department_scope = non_working_days.department AND g.revoked_at IS NULL)
  );

-- ───────────────────────────── Company intake control ───────────────────────
-- max_interns NULL = no limit set. accepting_students = manual "not accepting" switch.
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS max_interns integer CHECK (max_interns IS NULL OR max_interns BETWEEN 1 AND 500),
  ADD COLUMN IF NOT EXISTS accepting_students boolean NOT NULL DEFAULT true;

-- A company is open when the switch is on and active placements are below the limit.
CREATE OR REPLACE FUNCTION public.company_is_open(p_company_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public SET row_security = off AS $$
  SELECT c.accepting_students
     AND (c.max_interns IS NULL OR (
           SELECT count(*) FROM public.student_assignments a
           WHERE a.company_id = c.company_id AND a.assignment_status = 'active') < c.max_interns)
  FROM public.companies c WHERE c.company_id = p_company_id;
$$;
REVOKE ALL ON FUNCTION public.company_is_open(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.company_is_open(uuid) TO authenticated, service_role;

-- Tell every active coordinator holding an academic grant. Companies are shared between ICS and IBE.
CREATE OR REPLACE FUNCTION public.notify_company_intake_change(p_company_id uuid, p_open boolean, p_actor uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET row_security = off AS $$
DECLARE v_name text;
BEGIN
  SELECT company_name INTO v_name FROM public.companies WHERE company_id = p_company_id;
  INSERT INTO public.notifications (sender_user_id, receiver_user_id, message)
  SELECT DISTINCT p_actor, g.user_id,
         v_name || CASE WHEN p_open THEN ' is accepting new students again.' ELSE ' is no longer accepting new students.' END
  FROM public.staff_capability_grants g
  JOIN public.users u ON u.user_id = g.user_id AND u.role = 'Coordinator' AND u.account_status = 'active'
  WHERE g.capability = 'academic_workflows' AND g.revoked_at IS NULL;
END $$;
REVOKE ALL ON FUNCTION public.notify_company_intake_change(uuid, boolean, uuid) FROM PUBLIC, anon, authenticated;

-- The supervisor edits only the two intake columns of their own company.
CREATE OR REPLACE FUNCTION public.supervisor_set_company_intake(p_max_interns integer, p_accepting boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET row_security = off AS $$
DECLARE v_company uuid; v_before boolean; v_after boolean;
BEGIN
  IF private.get_my_role() IS DISTINCT FROM 'Supervisor' THEN
    RAISE EXCEPTION 'Only a Supervisor can change intake settings' USING ERRCODE = '42501';
  END IF;
  IF p_max_interns IS NOT NULL AND p_max_interns NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'Maximum interns must be between 1 and 500' USING ERRCODE = '22023';
  END IF;
  SELECT s.company_id INTO v_company FROM public.supervisors s WHERE s.user_id = auth.uid();
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Supervisor has no company' USING ERRCODE = '42501';
  END IF;
  v_before := public.company_is_open(v_company);
  UPDATE public.companies SET max_interns = p_max_interns, accepting_students = p_accepting, updated_at = now()
  WHERE company_id = v_company;
  v_after := public.company_is_open(v_company);
  INSERT INTO public.audit_logs (actor_user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'COMPANY_INTAKE_UPDATED', 'company', v_company::text,
          jsonb_build_object('max_interns', p_max_interns, 'accepting_students', p_accepting));
  IF v_before IS DISTINCT FROM v_after THEN
    PERFORM public.notify_company_intake_change(v_company, v_after, auth.uid());
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.supervisor_set_company_intake(integer, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervisor_set_company_intake(integer, boolean) TO authenticated;

-- Block new active placements into a closed company; existing placements are untouched.
CREATE OR REPLACE FUNCTION public.guard_company_intake()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET row_security = off AS $$
BEGIN
  IF NEW.assignment_status = 'active'
     AND (TG_OP = 'INSERT' OR OLD.assignment_status IS DISTINCT FROM 'active' OR OLD.company_id IS DISTINCT FROM NEW.company_id) THEN
    -- Serialise concurrent placements into the same company so the limit cannot be overshot.
    PERFORM 1 FROM public.companies WHERE company_id = NEW.company_id FOR UPDATE;
    IF NOT public.company_is_open(NEW.company_id) THEN
      RAISE EXCEPTION 'This company is not accepting new students' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS guard_company_intake ON public.student_assignments;
CREATE TRIGGER guard_company_intake BEFORE INSERT OR UPDATE ON public.student_assignments
  FOR EACH ROW EXECUTE FUNCTION public.guard_company_intake();

-- When a placement fills the last seat, notify coordinators that the company just closed.
CREATE OR REPLACE FUNCTION public.notify_company_filled()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET row_security = off AS $$
BEGIN
  IF NEW.assignment_status = 'active' AND (TG_OP = 'INSERT' OR OLD.assignment_status IS DISTINCT FROM 'active')
     AND (SELECT accepting_students AND max_interns IS NOT NULL FROM public.companies WHERE company_id = NEW.company_id)
     AND NOT public.company_is_open(NEW.company_id) THEN
    PERFORM public.notify_company_intake_change(NEW.company_id, false, NULL);
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS notify_company_filled ON public.student_assignments;
CREATE TRIGGER notify_company_filled AFTER INSERT OR UPDATE ON public.student_assignments
  FOR EACH ROW EXECUTE FUNCTION public.notify_company_filled();

COMMIT;
