-- Apply after 029. No existing rows are deleted or regraded.
-- Test in isolated staging; this does not require a new mobile version.
BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$ BEGIN
  IF to_regprocedure('public.program_head_can_read_student(uuid)') IS NULL
     OR to_regprocedure('public.claim_auth_rate_limit(text,text,integer,integer)') IS NULL THEN
    RAISE EXCEPTION 'Apply and verify migrations 028 and 029 first';
  END IF;
END $$;

-- Legacy QR is not used by mobile GPS attendance. Fix the default/check mismatch
-- left by migration 021 without touching existing attendance records.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='attendance' AND column_name='qr_validation_status') THEN
    ALTER TABLE public.attendance ALTER COLUMN qr_validation_status SET DEFAULT NULL;
  END IF;
END $$;

-- Account changes use authenticated/authorized server actions with service_role.
DROP POLICY IF EXISTS coordinator_update_user_status ON public.users;
REVOKE INSERT, UPDATE, DELETE ON public.users FROM PUBLIC, anon, authenticated;
DO $$ DECLARE c record; BEGIN
  FOR c IN SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='users' LOOP
    EXECUTE format('REVOKE INSERT (%I), UPDATE (%I) ON public.users FROM PUBLIC, anon, authenticated', c.column_name, c.column_name);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.get_my_student_id()
RETURNS uuid LANGUAGE sql SECURITY DEFINER STABLE SET search_path=public SET row_security=off AS $$
 SELECT s.student_id FROM public.students s JOIN public.users u ON u.user_id=s.user_id
 WHERE u.user_id=auth.uid() AND u.role='Student' AND u.account_status='active';
$$;
CREATE OR REPLACE FUNCTION public.get_my_supervisor_id()
RETURNS uuid LANGUAGE sql SECURITY DEFINER STABLE SET search_path=public SET row_security=off AS $$
 SELECT s.supervisor_id FROM public.supervisors s JOIN public.users u ON u.user_id=s.user_id
 WHERE u.user_id=auth.uid() AND u.role='Supervisor' AND u.account_status='active';
$$;
REVOKE ALL ON FUNCTION public.get_my_student_id(), public.get_my_supervisor_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_student_id(), public.get_my_supervisor_id() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.supervisor_has_active_student(p_student_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path=public SET row_security=off AS $$
 SELECT EXISTS(SELECT 1 FROM public.student_assignments sa
 WHERE sa.student_id=p_student_id AND sa.supervisor_id=public.get_my_supervisor_id()
 AND sa.assignment_status='active');
$$;
CREATE OR REPLACE FUNCTION public.student_owns_active_assignment(p_student_id uuid, p_assignment_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path=public SET row_security=off AS $$
 SELECT p_student_id=public.get_my_student_id() AND EXISTS(
 SELECT 1 FROM public.student_assignments sa WHERE sa.assignment_id=p_assignment_id
 AND sa.student_id=p_student_id AND sa.assignment_status='active');
$$;
REVOKE ALL ON FUNCTION public.supervisor_has_active_student(uuid), public.student_owns_active_assignment(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervisor_has_active_student(uuid), public.student_owns_active_assignment(uuid,uuid) TO authenticated, service_role;

-- Restrictive boundaries cannot be widened by permissive legacy policies.
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['students','student_assignments','attendance','reports','evaluations','internship_progress','certificates','practicum_schedules'] LOOP
  EXECUTE format('DROP POLICY IF EXISTS active_account_boundary ON public.%I',t);
  EXECUTE format('CREATE POLICY active_account_boundary ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (public.get_my_role() IS NOT NULL) WITH CHECK (public.get_my_role() IS NOT NULL)',t);
 END LOOP;
END $$;

DROP POLICY IF EXISTS student_attendance_insert_boundary ON public.attendance;
CREATE POLICY student_attendance_insert_boundary ON public.attendance AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK(public.get_my_role()<>'Student' OR (
 verification_status='pending'
 AND public.student_owns_active_assignment(student_id,assignment_id)));
DROP POLICY IF EXISTS student_report_insert_boundary ON public.reports;
CREATE POLICY student_report_insert_boundary ON public.reports AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK(public.get_my_role()<>'Student' OR (student_id=public.get_my_student_id()
 AND status='submitted' AND supervisor_feedback IS NULL AND supervisor_endorsed_at IS NULL));
-- Students submit reports; later review fields and status are staff-controlled.
DROP POLICY IF EXISTS student_report_update_boundary ON public.reports;
CREATE POLICY student_report_update_boundary ON public.reports AS RESTRICTIVE FOR UPDATE TO authenticated
USING(public.get_my_role()<>'Student') WITH CHECK(public.get_my_role()<>'Student');
DROP POLICY IF EXISTS student_schedule_insert_boundary ON public.practicum_schedules;
CREATE POLICY student_schedule_insert_boundary ON public.practicum_schedules AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK(public.get_my_role()<>'Student' OR (student_id=public.get_my_student_id()
 AND status='pending' AND reviewed_by IS NULL AND reviewed_at IS NULL AND coordinator_feedback IS NULL));

DROP POLICY IF EXISTS supervisor_evaluation_boundary ON public.evaluations;
CREATE POLICY supervisor_evaluation_boundary ON public.evaluations AS RESTRICTIVE FOR ALL TO authenticated
USING(public.get_my_role()<>'Supervisor' OR (supervisor_id=public.get_my_supervisor_id() AND public.supervisor_has_active_student(student_id)))
WITH CHECK(public.get_my_role()<>'Supervisor' OR (supervisor_id=public.get_my_supervisor_id() AND public.supervisor_has_active_student(student_id)));
DROP POLICY IF EXISTS supervisor_attendance_boundary ON public.attendance;
CREATE POLICY supervisor_attendance_boundary ON public.attendance AS RESTRICTIVE FOR ALL TO authenticated
USING(public.get_my_role()<>'Supervisor' OR public.supervisor_has_active_student(student_id))
WITH CHECK(public.get_my_role()<>'Supervisor' OR public.supervisor_has_active_student(student_id));
DROP POLICY IF EXISTS supervisor_report_boundary ON public.reports;
CREATE POLICY supervisor_report_boundary ON public.reports AS RESTRICTIVE FOR ALL TO authenticated
USING(public.get_my_role()<>'Supervisor' OR public.supervisor_has_active_student(student_id))
WITH CHECK(public.get_my_role()<>'Supervisor' OR public.supervisor_has_active_student(student_id));

-- RLS controls rows. This trigger additionally protects field transitions.
CREATE OR REPLACE FUNCTION public.guard_ojt_client_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public SET row_security=off AS $$
DECLARE actor_role text; before_row jsonb; after_row jsonb; allowed text[];
BEGIN
 IF coalesce(current_setting('role',true),'') NOT IN ('anon','authenticated') THEN RETURN NEW; END IF;
 actor_role:=public.get_my_role();
 IF actor_role IS NULL THEN RAISE EXCEPTION 'Active account required' USING ERRCODE='42501'; END IF;
 after_row:=to_jsonb(NEW);
 IF TG_OP='UPDATE' THEN
  before_row:=to_jsonb(OLD);
  IF (after_row->'student_id') IS DISTINCT FROM (before_row->'student_id')
     OR (after_row->'user_id') IS DISTINCT FROM (before_row->'user_id')
     OR (TG_TABLE_NAME IN ('attendance','evaluations') AND
       ((after_row->'assignment_id') IS DISTINCT FROM (before_row->'assignment_id')
        OR (after_row->'supervisor_id') IS DISTINCT FROM (before_row->'supervisor_id'))) THEN
   RAISE EXCEPTION 'Record ownership cannot be changed' USING ERRCODE='42501';
  END IF;
  IF actor_role='Student' AND TG_TABLE_NAME='attendance' THEN
   allowed:=ARRAY['time_out','time_out_selfie_path','time_out_lat','time_out_lng','time_out_distance_meters','time_out_location_status','time_out_flag_reason','sync_status','synced_at','updated_at'];
   IF after_row-allowed IS DISTINCT FROM before_row-allowed OR OLD.time_out IS NOT NULL THEN
    RAISE EXCEPTION 'Only the first time-out may update a pending attendance record' USING ERRCODE='42501';
   END IF;
  ELSIF actor_role='Supervisor' AND TG_TABLE_NAME='attendance' THEN
   allowed:=ARRAY['verification_status','updated_at'];
   IF after_row-allowed IS DISTINCT FROM before_row-allowed OR OLD.verification_status<>'pending' THEN
    RAISE EXCEPTION 'Only pending attendance verification may be changed' USING ERRCODE='42501';
   END IF;
  ELSIF actor_role='Supervisor' AND TG_TABLE_NAME='reports' THEN
   allowed:=ARRAY['supervisor_feedback','supervisor_endorsed_at','updated_at'];
   IF after_row-allowed IS DISTINCT FROM before_row-allowed THEN
    RAISE EXCEPTION 'Supervisor may change endorsement fields only' USING ERRCODE='42501';
   END IF;
  ELSIF actor_role='Student' AND TG_TABLE_NAME='practicum_schedules' THEN
   IF OLD.status<>'pending' OR NEW.status<>'pending' OR NEW.reviewed_by IS NOT NULL
      OR NEW.reviewed_at IS NOT NULL OR NEW.coordinator_feedback IS NOT NULL THEN
    RAISE EXCEPTION 'Student cannot review a schedule' USING ERRCODE='42501';
   END IF;
  END IF;
 END IF;
 IF TG_TABLE_NAME='attendance' THEN
  IF NEW.time_out IS NOT NULL AND NEW.time_out<NEW.time_in THEN RAISE EXCEPTION 'Time-out precedes time-in'; END IF;
  IF NEW.attendance_date<>(NEW.time_in AT TIME ZONE 'Asia/Manila')::date THEN RAISE EXCEPTION 'Attendance date must match time-in in Asia/Manila'; END IF;
 ELSIF TG_TABLE_NAME='evaluations' THEN
  IF NEW.performance_score IS NOT NULL AND NOT (NEW.performance_score>=0 AND NEW.performance_score<=100) THEN
   RAISE EXCEPTION 'Evaluation score must be between 0 and 100';
  END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_ojt_client_write() FROM PUBLIC, anon, authenticated;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['students','attendance','reports','evaluations','practicum_schedules'] LOOP
  EXECUTE format('DROP TRIGGER IF EXISTS guard_ojt_client_write ON public.%I',t);
  EXECUTE format('CREATE TRIGGER guard_ojt_client_write BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.guard_ojt_client_write()',t);
 END LOOP;
END $$;

-- Enforce enrollment scope even when a modified client calls Auth directly.
CREATE OR REPLACE FUNCTION public.validate_new_student_registration()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF coalesce(NEW.raw_app_meta_data->>'role','Student')='Student' THEN
  IF NEW.raw_user_meta_data->>'year_level' IS DISTINCT FROM '4'
     OR public.course_department(NEW.raw_user_meta_data->>'course') IS NULL THEN
   RAISE EXCEPTION 'Registration requires a fourth-year ICS or IBE student';
  END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.validate_new_student_registration() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS validate_new_student_registration ON auth.users;
CREATE TRIGGER validate_new_student_registration BEFORE INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.validate_new_student_registration();

CREATE OR REPLACE FUNCTION public.ojt_security_revision()
RETURNS integer LANGUAGE sql STABLE SET search_path=public AS $$ SELECT 30 $$;
REVOKE ALL ON FUNCTION public.ojt_security_revision() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ojt_security_revision() TO service_role;
COMMIT;
