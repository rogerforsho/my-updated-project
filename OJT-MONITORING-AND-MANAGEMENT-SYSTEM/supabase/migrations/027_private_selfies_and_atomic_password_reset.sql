-- Apply after 026 and before deploying code that calls consume_password_reset_otp.
BEGIN;

-- Attendance photos contain personal data. Existing public URLs stop working;
-- the web app serves authorized reviewers with short-lived signed URLs.
UPDATE storage.buckets
SET public = false
WHERE id = 'attendance-selfies';

-- Claim a reset code under a row lock before the Auth Admin password update.
-- A failed Auth update requires the user to request a new code; it never
-- leaves the same code reusable. Only the server's service role may call this.
CREATE OR REPLACE FUNCTION public.consume_password_reset_otp(
  p_email text,
  p_otp_hash text
)
RETURNS TABLE(result_status text, reset_user_id uuid)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_otp public.password_reset_otps%ROWTYPE;
BEGIN
  SELECT o.* INTO v_otp
  FROM public.password_reset_otps AS o
  WHERE o.email = lower(trim(p_email)) AND o.used = false
  ORDER BY o.created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_found'::text, NULL::uuid;
    RETURN;
  END IF;

  IF v_otp.expires_at <= now() THEN
    UPDATE public.password_reset_otps SET used = true WHERE id = v_otp.id;
    RETURN QUERY SELECT 'expired'::text, NULL::uuid;
    RETURN;
  END IF;

  IF v_otp.attempts >= 5 THEN
    UPDATE public.password_reset_otps SET used = true WHERE id = v_otp.id;
    RETURN QUERY SELECT 'exhausted'::text, NULL::uuid;
    RETURN;
  END IF;

  IF p_otp_hash IS NULL OR v_otp.otp_hash <> p_otp_hash THEN
    UPDATE public.password_reset_otps
    SET attempts = attempts + 1, used = attempts + 1 >= 5
    WHERE id = v_otp.id;
    RETURN QUERY SELECT 'invalid'::text, NULL::uuid;
    RETURN;
  END IF;

  UPDATE public.password_reset_otps SET used = true WHERE id = v_otp.id;
  RETURN QUERY SELECT 'valid'::text, v_otp.user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_password_reset_otp(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_password_reset_otp(text, text) TO service_role;

COMMIT;
