-- Apply after 027 and before deploying web code that calls claim_auth_rate_limit.
BEGIN;

CREATE TABLE IF NOT EXISTS public.auth_rate_limits (
  action text NOT NULL,
  subject_hash text NOT NULL,
  window_start timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  PRIMARY KEY (action, subject_hash, window_start)
);

CREATE INDEX IF NOT EXISTS idx_auth_rate_limits_window_start
  ON public.auth_rate_limits (window_start);

ALTER TABLE public.auth_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.auth_rate_limits FROM PUBLIC, anon, authenticated;

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
     OR p_action NOT IN ('login', 'register', 'password_reset_request', 'password_reset_verify', 'id_card_upload')
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

  -- Keep the small counter table bounded without a separate scheduler.
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
