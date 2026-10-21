-- Migration 007: Enhanced Auth Trigger (Auto-create Student Profile) & Announcements Table

-- 1. Update trigger to automatically create student profile for student signups from both web and mobile
create or replace function handle_new_auth_user()
returns trigger language plpgsql security definer as $$
declare
  v_role text;
begin
  v_role := coalesce(new.raw_user_meta_data->>'role', 'Student');

  -- Insert into users table
  insert into public.users (user_id, full_name, email, role, account_status)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    new.email,
    v_role,
    'pending'
  )
  on conflict (user_id) do update set
    full_name = excluded.full_name,
    email = excluded.email,
    role = excluded.role;

  -- If Student, automatically populate students table
  if v_role = 'Student' then
    insert into public.students (user_id, student_number, course, year_level, status)
    values (
      new.id,
      coalesce(new.raw_user_meta_data->>'student_number', 'PENDING-' || substr(new.id::text, 1, 8)),
      coalesce(new.raw_user_meta_data->>'course', 'BSIT'),
      coalesce((new.raw_user_meta_data->>'year_level')::int, 4),
      'active'
    )
    on conflict (user_id) do nothing;
  end if;

  return new;
end;
$$;

-- 2. Announcements Table
create table if not exists announcements (
  announcement_id uuid primary key default extensions.uuid_generate_v4(),
  author_user_id uuid references users(user_id) on delete set null,
  title text not null,
  content text not null,
  target_role text not null default 'All',
  target_department text not null default 'All',
  created_at timestamptz not null default now()
);

create index if not exists idx_announcements_created_at on announcements(created_at desc);

-- RLS for Announcements
alter table announcements enable row level security;

create policy "read_announcements" on announcements
  for select using (
    target_role = 'All' 
    or target_role = get_my_role()
    or get_my_role() in ('Coordinator', 'Admin')
  );

create policy "coordinator_admin_manage_announcements" on announcements
  for all using (get_my_role() in ('Coordinator', 'Admin'));
