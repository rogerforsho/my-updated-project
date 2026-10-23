BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$ BEGIN
  IF to_regprocedure('public.ojt_security_revision()') IS NULL
     OR public.ojt_security_revision() < 44
     OR to_regclass('public.auth_rate_limits') IS NULL THEN
    RAISE EXCEPTION 'Apply and verify migrations through revision 44 first';
  END IF;
END $$;

-- Set when a Coordinator resets a student's password to the default (or an
-- import creates the account). The mobile app blocks use until it is cleared.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;

-- Same function as 20261019022203 with two more allowed actions.
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
       'report_upload', 'report_submit', 'attendance_submit', 'selfie_upload',
       'password_reset_admin', 'student_import'
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

COMMIT;
