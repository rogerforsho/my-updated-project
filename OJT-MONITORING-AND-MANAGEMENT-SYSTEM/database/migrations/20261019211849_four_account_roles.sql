-- Keep historical Coordinator/Program Head profile rows and all linked OJT records.
-- shortcut: OJT Staff stores Coordinator for legacy policies and chat records, replace when those schemas migrate together.
BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.role IN ('Coordinator', 'ProgramHead', 'OJT Staff')
      AND (SELECT count(*) FROM public.staff_capability_grants g
           WHERE g.user_id = u.user_id AND g.capability = 'academic_workflows'
             AND g.revoked_at IS NULL AND g.department_scope IN ('ICS', 'IBE')) = 0
  ) THEN
    RAISE EXCEPTION 'Every OJT staff account needs an active academic department grant';
  END IF;
END $$;

INSERT INTO public.coordinators (user_id, department)
SELECT u.user_id, g.department_scope
FROM public.users u
JOIN public.staff_capability_grants g ON g.user_id = u.user_id
WHERE u.role IN ('ProgramHead', 'OJT Staff')
  AND g.capability = 'academic_workflows' AND g.revoked_at IS NULL
ON CONFLICT (user_id) DO NOTHING;

UPDATE public.coordinators c SET department = g.department_scope
FROM public.staff_capability_grants g
WHERE c.user_id = g.user_id AND g.capability = 'academic_workflows'
  AND g.revoked_at IS NULL AND c.department IS DISTINCT FROM g.department_scope
  AND (SELECT count(*) FROM public.staff_capability_grants active_grant
       WHERE active_grant.user_id = c.user_id AND active_grant.capability = 'academic_workflows'
         AND active_grant.revoked_at IS NULL) = 1;

UPDATE public.users SET role = 'Coordinator', updated_at = now()
WHERE role IN ('ProgramHead', 'OJT Staff');

ALTER TABLE public.users DROP COLUMN account_category;
ALTER TABLE public.users ADD COLUMN account_category text GENERATED ALWAYS AS (
  CASE WHEN role = 'Coordinator' THEN 'OJT Staff' ELSE role END
) STORED;
ALTER TABLE public.users DROP CONSTRAINT users_role_check;
ALTER TABLE public.users ADD CONSTRAINT users_role_check
  CHECK (role IN ('Student', 'Coordinator', 'Supervisor', 'Admin'));

CREATE OR REPLACE FUNCTION private.staff_has_course(p_course text)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public SET row_security = off AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    JOIN public.staff_capability_grants g ON g.user_id = u.user_id
    WHERE u.user_id = auth.uid() AND u.role = 'Coordinator' AND u.account_status = 'active'
      AND g.capability = 'academic_workflows' AND g.revoked_at IS NULL
      AND g.department_scope = public.course_department(p_course)
  );
$$;
REVOKE ALL ON FUNCTION private.staff_has_course(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.staff_has_course(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.staff_has_department(p_department text)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public SET row_security = off AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    JOIN public.staff_capability_grants g ON g.user_id = u.user_id
    WHERE u.user_id = auth.uid() AND u.role = 'Coordinator' AND u.account_status = 'active'
      AND g.capability = 'academic_workflows' AND g.revoked_at IS NULL
      AND g.department_scope = upper(trim(p_department))
  );
$$;
REVOKE ALL ON FUNCTION private.staff_has_department(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.staff_has_department(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.staff_has_student(p_student_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public SET row_security = off AS $$
  SELECT EXISTS (SELECT 1 FROM public.students s
    WHERE s.student_id = p_student_id AND private.staff_has_course(s.course));
$$;
REVOKE ALL ON FUNCTION private.staff_has_student(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.staff_has_student(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.staff_can_read_user(p_user_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public SET row_security = off AS $$
  SELECT p_user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.students s
      WHERE s.user_id = p_user_id AND private.staff_has_course(s.course))
    OR EXISTS (SELECT 1 FROM public.supervisors sp WHERE sp.user_id = p_user_id);
$$;
REVOKE ALL ON FUNCTION private.staff_can_read_user(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.staff_can_read_user(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS ojt_staff_department_select ON public.students;
CREATE POLICY ojt_staff_department_select ON public.students AS RESTRICTIVE
  FOR SELECT TO authenticated USING (
    private.get_my_role() <> 'Admin' AND
    (private.get_my_role() <> 'Coordinator' OR private.staff_has_course(course)));
DROP POLICY IF EXISTS ojt_staff_department_write ON public.students;
CREATE POLICY ojt_staff_department_write ON public.students AS RESTRICTIVE
  FOR ALL TO authenticated USING (
    private.get_my_role() <> 'Admin' AND
    (private.get_my_role() <> 'Coordinator' OR private.staff_has_course(course)))
  WITH CHECK (
    private.get_my_role() <> 'Admin' AND
    (private.get_my_role() <> 'Coordinator' OR private.staff_has_course(course)));

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['student_assignments', 'attendance', 'reports', 'evaluations',
    'internship_progress', 'certificates', 'practicum_schedules'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS ojt_staff_department_boundary ON public.%I', t);
    EXECUTE format('CREATE POLICY ojt_staff_department_boundary ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (private.get_my_role() <> ''Admin'' AND (private.get_my_role() <> ''Coordinator'' OR private.staff_has_student(student_id))) WITH CHECK (private.get_my_role() <> ''Admin'' AND (private.get_my_role() <> ''Coordinator'' OR private.staff_has_student(student_id)))', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['companies', 'supervisors'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS academic_admin_boundary ON public.%I', t);
    EXECUTE format('CREATE POLICY academic_admin_boundary ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (private.get_my_role() <> ''Admin'' AND (private.get_my_role() <> ''Coordinator'' OR EXISTS (SELECT 1 FROM public.staff_capability_grants g WHERE g.user_id = auth.uid() AND g.capability = ''academic_workflows'' AND g.revoked_at IS NULL))) WITH CHECK (private.get_my_role() <> ''Admin'' AND (private.get_my_role() <> ''Coordinator'' OR EXISTS (SELECT 1 FROM public.staff_capability_grants g WHERE g.user_id = auth.uid() AND g.capability = ''academic_workflows'' AND g.revoked_at IS NULL)))', t);
  END LOOP;
END $$;

DROP POLICY IF EXISTS ojt_staff_user_boundary ON public.users;
CREATE POLICY ojt_staff_user_boundary ON public.users AS RESTRICTIVE
  FOR SELECT TO authenticated USING (
    private.get_my_role() <> 'Coordinator' OR private.staff_can_read_user(user_id));

DROP POLICY IF EXISTS ojt_staff_announcement_read ON public.announcements;
CREATE POLICY ojt_staff_announcement_read ON public.announcements AS RESTRICTIVE
  FOR SELECT TO authenticated USING (
    private.get_my_role() <> 'Coordinator'
    OR upper(trim(coalesce(target_department, ''))) = 'ALL'
    OR private.staff_has_department(target_department));
DROP POLICY IF EXISTS ojt_staff_announcement_write ON public.announcements;
CREATE POLICY ojt_staff_announcement_write ON public.announcements AS RESTRICTIVE
  FOR ALL TO authenticated USING (
    private.get_my_role() <> 'Coordinator' OR private.staff_has_department(target_department))
  WITH CHECK (
    private.get_my_role() <> 'Coordinator' OR private.staff_has_department(target_department));

DROP POLICY IF EXISTS four_role_attendance_selfie_boundary ON storage.objects;
CREATE POLICY four_role_attendance_selfie_boundary ON storage.objects AS RESTRICTIVE
  FOR ALL TO authenticated USING (
    bucket_id <> 'attendance-selfies' OR (
      private.get_my_role() <> 'Admin' AND (
        private.get_my_role() <> 'Coordinator' OR EXISTS (
          SELECT 1 FROM public.students s
          WHERE s.student_id::text = (storage.foldername(name))[1]
            AND private.staff_has_student(s.student_id)))))
  WITH CHECK (
    bucket_id <> 'attendance-selfies' OR (
      private.get_my_role() <> 'Admin' AND (
        private.get_my_role() <> 'Coordinator' OR EXISTS (
          SELECT 1 FROM public.students s
          WHERE s.student_id::text = (storage.foldername(name))[1]
            AND private.staff_has_student(s.student_id)))));

CREATE OR REPLACE FUNCTION public.chat_pair_is_eligible(p_coordinator_user_id uuid, p_supervisor_user_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public SET row_security = off AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users cu
    JOIN public.coordinators c ON c.user_id = cu.user_id
    JOIN public.staff_capability_grants g ON g.user_id = cu.user_id
      AND g.capability = 'academic_workflows' AND g.revoked_at IS NULL
    JOIN public.users su ON su.user_id = p_supervisor_user_id
    JOIN public.supervisors sp ON sp.user_id = su.user_id
    JOIN public.student_assignments sa ON sa.supervisor_id = sp.supervisor_id
      AND sa.assignment_status = 'active'
    JOIN public.students s ON s.student_id = sa.student_id
    WHERE cu.user_id = p_coordinator_user_id
      AND cu.role = 'Coordinator' AND cu.account_status = 'active'
      AND su.role = 'Supervisor' AND su.account_status = 'active'
      AND g.department_scope = public.course_department(s.course)
  );
$$;

CREATE OR REPLACE FUNCTION private.can_read_private_document(p_name text)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public SET row_security = off AS $$
  SELECT coalesce(private.get_my_role() IS NOT NULL AND (
    split_part(p_name, '/', 1) = auth.uid()::text
    OR EXISTS (SELECT 1 FROM public.students s
      WHERE split_part(p_name, '/', 1) IN (s.user_id::text, s.student_id::text)
        AND (s.user_id = auth.uid() OR private.staff_has_student(s.student_id)
          OR (private.get_my_role() = 'Supervisor' AND EXISTS (
            SELECT 1 FROM public.student_assignments sa
            JOIN public.supervisors sp ON sp.supervisor_id = sa.supervisor_id
            WHERE sa.student_id = s.student_id AND sa.assignment_status = 'active'
              AND sp.user_id = auth.uid()))))
  ), false);
$$;

CREATE OR REPLACE FUNCTION private.review_student_registration(
  p_user_id uuid, p_status text, p_reason text DEFAULT NULL
)
RETURNS TABLE(result_status text, notification_created boolean, email_queued boolean)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET row_security = off AS $$
DECLARE
  v_actor public.users%ROWTYPE;
  v_target record;
  v_reason text := nullif(left(trim(coalesce(p_reason, '')), 1000), '');
  v_message text;
  v_queue_id bigint;
BEGIN
  IF auth.uid() IS NULL OR p_user_id IS NULL OR p_status IS NULL
     OR p_status NOT IN ('active', 'rejected') THEN
    RETURN QUERY SELECT 'invalid_request', false, false;
    RETURN;
  END IF;

  SELECT * INTO v_actor FROM public.users u
  WHERE u.user_id = auth.uid() AND u.account_status = 'active' AND u.role = 'Coordinator';
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'forbidden', false, false;
    RETURN;
  END IF;

  SELECT s.student_id, s.course, u.user_id, u.full_name, u.email INTO v_target
  FROM public.users u JOIN public.students s ON s.user_id = u.user_id
  WHERE u.user_id = p_user_id AND u.role = 'Student' AND u.account_status = 'pending'
  FOR UPDATE OF u;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_found', false, false;
    RETURN;
  END IF;

  IF NOT private.staff_has_student(v_target.student_id) THEN
    RETURN QUERY SELECT 'forbidden', false, false;
    RETURN;
  END IF;

  IF p_status = 'active' AND NOT EXISTS (
    SELECT 1 FROM auth.users au WHERE au.id = p_user_id AND au.email_confirmed_at IS NOT NULL
  ) THEN
    RETURN QUERY SELECT 'email_unconfirmed', false, false;
    RETURN;
  END IF;

  UPDATE public.users u SET account_status = p_status, updated_at = now()
  WHERE u.user_id = p_user_id AND u.role = 'Student' AND u.account_status = 'pending';
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_found', false, false;
    RETURN;
  END IF;

  v_message := CASE WHEN p_status = 'active'
    THEN 'Account Verified: Welcome to CdM OJT! Please submit your pre-deployment requirements via the mobile app to unlock company assignment and daily attendance.'
    ELSE 'Registration Not Approved: ' || CASE WHEN v_reason IS NOT NULL
      THEN 'Please review the OJT Staff feedback in your account.'
      ELSE 'Please consult your Institute OJT Staff.' END
  END;
  INSERT INTO public.notifications(receiver_user_id, message, status, notification_date)
  VALUES (p_user_id, v_message, 'unread', now());

  INSERT INTO public.audit_logs(actor_user_id, action, entity_type, entity_id, details)
  VALUES (v_actor.user_id,
    CASE WHEN p_status = 'active' THEN 'STUDENT_REGISTRATION_APPROVED' ELSE 'STUDENT_REGISTRATION_REJECTED' END,
    'user', p_user_id::text,
    jsonb_build_object('status', p_status, 'reason', v_reason, 'student_id', v_target.student_id));

  SELECT pgmq.send('transactional_emails', jsonb_build_object(
    'type', 'account_status', 'to', v_target.email,
    'fullName', left(coalesce(nullif(v_target.full_name, ''), 'Trainee'), 200),
    'status', p_status, 'reason', v_reason
  )) INTO v_queue_id;
  IF v_queue_id IS NULL THEN
    RAISE EXCEPTION 'Account status email could not be queued';
  END IF;

  RETURN QUERY SELECT 'ok', true, true;
END;
$$;

COMMIT;
