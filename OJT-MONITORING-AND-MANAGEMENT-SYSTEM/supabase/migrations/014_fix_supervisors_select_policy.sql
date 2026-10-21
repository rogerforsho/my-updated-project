-- Migration 014: Fix Supervisors and Staff Select RLS Policies

-- 1. Add SELECT policy on public.supervisors so supervisors can load their own profile
drop policy if exists "supervisors_read_own" on public.supervisors;
create policy "supervisors_read_own" on public.supervisors
  for select using (
    user_id = auth.uid() 
    or get_my_role() in ('Coordinator', 'Admin', 'ProgramHead', 'Supervisor')
  );

-- 2. Add SELECT policy on public.coordinators
drop policy if exists "coordinators_read_policy" on public.coordinators;
create policy "coordinators_read_policy" on public.coordinators
  for select using (
    user_id = auth.uid()
    or get_my_role() in ('Admin', 'ProgramHead', 'Coordinator')
  );

-- 3. Add SELECT policy on public.program_heads
drop policy if exists "program_heads_read_policy" on public.program_heads;
create policy "program_heads_read_policy" on public.program_heads
  for select using (
    user_id = auth.uid()
    or get_my_role() in ('Admin', 'ProgramHead')
  );