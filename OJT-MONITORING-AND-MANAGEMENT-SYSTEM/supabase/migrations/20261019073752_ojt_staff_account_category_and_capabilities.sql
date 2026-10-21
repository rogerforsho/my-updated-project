-- Add the shared OJT Staff category and preserve each existing staff member's scoped access.
BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.role = 'Coordinator'
      AND NOT EXISTS (SELECT 1 FROM public.coordinators c WHERE c.user_id = u.user_id)
  ) OR EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.role = 'ProgramHead'
      AND NOT EXISTS (SELECT 1 FROM public.program_heads p WHERE p.user_id = u.user_id)
  ) OR EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.role = 'Admin'
      AND NOT EXISTS (SELECT 1 FROM public.admins a WHERE a.user_id = u.user_id)
  ) THEN
    RAISE EXCEPTION 'Staff role mapping is incomplete; repair role profiles before migrating';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.users u
    JOIN public.coordinators c ON c.user_id = u.user_id
    WHERE u.role = 'Coordinator'
      AND (position('ICS' in upper(coalesce(c.department, ''))) = 0
        AND position('IBE' in upper(coalesce(c.department, ''))) = 0)
  ) OR EXISTS (
    SELECT 1 FROM public.users u
    JOIN public.program_heads p ON p.user_id = u.user_id
    WHERE u.role = 'ProgramHead'
      AND upper(trim(coalesce(p.department_or_program, ''))) NOT IN ('ICS', 'IBE')
  ) THEN
    RAISE EXCEPTION 'Unknown staff department; no account access was changed';
  END IF;
END;
$$;

ALTER TABLE public.users
  ADD COLUMN account_category text GENERATED ALWAYS AS (
    CASE
      WHEN role IN ('Coordinator', 'ProgramHead', 'Admin', 'OJT Staff') THEN 'OJT Staff'
      WHEN role = 'Student' THEN 'Student'
      WHEN role = 'Supervisor' THEN 'Supervisor'
    END
  ) STORED;

ALTER TABLE public.users DROP CONSTRAINT users_role_check;
ALTER TABLE public.users ADD CONSTRAINT users_role_check
  CHECK (role IN ('Student', 'Coordinator', 'Supervisor', 'ProgramHead', 'Admin', 'OJT Staff'));

CREATE TABLE public.staff_capability_grants (
  grant_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  capability text NOT NULL CHECK (capability IN (
    'academic_workflows',
    'department_reports',
    'technical_admin',
    'department_announcements',
    'institution_announcements',
    'cross_campus_summary',
    'staff_permission_management'
  )),
  department_scope text NOT NULL DEFAULT '*',
  granted_at timestamptz NOT NULL DEFAULT now(),
  granted_by_user_id uuid REFERENCES public.users(user_id) ON DELETE SET NULL,
  revoked_at timestamptz,
  revoked_by_user_id uuid REFERENCES public.users(user_id) ON DELETE SET NULL,
  CHECK (
    (capability IN ('academic_workflows', 'department_reports', 'department_announcements')
      AND department_scope IN ('ICS', 'IBE'))
    OR
    (capability IN ('technical_admin', 'institution_announcements', 'cross_campus_summary', 'staff_permission_management')
      AND department_scope = '*')
  )
);

CREATE UNIQUE INDEX staff_capability_grants_one_active
  ON public.staff_capability_grants (user_id, capability, department_scope)
  WHERE revoked_at IS NULL;

ALTER TABLE public.staff_capability_grants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.staff_capability_grants FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.staff_capability_grants TO authenticated;
GRANT ALL ON public.staff_capability_grants TO service_role;
CREATE POLICY staff_capability_grants_read_own
  ON public.staff_capability_grants FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

WITH staff_scopes AS (
  SELECT u.user_id, c.department AS legacy_department
  FROM public.users u
  JOIN public.coordinators c ON c.user_id = u.user_id
  WHERE u.role = 'Coordinator'
  UNION ALL
  SELECT u.user_id, p.department_or_program
  FROM public.users u
  JOIN public.program_heads p ON p.user_id = u.user_id
  WHERE u.role = 'ProgramHead'
), normalized_scopes AS (
  SELECT DISTINCT s.user_id, department_scope
  FROM staff_scopes s
  CROSS JOIN LATERAL unnest(array_remove(ARRAY[
    CASE WHEN position('ICS' in upper(s.legacy_department)) > 0 THEN 'ICS' END,
    CASE WHEN position('IBE' in upper(s.legacy_department)) > 0 THEN 'IBE' END
  ], NULL)) AS department_scope
)
INSERT INTO public.staff_capability_grants (user_id, capability, department_scope)
SELECT s.user_id, capability, s.department_scope
FROM normalized_scopes s
CROSS JOIN unnest(ARRAY['academic_workflows', 'department_reports']) AS capability
ON CONFLICT DO NOTHING;

INSERT INTO public.staff_capability_grants (user_id, capability)
SELECT u.user_id, 'technical_admin'
FROM public.users u
WHERE u.role = 'Admin'
ON CONFLICT DO NOTHING;

COMMENT ON COLUMN public.users.account_category IS
  'Shared account category. Legacy role values remain during the application cutover.';
COMMENT ON TABLE public.staff_capability_grants IS
  'Scoped OJT Staff capabilities. Initial grants preserve current department workflows; institution-wide and permission-management grants require explicit designation.';

COMMIT;
