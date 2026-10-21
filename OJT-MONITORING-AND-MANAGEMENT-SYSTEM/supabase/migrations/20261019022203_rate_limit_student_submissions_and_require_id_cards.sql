-- Apply after security revision 36 and before deploying code that uses these
-- rate-limit actions. The follow-up migration closes legacy direct write paths.
BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$ BEGIN
  IF to_regprocedure('public.ojt_security_revision()') IS NULL
     OR public.ojt_security_revision() < 36 THEN
    RAISE EXCEPTION 'Apply and verify migrations through security revision 36 first';
  END IF;
END $$;

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS id_card_front_path text,
  ADD COLUMN IF NOT EXISTS id_card_back_path text;
UPDATE public.students
SET id_card_front_path = id_card_path
WHERE id_card_front_path IS NULL AND id_card_path IS NOT NULL;

-- Add server-side counters for the student upload and submit endpoints.
CREATE OR REPLACE FUNCTION public.claim_auth_rate_limit(
  p_action text,
  p_subject_hash text,
  p_max_attempts integer,
  p_window_seconds integer
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
  v_window_start timestamptz;
  v_attempts integer;
BEGIN
  IF p_action IS NULL
     OR p_action NOT IN (
       'login', 'register', 'password_reset_request', 'password_reset_verify', 'id_card_upload',
       'report_upload', 'report_submit', 'attendance_submit', 'selfie_upload'
     )
     OR p_subject_hash IS NULL OR p_subject_hash !~ '^[0-9a-f]{64}$'
     OR p_max_attempts IS NULL OR p_max_attempts < 1 OR p_max_attempts > 100
     OR p_window_seconds IS NULL OR p_window_seconds < 60 OR p_window_seconds > 86400 THEN
    RAISE EXCEPTION 'Invalid rate limit parameters';
  END IF;

  v_window_start := to_timestamp(
    floor(extract(epoch FROM clock_timestamp()) / p_window_seconds) * p_window_seconds
  );

  INSERT INTO public.auth_rate_limits AS limits (action, subject_hash, window_start, attempts)
  VALUES (p_action, p_subject_hash, v_window_start, 1)
  ON CONFLICT (action, subject_hash, window_start)
  DO UPDATE SET attempts = limits.attempts + 1
  RETURNING attempts INTO v_attempts;

  IF v_attempts = p_max_attempts + 1 THEN
    INSERT INTO public.audit_logs (actor_user_id, action, entity_type, details)
    VALUES (NULL, 'RATE_LIMIT_BLOCKED', 'auth', jsonb_build_object('action', p_action));
  END IF;

  IF random() < 0.01 THEN
    DELETE FROM public.auth_rate_limits WHERE window_start < now() - interval '7 days';
  END IF;

  RETURN v_attempts <= p_max_attempts;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_auth_rate_limit(text, text, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_auth_rate_limit(text, text, integer, integer)
  TO service_role;

-- Keep direct Auth sign-up from creating a Student without both ID references.
-- The registration service additionally verifies the stored image bytes.
CREATE OR REPLACE FUNCTION public.validate_new_student_registration()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_front text;
  v_back text;
  v_front_match text[];
  v_back_match text[];
  v_object_count integer;
BEGIN
  IF coalesce(NEW.raw_app_meta_data->>'role', 'Student') = 'Student' THEN
    IF NEW.raw_user_meta_data->>'year_level' IS DISTINCT FROM '4'
       OR public.course_department(NEW.raw_user_meta_data->>'course') IS NULL THEN
      RAISE EXCEPTION 'Registration requires a fourth-year ICS or IBE student';
    END IF;
    v_front := nullif(trim(coalesce(NEW.raw_user_meta_data->>'id_card_front_path', NEW.raw_user_meta_data->>'id_card_path', '')), '');
    v_back := nullif(trim(coalesce(NEW.raw_user_meta_data->>'id_card_back_path', '')), '');
    v_front_match := regexp_match(v_front, '^id-cards/([0-9]{10,16}_[a-f0-9]{24})_front\.(jpe?g|png)$', 'i');
    v_back_match := regexp_match(v_back, '^id-cards/([0-9]{10,16}_[a-f0-9]{24})_back\.(jpe?g|png)$', 'i');
    IF v_front_match IS NULL OR v_back_match IS NULL OR lower(v_front_match[1]) <> lower(v_back_match[1]) THEN
      RAISE EXCEPTION 'Registration requires both sides of the student ID';
    END IF;
    SELECT count(*) INTO v_object_count FROM storage.objects
    WHERE bucket_id = 'private-documents' AND name IN (v_front, v_back);
    IF v_object_count <> 2 THEN
      RAISE EXCEPTION 'Registration requires both uploaded student ID images';
    END IF;
  END IF;
  RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION public.validate_new_student_registration() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.ojt_security_revision()
RETURNS integer LANGUAGE sql STABLE SET search_path = public AS $$ SELECT 37 $$;
REVOKE ALL ON FUNCTION public.ojt_security_revision() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ojt_security_revision() TO service_role;

COMMIT;
