-- ==============================================================================
-- MIGRATION 022: REMEDIATE SUPABASE SECURITY LINTER WARNINGS
-- Colegio de Montalban — Cross-Platform OJT Monitoring and Management System
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. FIX: public_bucket_allows_listing (attendance-selfies)
-- Drop overly broad SELECT policies on storage.objects that allowed any client
-- to enumerate and list all files in the public bucket via the Storage API.
-- Public URL direct object access remains fully functional without these policies.
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Allow public/authenticated read for attendance-selfies" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view attendance selfies" ON storage.objects;

-- ------------------------------------------------------------------------------
-- 2. FIX: anon_security_definer_function_executable & authenticated_security_definer
-- Trigger functions must NEVER be exposed as callable RPC endpoints via PostgREST.
-- Revoke EXECUTE privileges from public, anon, and authenticated roles.
-- ------------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.handle_deleted_auth_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recompute_internship_progress() FROM PUBLIC, anon, authenticated;

-- Harden search_path to prevent search_path hijacking
ALTER FUNCTION public.handle_deleted_auth_user() SET search_path = public;
ALTER FUNCTION public.recompute_internship_progress() SET search_path = public;

-- ------------------------------------------------------------------------------
-- 3. FIX: authenticated_security_definer_function_executable & recursion immunity
-- Functions use SECURITY DEFINER with SET row_security = off to prevent infinite
-- RLS recursion when policies evaluate helper lookups.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_student_id()
RETURNS uuid 
LANGUAGE sql 
SECURITY DEFINER 
STABLE
SET search_path = public
SET row_security = off
AS $$
  SELECT student_id FROM public.students WHERE user_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.get_my_supervisor_id()
RETURNS uuid 
LANGUAGE sql 
SECURITY DEFINER 
STABLE
SET search_path = public
SET row_security = off
AS $$
  SELECT supervisor_id FROM public.supervisors WHERE user_id = auth.uid();
$$;

-- ------------------------------------------------------------------------------
-- 4. HARDEN get_my_role() (JWT-FIRST & RECURSION-PROOF)
-- Reads role directly from auth.jwt() user_metadata to avoid any table query.
-- Falls back to public.users with row_security = off to guarantee zero recursion.
-- ------------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.get_my_role() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text 
LANGUAGE plpgsql 
SECURITY DEFINER 
STABLE
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_role text;
BEGIN
  -- 1. Fast path: extract role directly from JWT user metadata (0 SQL queries, zero recursion)
  v_role := coalesce(
    auth.jwt() -> 'user_metadata' ->> 'role',
    auth.jwt() ->> 'role'
  );
  
  IF v_role IS NOT NULL THEN
    RETURN v_role;
  END IF;

  -- 2. Fallback for non-JWT context with row_security disabled
  SELECT role INTO v_role 
  FROM public.users 
  WHERE user_id = auth.uid();

  RETURN v_role;
END;
$$;

