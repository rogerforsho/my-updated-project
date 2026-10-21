BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$ BEGIN
  IF to_regprocedure('public.ojt_security_revision()') IS NULL
     OR public.ojt_security_revision() < 43
     OR to_regprocedure('private.staff_has_student(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Apply and verify authorization migrations through revision 43 first';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.coordinator_review_practicum_schedule(
  p_schedule_id uuid,
  p_action text,
  p_company_id uuid DEFAULT NULL,
  p_branch_id uuid DEFAULT NULL,
  p_supervisor_id uuid DEFAULT NULL,
  p_feedback text DEFAULT NULL,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '' SET row_security = off AS $$
DECLARE
  v_schedule public.practicum_schedules%ROWTYPE;
  v_assignment public.student_assignments%ROWTYPE;
  v_start_date date;
  v_end_date date;
BEGIN
  IF private.get_my_role() IS DISTINCT FROM 'Coordinator' THEN
    RAISE EXCEPTION 'An active OJT Coordinator is required' USING ERRCODE = '42501';
  END IF;
  IF p_action IS NULL OR p_action NOT IN ('approve', 'reject', 'modify') THEN
    RAISE EXCEPTION 'Invalid schedule decision' USING ERRCODE = '22023';
  END IF;
  IF length(coalesce(p_feedback, '')) > 1000 THEN
    RAISE EXCEPTION 'Schedule feedback is too long' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_schedule FROM public.practicum_schedules
   WHERE schedule_id = p_schedule_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Schedule proposal not found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT private.staff_has_student(v_schedule.student_id) THEN
    RAISE EXCEPTION 'Schedule is outside the Coordinator department grants' USING ERRCODE = '42501';
  END IF;
  IF v_schedule.status NOT IN ('pending', 'modified') THEN
    RAISE EXCEPTION 'Schedule was already decided' USING ERRCODE = '23505';
  END IF;

  v_start_date := coalesce(p_start_date, v_schedule.start_date);
  v_end_date := coalesce(p_end_date, v_schedule.end_date);
  IF v_end_date IS NOT NULL AND v_end_date < v_start_date THEN
    RAISE EXCEPTION 'Schedule end date precedes start date' USING ERRCODE = '22023';
  END IF;

  IF p_action = 'approve' THEN
    IF p_company_id IS NULL OR p_branch_id IS NULL OR p_supervisor_id IS NULL THEN
      RAISE EXCEPTION 'Company, branch, and Supervisor are required' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.companies c
                   JOIN public.company_branches b ON b.company_id = c.company_id
                  WHERE c.company_id = p_company_id AND c.status = 'active'
                    AND b.branch_id = p_branch_id AND b.status = 'active')
       OR NOT EXISTS (SELECT 1 FROM public.supervisors s
                       JOIN public.users u ON u.user_id = s.user_id
                      WHERE s.supervisor_id = p_supervisor_id
                        AND s.company_id = p_company_id
                        AND u.role = 'Supervisor' AND u.account_status = 'active') THEN
      RAISE EXCEPTION 'Select an active company branch and its active Supervisor' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_assignment FROM public.student_assignments
     WHERE student_id = v_schedule.student_id AND assignment_status = 'active' FOR UPDATE;
    IF v_assignment.assignment_id IS NOT NULL THEN
      IF (v_assignment.company_id, v_assignment.branch_id, v_assignment.supervisor_id)
         IS DISTINCT FROM (p_company_id, p_branch_id, p_supervisor_id) THEN
        RAISE EXCEPTION 'Existing placement differs; reassign the student first' USING ERRCODE = '23505';
      END IF;
    ELSE
      INSERT INTO public.student_assignments
        (student_id, company_id, branch_id, supervisor_id, start_date, end_date, assignment_status)
      VALUES
        (v_schedule.student_id, p_company_id, p_branch_id, p_supervisor_id,
         v_start_date, v_end_date, 'active');
    END IF;
  END IF;

  UPDATE public.practicum_schedules
     SET status = CASE p_action WHEN 'approve' THEN 'approved'
                                WHEN 'reject' THEN 'rejected' ELSE 'modified' END,
         company_id = coalesce(p_company_id, v_schedule.company_id),
         branch_id = coalesce(p_branch_id, v_schedule.branch_id),
         start_date = v_start_date,
         end_date = v_end_date,
         coordinator_feedback = nullif(btrim(p_feedback), ''),
         reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now()
   WHERE schedule_id = p_schedule_id;

  INSERT INTO public.audit_logs(actor_user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'PRACTICUM_SCHEDULE_' || upper(p_action),
          'practicum_schedule', p_schedule_id,
          jsonb_build_object('student_id', v_schedule.student_id,
                             'action', p_action, 'feedback', p_feedback));
  RETURN p_schedule_id;
END;
$$;

REVOKE ALL ON FUNCTION public.coordinator_review_practicum_schedule(uuid,text,uuid,uuid,uuid,text,date,date)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.coordinator_review_practicum_schedule(uuid,text,uuid,uuid,uuid,text,date,date)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.ojt_security_revision()
RETURNS integer LANGUAGE sql IMMUTABLE AS $$ SELECT 44 $$;
REVOKE ALL ON FUNCTION public.ojt_security_revision() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ojt_security_revision() TO service_role;

COMMIT;
