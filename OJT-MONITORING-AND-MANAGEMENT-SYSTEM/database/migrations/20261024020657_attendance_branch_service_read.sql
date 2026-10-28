-- Attendance policy reads branch coordinates through the server-only service account.
GRANT SELECT ON public.company_branches TO service_role;
