-- ==============================================================================
-- Migration 013: Certificates of Completion & Tamper-Proof Verification
-- Colegio de Montalban OJT System (ICS & IBE Practicum)
-- ==============================================================================

create table if not exists public.certificates (
  certificate_id uuid primary key default extensions.uuid_generate_v4(),
  student_id uuid not null references public.students(student_id) on delete cascade,
  verification_code text not null unique,
  hours_rendered numeric not null,
  host_company_name text not null,
  academic_year text not null default '2025-2026',
  status text not null default 'active' check (status in ('active', 'revoked')),
  revocation_reason text,
  issued_at timestamptz not null default now(),
  issued_by_user_id uuid references public.users(user_id)
);

create index if not exists idx_certificates_code on public.certificates(verification_code);
create index if not exists idx_certificates_student on public.certificates(student_id);

-- Enable RLS
alter table public.certificates enable row level security;

-- 1. Public can verify certificate validity by unique code
create policy "public_verify_certificate" on public.certificates
  for select using (true);

-- 2. Coordinators and Admins can manage certificates
create policy "coordinator_admin_manage_certificates" on public.certificates
  for all using (get_my_role() in ('Coordinator', 'Admin', 'ProgramHead'));
