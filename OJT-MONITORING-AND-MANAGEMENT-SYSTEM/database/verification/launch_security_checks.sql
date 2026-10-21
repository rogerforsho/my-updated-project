-- READ ONLY: paste into Supabase SQL Editor before and after the rollout.
-- This returns schema/security metadata, never user rows or credentials.
-- Missing prerequisites mean STOP and inspect migration history; do not replay 001-025.
-- Function existence alone does not prove that the installed definition is correct.

SELECT name AS required_function, to_regprocedure(name) IS NOT NULL AS present
FROM (VALUES
 ('public.get_my_supervisor_id()'),
 ('public.review_student_registration(uuid,text,text)'),
 ('private.can_read_private_document(text)'),
 ('private.get_my_department()'),
 ('private.get_my_role()'),
 ('private.get_my_student_id()'),
 ('private.get_my_supervisor_id()'),
 ('private.program_head_can_read_student(uuid)'),
 ('private.program_head_can_read_user(uuid)'),
 ('private.review_student_registration(uuid,text,text)'),
 ('private.student_owns_active_assignment(uuid,uuid)'),
 ('private.supervisor_has_active_student(uuid)'),
 ('public.consume_password_reset_otp(text,text)'),
 ('public.claim_auth_rate_limit(text,text,integer,integer)'),
 ('public.guard_ojt_client_write()'),
 ('public.validate_new_student_registration()'),
 ('public.ojt_security_revision()'),
 ('public.coordinator_review_practicum_schedule(uuid,text,uuid,uuid,uuid,text,date,date)'),
 ('public.snapshot_attendance_credited_hours()'),
 ('public.validate_schedule_lunch_interval()')
) AS required(name);

-- After 033: authenticated reads/workflow writes are granted selectively; users writes remain blocked.
-- Includes separately granted column privileges, not just table grants.
SELECT role_name,
 has_table_privilege(role_name,'public.users','INSERT') AS insert_table,
 has_table_privilege(role_name,'public.users','UPDATE') AS update_table,
 has_table_privilege(role_name,'public.users','DELETE') AS delete_table,
 has_any_column_privilege(role_name,'public.users','INSERT') AS insert_any_column,
 has_any_column_privilege(role_name,'public.users','UPDATE') AS update_any_column
FROM (VALUES ('anon'),('authenticated')) AS roles(role_name);
-- After 033 expected: anonymous app-table access=false; authenticated attendance read/insert=true;
-- authenticated user updates=false; service audit/OTP access=true; direct rate-limit and QR table access=false.
SELECT
 has_table_privilege('anon','public.attendance','SELECT') AS anon_attendance_read,
 has_table_privilege('authenticated','public.attendance','SELECT') AS authenticated_attendance_read,
 has_table_privilege('authenticated','public.attendance','INSERT') AS authenticated_attendance_insert,
 has_table_privilege('authenticated','public.users','UPDATE') AS authenticated_user_update,
 has_table_privilege('service_role','public.audit_logs','INSERT') AS service_audit_insert,
 has_table_privilege('authenticated','public.auth_rate_limits','SELECT') AS authenticated_rate_limit_read,
 has_table_privilege('service_role','public.auth_rate_limits','INSERT') AS service_direct_rate_limit_insert,
 has_table_privilege('service_role','public.password_reset_otps','INSERT') AS service_otp_insert,
 has_table_privilege('authenticated','public.password_reset_otps','SELECT') AS authenticated_otp_read,
 coalesce(has_table_privilege('authenticated',to_regclass('public.qr_tokens'),'SELECT'),false) AS authenticated_qr_read;

-- After 030: all eight tables present with RLS enabled.
SELECT names.table_name, c.oid IS NOT NULL AS present, coalesce(c.relrowsecurity,false) AS rls_enabled
FROM (VALUES ('students'),('student_assignments'),('attendance'),('reports'),
 ('evaluations'),('internship_progress'),('certificates'),('practicum_schedules')) AS names(table_name)
LEFT JOIN pg_class c ON c.oid=to_regclass('public.'||names.table_name);

-- Every row must be true after its indicated migration. Revision 38 replaces the student attendance, report, and Storage write boundaries.
SELECT required.migration, required.table_name, required.policy_name,
 EXISTS(SELECT 1 FROM pg_policies p WHERE p.schemaname=required.schema_name
  AND p.tablename=required.table_name AND p.policyname=required.policy_name
  AND p.permissive='RESTRICTIVE') AS restrictive_policy_present
FROM (VALUES
 (29,'public','students','program_head_department_boundary'),
 (29,'storage','objects','private_documents_read_boundary'),
 (38,'public','attendance','student_attendance_server_insert_boundary'),
 (38,'public','attendance','student_attendance_server_update_boundary'),
 (38,'public','reports','student_report_server_insert_boundary'),
 (30,'public','reports','student_report_update_boundary'),
 (30,'public','practicum_schedules','student_schedule_insert_boundary'),
 (30,'public','evaluations','supervisor_evaluation_boundary'),
 (30,'public','attendance','supervisor_attendance_boundary'),
 (30,'public','reports','supervisor_report_boundary'),
 (31,'storage','objects','registration_id_upload_boundary'),
 (38,'storage','objects','attendance_selfies_server_insert_boundary'),
 (38,'storage','objects','attendance_selfies_server_update_boundary'),
 (38,'storage','objects','private_documents_server_insert_boundary'),
 (38,'storage','objects','private_documents_server_update_boundary')
) AS required(migration,schema_name,table_name,policy_name)
ORDER BY migration,table_name;

-- Migration 034 is intentionally permissive so it ORs with the pending-only
-- student policy; its USING/WITH CHECK expressions must remain narrowly scoped.
SELECT policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname='public' AND tablename='attendance'
  AND policyname='student_complete_verified_attendance_timeout';

-- After 035: Program Head announcement reads are restricted to their department
-- and campus-wide announcements. Expect one RESTRICTIVE SELECT policy for authenticated.
SELECT policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE schemaname='public' AND tablename='announcements'
  AND policyname='program_head_announcement_department_boundary';

-- After 030: five enabled field guards and one enabled enrollment guard.
SELECT n.nspname AS schema_name,c.relname AS table_name,t.tgname AS trigger_name,t.tgenabled
FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE NOT t.tgisinternal AND t.tgname IN ('guard_ojt_client_write','validate_new_student_registration')
ORDER BY n.nspname,c.relname;

-- After 032: schedule lunch interval and per-attendance credit snapshots exist.
SELECT required.table_name, required.column_name, EXISTS (
  SELECT 1 FROM information_schema.columns c
  WHERE c.table_schema='public' AND c.table_name=required.table_name
    AND c.column_name=required.column_name
) AS present
FROM (VALUES ('practicum_schedules','lunch_break_start'),('attendance','credited_hours')) AS required(table_name,column_name);

-- Count legacy approved schedules that still need a confirmed lunch start time.
-- Do not invent/backfill times; while null, attendance uses the legacy elapsed-hour rule.
SELECT count(*) AS approved_schedules_missing_lunch_start
FROM public.practicum_schedules
WHERE status='approved' AND lunch_break_minutes>0 AND lunch_break_start IS NULL
  AND (end_date IS NULL OR end_date>=current_date);

SELECT required.trigger_name, t.tgenabled
FROM (VALUES ('validate_schedule_lunch_interval'),('snapshot_attendance_credited_hours')) AS required(trigger_name)
LEFT JOIN pg_trigger t ON t.tgname=required.trigger_name AND NOT t.tgisinternal;

-- Both buckets must exist and be private.
SELECT names.bucket_id,b.id IS NOT NULL AS present,coalesce(NOT b.public,false) AS private
FROM (VALUES ('attendance-selfies'),('private-documents')) AS names(bucket_id)
LEFT JOIN storage.buckets b ON b.id=names.bucket_id;

-- Expected after 033: anon=false, authenticated=false, service_role=true for these restricted functions.
SELECT required.name AS function_name,
 CASE WHEN p.oid IS NOT NULL THEN has_function_privilege('anon',p.oid,'EXECUTE') END AS anon_execute,
 CASE WHEN p.oid IS NOT NULL THEN has_function_privilege('authenticated',p.oid,'EXECUTE') END AS authenticated_execute,
 CASE WHEN p.oid IS NOT NULL THEN has_function_privilege('service_role',p.oid,'EXECUTE') END AS service_execute
FROM (VALUES ('public.consume_password_reset_otp(text,text)'),
 ('public.claim_auth_rate_limit(text,text,integer,integer)'),('public.ojt_security_revision()')) AS required(name)
LEFT JOIN pg_proc p ON p.oid=to_regprocedure(required.name);

-- Inspect the private privileged role implementation and the revision marker.
-- The authorization role must come from public.users with active status; compare the revision with the app's current minimum before release.
SELECT p.oid::regprocedure AS function_name,pg_get_functiondef(p.oid) AS installed_definition
FROM pg_proc p WHERE p.oid IN (
 to_regprocedure('private.get_my_role()'),
 to_regprocedure('public.ojt_security_revision()')
);

-- Expected: no rows after 031 (old upload policy) and 029 (public certificate policy).
SELECT schemaname,tablename,policyname,roles,cmd,qual,with_check
FROM pg_policies WHERE (schemaname='storage' AND tablename='objects' AND policyname='Allow registration upload student id')
 OR (schemaname='public' AND tablename='certificates' AND policyname='public_verify_certificate');
