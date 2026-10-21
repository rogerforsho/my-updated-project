-- Explicit, table-scoped API grants for Supabase default-deny table exposure.
-- Apply after 032. RLS policies and guarded triggers remain mandatory authorization controls.
BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$ BEGIN
  IF to_regprocedure('public.ojt_security_revision()') IS NULL
     OR public.ojt_security_revision() < 31 THEN
    RAISE EXCEPTION 'Apply and verify migrations 029-032 first';
  END IF;
END $$;

-- No anonymous Data API access is needed: registration uses Auth and a server upload
-- route, while public certificate checks use a server-side exact-code lookup.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon;

-- Signed-in clients read application data through RLS. Internal counters, OTPs,
-- and legacy QR tokens are intentionally omitted from client grants.
GRANT SELECT ON TABLE
  public.admins, public.announcements, public.attendance, public.audit_logs,
  public.certificates, public.companies, public.coordinators, public.evaluations,
  public.internship_progress, public.notifications, public.practicum_schedules,
  public.program_heads, public.reports, public.student_assignments, public.students,
  public.supervisors, public.users, public.work_schedules
TO authenticated;

-- Direct signed-in workflows identified in web/mobile services. RLS, scoped
-- restrictive policies, column guards and transition triggers still constrain writes.
GRANT INSERT, UPDATE ON TABLE public.attendance TO authenticated;
GRANT INSERT, UPDATE ON TABLE public.companies TO authenticated;
GRANT INSERT, UPDATE ON TABLE public.evaluations TO authenticated;
GRANT UPDATE ON TABLE public.notifications TO authenticated;
GRANT INSERT, UPDATE ON TABLE public.practicum_schedules TO authenticated;
GRANT INSERT, UPDATE ON TABLE public.reports TO authenticated;
GRANT INSERT, UPDATE ON TABLE public.student_assignments TO authenticated;
GRANT UPDATE ON TABLE public.students TO authenticated;

-- Account and role provisioning remains server-only; clients may only read their
-- RLS-scoped user profile. The server uses the service role for app tables.
REVOKE ALL ON public.users FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.users TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.admins, public.announcements, public.attendance, public.certificates,
  public.companies, public.coordinators, public.evaluations, public.internship_progress,
  public.notifications, public.practicum_schedules, public.program_heads, public.reports,
  public.student_assignments, public.students, public.supervisors, public.users,
  public.work_schedules
TO service_role;

-- Audit logs are server-written. Admin/Coordinator reads remain scoped by RLS.
REVOKE ALL ON public.audit_logs FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.audit_logs TO authenticated;
GRANT SELECT, INSERT ON public.audit_logs TO service_role;
DROP POLICY IF EXISTS service_insert_audit_logs ON public.audit_logs;

-- Password-reset service actions use the server key; atomic rate-limit mutations
-- must use claim_auth_rate_limit, and QR tokens are retired.
REVOKE ALL ON public.auth_rate_limits FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public.password_reset_otps FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.password_reset_otps TO service_role;
DO $$ BEGIN
  IF to_regclass('public.qr_tokens') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON public.qr_tokens FROM PUBLIC, anon, authenticated, service_role';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.ojt_security_revision()
RETURNS integer LANGUAGE sql STABLE SET search_path = public AS $$ SELECT 32 $$;
REVOKE ALL ON FUNCTION public.ojt_security_revision() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ojt_security_revision() TO service_role;

COMMIT;
