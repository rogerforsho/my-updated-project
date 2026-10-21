-- ==============================================================================
-- MIGRATION 024: COMPREHENSIVE BACKEND RLS, INTEGRITY & SECURITY REMEDIATION
-- Colegio de Montalban — Cross-Platform OJT Monitoring and Management System
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. REPORTS: Student Insert & Coordinator/Admin Review Policies
-- Fixes critical blocker where student report submission and coordinator review
-- were denied by RLS due to missing INSERT and coordinator UPDATE policies.
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "student_insert_own_reports" ON public.reports;
CREATE POLICY "student_insert_own_reports" ON public.reports
  FOR INSERT TO authenticated
  WITH CHECK (student_id = get_my_student_id());

DROP POLICY IF EXISTS "coordinator_admin_update_reports" ON public.reports;
CREATE POLICY "coordinator_admin_update_reports" ON public.reports
  FOR UPDATE TO authenticated
  USING (get_my_role() IN ('Coordinator', 'Admin', 'ProgramHead'))
  WITH CHECK (get_my_role() IN ('Coordinator', 'Admin', 'ProgramHead'));

-- ------------------------------------------------------------------------------
-- 2. STUDENTS: Coordinator & Admin Update Policy
-- Allows coordinators/admins to update student lifecycle status (active, dropped,
-- completed) and configure required_hours per assignment.
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "coordinator_admin_update_students" ON public.students;
CREATE POLICY "coordinator_admin_update_students" ON public.students
  FOR UPDATE TO authenticated
  USING (get_my_role() IN ('Coordinator', 'Admin', 'ProgramHead'))
  WITH CHECK (get_my_role() IN ('Coordinator', 'Admin', 'ProgramHead'));

-- ------------------------------------------------------------------------------
-- 3. STUDENT ASSIGNMENTS: Align Admin Privileges with Coordinator
-- Ensures Admins can create and reassign placements alongside Coordinators.
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "coordinator_insert_assignment" ON public.student_assignments;
CREATE POLICY "coordinator_insert_assignment" ON public.student_assignments
  FOR INSERT TO authenticated
  WITH CHECK (get_my_role() IN ('Coordinator', 'Admin'));

DROP POLICY IF EXISTS "coordinator_update_assignment" ON public.student_assignments;
CREATE POLICY "coordinator_update_assignment" ON public.student_assignments
  FOR UPDATE TO authenticated
  USING (get_my_role() IN ('Coordinator', 'Admin'))
  WITH CHECK (get_my_role() IN ('Coordinator', 'Admin'));

-- ------------------------------------------------------------------------------
-- 4. NOTIFICATIONS: User Update (Mark As Read) Policy
-- Allows mobile and web users to mark their own notifications as read.
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "users_update_own_notifications" ON public.notifications;
CREATE POLICY "users_update_own_notifications" ON public.notifications
  FOR UPDATE TO authenticated
  USING (receiver_user_id = auth.uid())
  WITH CHECK (receiver_user_id = auth.uid());

-- ------------------------------------------------------------------------------
-- 5. EVALUATIONS: Supervisor Insert & Update Policies
-- Authorizes supervisors to submit and update evaluations for their assigned trainees.
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "supervisor_insert_evaluations" ON public.evaluations;
CREATE POLICY "supervisor_insert_evaluations" ON public.evaluations
  FOR INSERT TO authenticated
  WITH CHECK (supervisor_id = get_my_supervisor_id());

DROP POLICY IF EXISTS "supervisor_update_evaluations" ON public.evaluations;
CREATE POLICY "supervisor_update_evaluations" ON public.evaluations
  FOR UPDATE TO authenticated
  USING (supervisor_id = get_my_supervisor_id())
  WITH CHECK (supervisor_id = get_my_supervisor_id());

-- ------------------------------------------------------------------------------
-- 6. ADMINS: Read Policy
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "admins_read_policy" ON public.admins;
CREATE POLICY "admins_read_policy" ON public.admins
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR get_my_role() = 'Admin');

-- ------------------------------------------------------------------------------
-- 7. COMPANIES: Program Head Read Access
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "read_active_companies" ON public.companies;
CREATE POLICY "read_active_companies" ON public.companies
  FOR SELECT USING (
    status = 'active' OR get_my_role() IN ('Coordinator', 'Admin', 'ProgramHead')
  );

-- ------------------------------------------------------------------------------
-- 8. STORAGE RLS: Dual Support for Web (auth.uid) & Mobile (student_id)
-- Harmonizes storage pathing across both platforms for 'private-documents'.
-- Also grants supervisors read access to assigned trainees' document attachments.
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "private_documents_user_insert" ON storage.objects;
CREATE POLICY "private_documents_user_insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'private-documents' 
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR (storage.foldername(name))[1] = (SELECT student_id::text FROM public.students WHERE user_id = auth.uid())
    OR (SELECT role FROM public.users WHERE user_id = auth.uid()) IN ('Coordinator', 'Admin')
  )
);

DROP POLICY IF EXISTS "private_documents_scoped_select" ON storage.objects;
CREATE POLICY "private_documents_scoped_select"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'private-documents' 
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR (storage.foldername(name))[1] = (SELECT student_id::text FROM public.students WHERE user_id = auth.uid())
    OR (SELECT role FROM public.users WHERE user_id = auth.uid()) IN ('Coordinator', 'Admin', 'ProgramHead', 'Supervisor')
  )
);

DROP POLICY IF EXISTS "private_documents_user_update" ON storage.objects;
CREATE POLICY "private_documents_user_update"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'private-documents' 
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR (storage.foldername(name))[1] = (SELECT student_id::text FROM public.students WHERE user_id = auth.uid())
    OR (SELECT role FROM public.users WHERE user_id = auth.uid()) IN ('Coordinator', 'Admin')
  )
)
WITH CHECK (
  bucket_id = 'private-documents' 
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR (storage.foldername(name))[1] = (SELECT student_id::text FROM public.students WHERE user_id = auth.uid())
    OR (SELECT role FROM public.users WHERE user_id = auth.uid()) IN ('Coordinator', 'Admin')
  )
);

-- ------------------------------------------------------------------------------
-- 9. TRIGGER: Attendance Deletion Hour Recalculation
-- Ensures deleted attendance rows immediately trigger rendered-hour recomputation.
-- ------------------------------------------------------------------------------
DROP TRIGGER IF EXISTS on_attendance_verified ON public.attendance;
CREATE TRIGGER on_attendance_verified
  AFTER INSERT OR UPDATE OF verification_status, time_in, time_out OR DELETE ON public.attendance
  FOR EACH ROW EXECUTE PROCEDURE public.recompute_internship_progress();
