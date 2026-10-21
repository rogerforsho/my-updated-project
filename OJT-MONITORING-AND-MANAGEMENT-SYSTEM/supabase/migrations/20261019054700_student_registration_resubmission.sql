BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$ BEGIN
  IF to_regprocedure('public.ojt_security_revision()') IS NULL
     OR public.ojt_security_revision() < 38 THEN
    RAISE EXCEPTION 'Apply and verify migrations through security revision 38 first';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION private.resubmit_student_registration(
  p_user_id uuid,
  p_full_name text,
  p_student_number text,
  p_course text,
  p_year_level integer,
  p_id_card_front_path text,
  p_id_card_back_path text
)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
  v_student_id uuid;
  v_front_match text[];
  v_back_match text[];
BEGIN
  IF p_user_id IS NULL
     OR nullif(trim(coalesce(p_full_name, '')), '') IS NULL
     OR length(trim(p_full_name)) > 200
     OR nullif(trim(coalesce(p_student_number, '')), '') IS NULL
     OR length(trim(p_student_number)) > 64
     OR p_year_level IS DISTINCT FROM 4
     OR public.course_department(p_course) IS NULL THEN
    RETURN 'invalid_request';
  END IF;

  v_front_match := regexp_match(
    coalesce(p_id_card_front_path, ''),
    '^id-cards/([0-9]{10,16}_[a-f0-9]{24})_front\.(jpe?g|png)$', 'i'
  );
  v_back_match := regexp_match(
    coalesce(p_id_card_back_path, ''),
    '^id-cards/([0-9]{10,16}_[a-f0-9]{24})_back\.(jpe?g|png)$', 'i'
  );
  IF v_front_match IS NULL OR v_back_match IS NULL
     OR lower(v_front_match[1]) <> lower(v_back_match[1])
     OR (SELECT count(*) FROM storage.objects
         WHERE bucket_id = 'private-documents'
           AND name IN (p_id_card_front_path, p_id_card_back_path)) <> 2 THEN
    RETURN 'invalid_documents';
  END IF;

  SELECT s.student_id INTO v_student_id
  FROM public.users u
  JOIN public.students s ON s.user_id = u.user_id
  WHERE u.user_id = p_user_id
    AND u.role = 'Student'
    AND u.account_status = 'rejected'
  FOR UPDATE OF u, s;
  IF NOT FOUND THEN
    RETURN 'not_found';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.students s
    WHERE s.student_number = trim(p_student_number)
      AND s.user_id <> p_user_id
  ) THEN
    RETURN 'duplicate_student_number';
  END IF;

  UPDATE public.users
  SET full_name = trim(p_full_name), account_status = 'pending', updated_at = now()
  WHERE user_id = p_user_id;

  UPDATE public.students
  SET student_number = trim(p_student_number),
      course = trim(p_course),
      year_level = 4,
      id_card_path = p_id_card_front_path,
      id_card_front_path = p_id_card_front_path,
      id_card_back_path = p_id_card_back_path
  WHERE student_id = v_student_id;

  INSERT INTO public.audit_logs(actor_user_id, action, entity_type, entity_id, details)
  VALUES (
    p_user_id,
    'STUDENT_REGISTRATION_RESUBMITTED',
    'user',
    p_user_id::text,
    jsonb_build_object('student_id', v_student_id, 'course_department', public.course_department(p_course))
  );

  INSERT INTO public.notifications(receiver_user_id, message, status, notification_date)
  VALUES (
    p_user_id,
    'Registration Resubmitted: Your corrected registration is awaiting OJT Coordinator review.',
    'unread',
    now()
  );

  RETURN 'ok';
EXCEPTION WHEN unique_violation THEN
  RETURN 'duplicate_student_number';
END;
$$;

REVOKE ALL ON FUNCTION private.resubmit_student_registration(uuid, text, text, text, integer, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA private TO service_role;
GRANT EXECUTE ON FUNCTION private.resubmit_student_registration(uuid, text, text, text, integer, text, text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.resubmit_student_registration(
  p_user_id uuid,
  p_full_name text,
  p_student_number text,
  p_course text,
  p_year_level integer,
  p_id_card_front_path text,
  p_id_card_back_path text
)
RETURNS text
LANGUAGE sql SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT private.resubmit_student_registration(
    p_user_id, p_full_name, p_student_number, p_course,
    p_year_level, p_id_card_front_path, p_id_card_back_path
  );
$$;

REVOKE ALL ON FUNCTION public.resubmit_student_registration(uuid, text, text, text, integer, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.resubmit_student_registration(uuid, text, text, text, integer, text, text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.ojt_security_revision()
RETURNS integer LANGUAGE sql STABLE SET search_path = public AS $$ SELECT 39 $$;
REVOKE ALL ON FUNCTION public.ojt_security_revision() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ojt_security_revision() TO service_role;

COMMIT;
