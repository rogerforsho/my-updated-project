BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$ BEGIN
  IF to_regprocedure('public.ojt_security_revision()') IS NULL
     OR public.ojt_security_revision() < 41
     OR to_regprocedure('private.get_my_role()') IS NULL
     OR to_regprocedure('private.get_my_student_id()') IS NULL
     OR to_regprocedure('private.staff_has_student(uuid)') IS NULL
     OR to_regclass('public.evaluation_appeals') IS NULL THEN
    RAISE EXCEPTION 'Apply and verify authorization and migrations through revision 41 first';
  END IF;
END $$;

ALTER TABLE public.certificates
  ADD COLUMN IF NOT EXISTS finalized_at timestamptz NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS public.ojt_final_grades (
  student_id uuid PRIMARY KEY REFERENCES public.students(student_id) ON DELETE RESTRICT,
  final_grade numeric(3,2) NOT NULL CHECK (final_grade BETWEEN 1.00 AND 5.00),
  recorded_by_user_id uuid NOT NULL REFERENCES public.users(user_id) ON DELETE RESTRICT,
  recorded_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ojt_final_grades ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ojt_final_grades FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.ojt_final_grades TO authenticated;
GRANT INSERT, UPDATE ON public.ojt_final_grades TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ojt_final_grades TO service_role;
DROP POLICY IF EXISTS ojt_final_grade_read ON public.ojt_final_grades;
CREATE POLICY ojt_final_grade_read ON public.ojt_final_grades FOR SELECT TO authenticated
  USING ((private.get_my_role() = 'Student' AND student_id = private.get_my_student_id())
    OR (private.get_my_role() = 'Coordinator' AND private.staff_has_student(student_id)));
DROP POLICY IF EXISTS ojt_final_grade_coordinator_write ON public.ojt_final_grades;
CREATE POLICY ojt_final_grade_coordinator_write ON public.ojt_final_grades FOR ALL TO authenticated
  USING (private.get_my_role() = 'Coordinator' AND private.staff_has_student(student_id))
  WITH CHECK (private.get_my_role() = 'Coordinator' AND private.staff_has_student(student_id)
    AND recorded_by_user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.guard_ojt_final_grade()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' SET row_security = off AS $$
BEGIN
  IF private.get_my_role() IS DISTINCT FROM 'Coordinator'
     OR NOT private.staff_has_student(NEW.student_id)
     OR NEW.recorded_by_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Only the assigned OJT Coordinator may record this final grade' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.certificates WHERE student_id = NEW.student_id) THEN
    RAISE EXCEPTION 'A finalized OJT grade cannot be changed' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    NEW.recorded_at := now();
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_ojt_final_grade() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS guard_ojt_final_grade ON public.ojt_final_grades;
CREATE TRIGGER guard_ojt_final_grade BEFORE INSERT OR UPDATE ON public.ojt_final_grades
  FOR EACH ROW EXECUTE FUNCTION public.guard_ojt_final_grade();

CREATE OR REPLACE FUNCTION public.audit_ojt_final_grade()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' SET row_security = off AS $$
BEGIN
  INSERT INTO public.audit_logs(actor_user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), CASE WHEN TG_OP = 'INSERT' THEN 'OJT_FINAL_GRADE_RECORDED' ELSE 'OJT_FINAL_GRADE_UPDATED' END,
    'ojt_final_grade', NEW.student_id,
    jsonb_build_object('final_grade', NEW.final_grade, 'previous_grade', CASE WHEN TG_OP = 'UPDATE' THEN OLD.final_grade END));
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.audit_ojt_final_grade() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS audit_ojt_final_grade ON public.ojt_final_grades;
CREATE TRIGGER audit_ojt_final_grade AFTER INSERT OR UPDATE ON public.ojt_final_grades
  FOR EACH ROW EXECUTE FUNCTION public.audit_ojt_final_grade();

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM public.certificates GROUP BY student_id HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Resolve duplicate completion certificates per student before applying the completion lock';
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS uq_certificates_one_per_student
  ON public.certificates(student_id);
GRANT INSERT, UPDATE ON public.certificates TO authenticated;

CREATE OR REPLACE FUNCTION public.guard_ojt_completion_certificate()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF private.get_my_role() IS DISTINCT FROM 'Coordinator' THEN
      RAISE EXCEPTION 'Only an OJT Coordinator may finalize OJT' USING ERRCODE = '42501';
    END IF;
    PERFORM 1 FROM public.ojt_final_grades g
      WHERE g.student_id = NEW.student_id AND g.final_grade <= 3.00 FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'A passing final OJT grade (1.00–3.00) is required before completion' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF current_user = 'postgres' THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'Finalized completion records cannot be deleted' USING ERRCODE = '42501';
  END IF;

  IF ROW(NEW.student_id, NEW.verification_code, NEW.hours_rendered,
         NEW.host_company_name, NEW.academic_year,
         NEW.finalized_at, NEW.issued_at, NEW.issued_by_user_id)
     IS DISTINCT FROM
     ROW(OLD.student_id, OLD.verification_code, OLD.hours_rendered,
         OLD.host_company_name, OLD.academic_year,
         OLD.finalized_at, OLD.issued_at, OLD.issued_by_user_id) THEN
    RAISE EXCEPTION 'Finalized completion details are immutable' USING ERRCODE = '42501';
  END IF;

  IF OLD.status = 'revoked' AND NEW.status <> 'revoked' THEN
    RAISE EXCEPTION 'A revoked completion certificate cannot be reactivated' USING ERRCODE = '42501';
  END IF;
  IF NEW.status = 'revoked' AND NULLIF(btrim(NEW.revocation_reason), '') IS NULL THEN
    RAISE EXCEPTION 'Certificate revocation requires a reason' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_ojt_completion_certificate() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS guard_ojt_completion_certificate ON public.certificates;
CREATE TRIGGER guard_ojt_completion_certificate
  BEFORE INSERT OR UPDATE OR DELETE ON public.certificates
  FOR EACH ROW EXECUTE FUNCTION public.guard_ojt_completion_certificate();

CREATE OR REPLACE FUNCTION public.prevent_mutation_after_ojt_completion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  affected_student_ids uuid[] := ARRAY[]::uuid[];
BEGIN
  IF TG_OP <> 'INSERT' THEN
    affected_student_ids := array_append(affected_student_ids, (to_jsonb(OLD) ->> 'student_id')::uuid);
  END IF;
  IF TG_OP <> 'DELETE' THEN
    affected_student_ids := array_append(affected_student_ids, (to_jsonb(NEW) ->> 'student_id')::uuid);
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.certificates c
    WHERE c.student_id = ANY(affected_student_ids)
  ) THEN
    RAISE EXCEPTION 'OJT records are read-only after Coordinator completion' USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.prevent_mutation_after_ojt_completion() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'attendance', 'reports', 'evaluations', 'evaluation_appeals', 'internship_progress',
    'practicum_schedules', 'student_assignments'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS prevent_mutation_after_ojt_completion ON public.%I', t);
    EXECUTE format(
      'CREATE TRIGGER prevent_mutation_after_ojt_completion BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.prevent_mutation_after_ojt_completion()',
      t
    );
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.ojt_security_revision()
RETURNS integer LANGUAGE sql IMMUTABLE AS $$ SELECT 42 $$;
REVOKE ALL ON FUNCTION public.ojt_security_revision() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ojt_security_revision() TO service_role;

COMMIT;
