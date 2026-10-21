-- Keep department-targeted announcements within the Program Head's department.
BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$ BEGIN
  IF to_regprocedure('public.ojt_security_revision()') IS NULL
     OR public.ojt_security_revision() < 33 THEN
    RAISE EXCEPTION 'Apply and verify migrations 029-034 first';
  END IF;
END $$;

DROP POLICY IF EXISTS program_head_announcement_department_boundary ON public.announcements;
CREATE POLICY program_head_announcement_department_boundary ON public.announcements
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    coalesce(public.get_my_role(), '') <> 'ProgramHead'
    OR upper(trim(coalesce(target_department, ''))) = 'ALL'
    OR upper(trim(coalesce(target_department, ''))) = public.get_my_department()
  );

CREATE OR REPLACE FUNCTION public.ojt_security_revision()
RETURNS integer LANGUAGE sql STABLE SET search_path = public AS $$ SELECT 34 $$;
REVOKE ALL ON FUNCTION public.ojt_security_revision() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ojt_security_revision() TO service_role;

COMMIT;
