-- Trigger: auto-create users row when a new auth user signs up
-- Student profile (students table) is created by the server-side registration handler
create or replace function handle_new_auth_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.users (user_id, full_name, email, role, account_status)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    new.email,
    coalesce(new.raw_user_meta_data->>'role', 'Student'),
    'pending'
  );
  return new;
end;
$$;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_auth_user();

-- RLS: allow insert into students only from service role (server-side)
-- Students row is inserted server-side after auth signup via service role key
-- Public anon/authenticated cannot directly insert into students
create policy "service_insert_students" on students
  for insert with check (false); -- blocked for all client roles; server uses service_role

-- RLS: allow insert into users only via trigger (already handled by security definer trigger)
-- No direct client insert needed
create policy "no_client_insert_users" on users
  for insert with check (false);
