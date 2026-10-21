-- ==============================================================================
-- Migration 010: Institutional Audit Trail & Security Hardening
-- ISO/IEC 25010:2023 Non-repudiation & Accountability
-- ==============================================================================

create table if not exists audit_logs (
  log_id uuid primary key default extensions.uuid_generate_v4(),
  actor_user_id uuid references users(user_id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  details jsonb default '{}'::jsonb,
  ip_address text,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_logs_created_at on audit_logs(created_at desc);
create index if not exists idx_audit_logs_actor on audit_logs(actor_user_id);
create index if not exists idx_audit_logs_action on audit_logs(action);

-- Enable RLS on audit_logs
alter table audit_logs enable row level security;

-- Only Admins and Coordinators can view audit logs
create policy "admin_coordinator_read_audit_logs" on audit_logs
  for select using (get_my_role() in ('Admin', 'Coordinator'));

-- Service role inserts all audit logs
create policy "service_insert_audit_logs" on audit_logs
  for insert with check (true);
