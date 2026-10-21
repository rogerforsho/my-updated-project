-- Apply after deploying the BFF routes and a mobile client that uses signed
-- upload tokens. This closes the older direct student write paths.
BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$ BEGIN
  IF to_regprocedure('public.ojt_security_revision()') IS NULL
     OR public.ojt_security_revision() < 37 THEN
    RAISE EXCEPTION 'Apply and verify security revision 37 first';
  END IF;
END $$;

-- The BFF checks ownership, file contents, assignment, and location before
-- writing with service_role. Keep student reads and staff review writes intact.
DROP POLICY IF EXISTS student_attendance_insert_boundary ON public.attendance;
DROP POLICY IF EXISTS student_attendance_server_insert_boundary ON public.attendance;
CREATE POLICY student_attendance_server_insert_boundary ON public.attendance
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (private.get_my_role() <> 'Student');
DROP POLICY IF EXISTS student_attendance_server_update_boundary ON public.attendance;
CREATE POLICY student_attendance_server_update_boundary ON public.attendance
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (private.get_my_role() <> 'Student')
  WITH CHECK (private.get_my_role() <> 'Student');

DROP POLICY IF EXISTS student_report_insert_boundary ON public.reports;
DROP POLICY IF EXISTS student_report_server_insert_boundary ON public.reports;
CREATE POLICY student_report_server_insert_boundary ON public.reports
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (private.get_my_role() <> 'Student');

-- Direct authenticated uploads bypass application-level rate limits. Upload
-- tokens are issued by the authenticated server routes and used without Storage
-- object-table permissions.
DROP POLICY IF EXISTS attendance_selfies_server_insert_boundary ON storage.objects;
CREATE POLICY attendance_selfies_server_insert_boundary ON storage.objects
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (bucket_id <> 'attendance-selfies');
DROP POLICY IF EXISTS attendance_selfies_server_update_boundary ON storage.objects;
CREATE POLICY attendance_selfies_server_update_boundary ON storage.objects
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (bucket_id <> 'attendance-selfies')
  WITH CHECK (bucket_id <> 'attendance-selfies');

DROP POLICY IF EXISTS private_documents_server_insert_boundary ON storage.objects;
CREATE POLICY private_documents_server_insert_boundary ON storage.objects
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (bucket_id <> 'private-documents');
DROP POLICY IF EXISTS private_documents_server_update_boundary ON storage.objects;
CREATE POLICY private_documents_server_update_boundary ON storage.objects
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (bucket_id <> 'private-documents')
  WITH CHECK (bucket_id <> 'private-documents');

CREATE OR REPLACE FUNCTION public.ojt_security_revision()
RETURNS integer LANGUAGE sql STABLE SET search_path = public AS $$ SELECT 38 $$;
REVOKE ALL ON FUNCTION public.ojt_security_revision() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ojt_security_revision() TO service_role;

COMMIT;
