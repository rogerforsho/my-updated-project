BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$ BEGIN
  IF to_regprocedure('public.ojt_security_revision()') IS NULL
     OR public.ojt_security_revision() < 44
     OR to_regprocedure('private.get_my_role()') IS NULL THEN
    RAISE EXCEPTION 'Apply and verify migrations through revision 44 first';
  END IF;
END $$;

-- Super Admins (role Admin) must have completed MFA (aal2) to read user and
-- audit data; they can always read their own profile row so sign-in still works.
-- Restrictive, so it narrows every existing permissive read policy.
DROP POLICY IF EXISTS admin_mfa_read_users ON public.users;
CREATE POLICY admin_mfa_read_users ON public.users AS RESTRICTIVE FOR SELECT TO authenticated
  USING (private.get_my_role() IS DISTINCT FROM 'Admin'
    OR user_id = auth.uid()
    OR (auth.jwt() ->> 'aal') = 'aal2');

DROP POLICY IF EXISTS admin_mfa_read_audit_logs ON public.audit_logs;
CREATE POLICY admin_mfa_read_audit_logs ON public.audit_logs AS RESTRICTIVE FOR SELECT TO authenticated
  USING (private.get_my_role() IS DISTINCT FROM 'Admin'
    OR (auth.jwt() ->> 'aal') = 'aal2');

COMMIT;
