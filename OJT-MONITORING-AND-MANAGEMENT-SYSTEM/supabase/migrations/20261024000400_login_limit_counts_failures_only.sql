BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$ BEGIN
  IF to_regprocedure('public.ojt_security_revision()') IS NULL
     OR public.ojt_security_revision() < 44
     OR to_regclass('public.auth_rate_limits') IS NULL THEN
    RAISE EXCEPTION 'Apply and verify migrations through revision 44 first';
  END IF;
END $$;

-- claim_auth_rate_limit counts the attempt before the password is checked.
-- A successful login calls this to give that attempt back, so only failed
-- logins consume the budget.
CREATE OR REPLACE FUNCTION public.release_auth_rate_limit(
  p_action text,
  p_subject_hash text,
  p_window_seconds integer
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
BEGIN
  IF p_action IS DISTINCT FROM 'login'
     OR p_subject_hash IS NULL OR p_subject_hash !~ '^[0-9a-f]{64}$'
     OR p_window_seconds IS NULL OR p_window_seconds < 60 OR p_window_seconds > 86400 THEN
    RAISE EXCEPTION 'Invalid rate limit parameters';
  END IF;

  UPDATE public.auth_rate_limits
     SET attempts = greatest(attempts - 1, 0)
   WHERE action = p_action
     AND subject_hash = p_subject_hash
     AND window_start = to_timestamp(floor(extract(epoch FROM clock_timestamp()) / p_window_seconds) * p_window_seconds);
END;
$$;

REVOKE ALL ON FUNCTION public.release_auth_rate_limit(text, text, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_auth_rate_limit(text, text, integer) TO service_role;

COMMIT;
