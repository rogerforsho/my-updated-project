-- LOCAL DRAFT: validate in isolated staging before production rollout.
-- Apply after 028, before enabling the new Program Head workflow routes.
-- Deploy with the department-scoped services from this change. Session-client
-- listings rely on these RLS policies; do not deploy the UI changes alone.
-- No records are deleted. Missing/unknown Program Head departments fail closed.
BEGIN;

CREATE OR REPLACE FUNCTION public.course_department(p_course text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE
    WHEN upper(p_course) LIKE ANY (ARRAY['%BSIT%', '%BSCS%', '%BS-CPE%', '%BSCPE%', '%INFORMATION TECHNOLOGY%', '%COMPUTER ENGINEERING%', '%COMPUTER SCIENCE%']) THEN 'ICS'
    WHEN upper(p_course) LIKE ANY (ARRAY['%BSBA%', '%BSENTREP%', '%ENTREPRENEURSHIP%', '%HUMAN RESOURCE%', '%BSA%', '%ACCOUNTANCY%']) THEN 'IBE'
    ELSE NULL END;
$$;

CREATE OR REPLACE FUNCTION public.program_head_can_read_student(p_student_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public SET row_security = off AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    JOIN public.program_heads ph ON ph.user_id = u.user_id
    JOIN public.students s ON s.student_id = p_student_id
    WHERE u.user_id = auth.uid() AND u.role = 'ProgramHead' AND u.account_status = 'active'
      AND upper(trim(ph.department_or_program)) IN ('ICS', 'IBE')
      AND upper(trim(ph.department_or_program)) = public.course_department(s.course)
  );
$$;

CREATE OR REPLACE FUNCTION public.get_my_department()
RETURNS text LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public SET row_security = off AS $$
  SELECT upper(trim(ph.department_or_program)) FROM public.program_heads ph
  JOIN public.users u ON u.user_id = ph.user_id
  WHERE u.user_id = auth.uid() AND u.role = 'ProgramHead' AND u.account_status = 'active'
    AND upper(trim(ph.department_or_program)) IN ('ICS', 'IBE');
$$;

CREATE OR REPLACE FUNCTION public.program_head_can_read_user(p_user_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public SET row_security = off AS $$
  SELECT p_user_id = auth.uid() OR EXISTS (
    SELECT 1 FROM public.users u JOIN public.supervisors sp ON sp.user_id = u.user_id
    WHERE u.user_id = p_user_id AND u.role = 'Supervisor' AND u.account_status = 'active'
  ) OR EXISTS (
    SELECT 1 FROM public.students s WHERE s.user_id = p_user_id
      AND public.program_head_can_read_student(s.student_id)
  );
$$;

REVOKE ALL ON FUNCTION public.course_department(text), public.program_head_can_read_student(uuid), public.program_head_can_read_user(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.course_department(text), public.program_head_can_read_student(uuid), public.program_head_can_read_user(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_my_department() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_department() TO authenticated, service_role;

-- Restrictive policies intersect with existing permissive policies, so a broad
-- legacy SELECT policy cannot bypass the Program Head department boundary.
DO $$
DECLARE table_name text; scope_expression text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['students', 'student_assignments', 'attendance', 'reports', 'evaluations', 'internship_progress', 'certificates', 'practicum_schedules'] LOOP
    scope_expression := CASE WHEN table_name = 'students'
      THEN 'public.course_department(course) = public.get_my_department()'
      ELSE 'public.program_head_can_read_student(student_id)' END;
    EXECUTE format('DROP POLICY IF EXISTS program_head_department_boundary ON public.%I', table_name);
    EXECUTE format('CREATE POLICY program_head_department_boundary ON public.%I AS RESTRICTIVE FOR SELECT TO authenticated USING (coalesce(public.get_my_role(), '''') <> ''ProgramHead'' OR public.program_head_can_read_student(student_id))', table_name);
    EXECUTE format('DROP POLICY IF EXISTS program_head_no_insert ON public.%I', table_name);
    EXECUTE format('CREATE POLICY program_head_no_insert ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (coalesce(public.get_my_role(), '''') <> ''ProgramHead'' OR (%L = ''student_assignments'' AND %s))', table_name, table_name, scope_expression);
    EXECUTE format('DROP POLICY IF EXISTS program_head_no_update ON public.%I', table_name);
    EXECUTE format('CREATE POLICY program_head_no_update ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING (coalesce(public.get_my_role(), '''') <> ''ProgramHead'' OR (%L IN (''students'', ''student_assignments'', ''reports'', ''evaluations'', ''practicum_schedules'') AND %s)) WITH CHECK (coalesce(public.get_my_role(), '''') <> ''ProgramHead'' OR (%L IN (''students'', ''student_assignments'', ''reports'', ''evaluations'', ''practicum_schedules'') AND %s))', table_name, table_name, scope_expression, table_name, scope_expression);
    EXECUTE format('DROP POLICY IF EXISTS program_head_no_delete ON public.%I', table_name);
    EXECUTE format('CREATE POLICY program_head_no_delete ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING (coalesce(public.get_my_role(), '''') <> ''ProgramHead'')', table_name);
  END LOOP;
END;
$$;

DROP POLICY IF EXISTS program_head_department_users ON public.users;
CREATE POLICY program_head_department_users ON public.users AS RESTRICTIVE
FOR SELECT TO authenticated USING (
  coalesce(public.get_my_role(), '') <> 'ProgramHead' OR public.program_head_can_read_user(user_id)
);
DROP POLICY IF EXISTS program_head_read_department_users ON public.users;
CREATE POLICY program_head_read_department_users ON public.users
FOR SELECT TO authenticated USING (public.get_my_role() = 'ProgramHead' AND public.program_head_can_read_user(user_id));

-- User-confirmed scope: department approvals, assignments, schedules and grading.
-- Student account activation stays in the server action; do not grant general
-- UPDATE on users, which could allow role changes through direct client calls.
DROP POLICY IF EXISTS coordinator_admin_update_reports ON public.reports;
CREATE POLICY coordinator_admin_update_reports ON public.reports FOR UPDATE TO authenticated
USING (public.get_my_role() IN ('Coordinator', 'Admin') OR public.program_head_can_read_student(student_id))
WITH CHECK (public.get_my_role() IN ('Coordinator', 'Admin') OR public.program_head_can_read_student(student_id));
DROP POLICY IF EXISTS coordinator_admin_update_students ON public.students;
CREATE POLICY coordinator_admin_update_students ON public.students FOR UPDATE TO authenticated
USING (public.get_my_role() IN ('Coordinator', 'Admin') OR public.course_department(course) = public.get_my_department())
WITH CHECK (public.get_my_role() IN ('Coordinator', 'Admin') OR public.course_department(course) = public.get_my_department());

DROP POLICY IF EXISTS program_head_read_reports ON public.reports;
CREATE POLICY program_head_read_reports ON public.reports FOR SELECT TO authenticated USING (public.program_head_can_read_student(student_id));
DROP POLICY IF EXISTS program_head_insert_assignment ON public.student_assignments;
CREATE POLICY program_head_insert_assignment ON public.student_assignments FOR INSERT TO authenticated WITH CHECK (public.program_head_can_read_student(student_id));
DROP POLICY IF EXISTS program_head_update_assignment ON public.student_assignments;
CREATE POLICY program_head_update_assignment ON public.student_assignments FOR UPDATE TO authenticated
USING (public.program_head_can_read_student(student_id)) WITH CHECK (public.program_head_can_read_student(student_id));
DROP POLICY IF EXISTS department_staff_update_evaluations ON public.evaluations;
CREATE POLICY department_staff_update_evaluations ON public.evaluations FOR UPDATE TO authenticated
USING (public.get_my_role() IN ('Coordinator', 'Admin') OR public.program_head_can_read_student(student_id))
WITH CHECK (public.get_my_role() IN ('Coordinator', 'Admin') OR public.program_head_can_read_student(student_id));
DROP POLICY IF EXISTS program_head_update_schedule ON public.practicum_schedules;
CREATE POLICY program_head_update_schedule ON public.practicum_schedules FOR UPDATE TO authenticated
USING (public.program_head_can_read_student(student_id)) WITH CHECK (public.program_head_can_read_student(student_id));

-- Public verification continues through verifyCertificatePublic's exact code
-- lookup on the server. Anonymous clients cannot enumerate the backing table.
DROP POLICY IF EXISTS public_verify_certificate ON public.certificates;
DROP POLICY IF EXISTS coordinator_admin_manage_certificates ON public.certificates;
REVOKE ALL ON public.certificates FROM anon;
CREATE POLICY coordinator_admin_manage_certificates ON public.certificates FOR ALL TO authenticated
USING (public.get_my_role() IN ('Coordinator', 'Admin')) WITH CHECK (public.get_my_role() IN ('Coordinator', 'Admin'));
DROP POLICY IF EXISTS student_or_department_read_certificates ON public.certificates;
CREATE POLICY student_or_department_read_certificates ON public.certificates FOR SELECT TO authenticated
USING ((public.get_my_role() = 'Student' AND student_id = public.get_my_student_id()) OR public.program_head_can_read_student(student_id));

CREATE OR REPLACE FUNCTION public.can_read_private_document(p_name text)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public SET row_security = off AS $$
  SELECT coalesce(public.get_my_role() IS NOT NULL AND (
    public.get_my_role() IN ('Coordinator', 'Admin')
    OR split_part(p_name, '/', 1) = auth.uid()::text
    OR EXISTS (
      SELECT 1 FROM public.students s
      WHERE split_part(p_name, '/', 1) IN (s.user_id::text, s.student_id::text)
        AND (s.user_id = auth.uid()
          OR public.program_head_can_read_student(s.student_id)
          OR (public.get_my_role() = 'Supervisor' AND EXISTS (
            SELECT 1 FROM public.student_assignments sa JOIN public.supervisors sp ON sp.supervisor_id = sa.supervisor_id
            WHERE sa.student_id = s.student_id AND sa.assignment_status = 'active' AND sp.user_id = auth.uid()
          )))
    )
  ), false);
$$;
REVOKE ALL ON FUNCTION public.can_read_private_document(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_read_private_document(text) TO authenticated, service_role;

DROP POLICY IF EXISTS private_documents_scoped_select ON storage.objects;
CREATE POLICY private_documents_scoped_select ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'private-documents' AND public.can_read_private_document(name));
DROP POLICY IF EXISTS private_documents_read_boundary ON storage.objects;
CREATE POLICY private_documents_read_boundary ON storage.objects AS RESTRICTIVE FOR SELECT TO authenticated
USING (bucket_id <> 'private-documents' OR public.can_read_private_document(name));

COMMIT;
