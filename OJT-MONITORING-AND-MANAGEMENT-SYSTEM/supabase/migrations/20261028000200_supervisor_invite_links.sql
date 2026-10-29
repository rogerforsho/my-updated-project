BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$ BEGIN
  IF to_regprocedure('public.ojt_security_revision()') IS NULL
     OR public.ojt_security_revision() < 44 THEN
    RAISE EXCEPTION 'Apply and verify migrations through revision 44 first';
  END IF;
END $$;

-- Coordinator-issued Supervisor invite links. Only the SHA-256 hash of the token is stored,
-- so a database read never reveals a usable link. A link serves at most two sign-ups
-- (max_uses) within seven days, and the coordinator can revoke it at any time.
CREATE TABLE IF NOT EXISTS public.supervisor_invites (
  invite_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  department text NOT NULL CHECK (department IN ('ICS', 'IBE')),
  company_id uuid NOT NULL REFERENCES public.companies(company_id) ON DELETE CASCADE,
  created_by uuid REFERENCES public.users(user_id) ON DELETE SET NULL,
  max_uses integer NOT NULL DEFAULT 2 CHECK (max_uses BETWEEN 1 AND 2),
  use_count integer NOT NULL DEFAULT 0 CHECK (use_count >= 0),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (use_count <= max_uses)
);
CREATE INDEX IF NOT EXISTS idx_supervisor_invites_dept ON public.supervisor_invites (department, created_at DESC);

-- Server-only: the web server (service role) issues, lists, revokes and claims invites.
ALTER TABLE public.supervisor_invites ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.supervisor_invites FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.supervisor_invites TO service_role;

-- Atomically takes one use. The single UPDATE is what stops two simultaneous sign-ups
-- from both taking the last use. Returns no row when the link is unusable.
CREATE OR REPLACE FUNCTION public.claim_supervisor_invite(p_token_hash text)
RETURNS TABLE (invite_id uuid, company_id uuid, department text)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.supervisor_invites i
  SET use_count = i.use_count + 1
  WHERE i.token_hash = p_token_hash
    AND i.revoked_at IS NULL
    AND i.expires_at > now()
    AND i.use_count < i.max_uses
  RETURNING i.invite_id, i.company_id, i.department;
$$;

-- Gives a use back when the account could not be created (for example the email already exists).
CREATE OR REPLACE FUNCTION public.release_supervisor_invite(p_invite_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.supervisor_invites SET use_count = use_count - 1 WHERE invite_id = p_invite_id AND use_count > 0;
$$;

REVOKE ALL ON FUNCTION public.claim_supervisor_invite(text), public.release_supervisor_invite(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_supervisor_invite(text), public.release_supervisor_invite(uuid) TO service_role;

COMMIT;
