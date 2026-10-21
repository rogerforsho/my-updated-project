-- Migration 017: Fix Auth Registration & Clean Orphaned Accounts
-- Resolves 'Database error saving new user' caused by:
-- 1. Orphaned emails in public.users when auth.users is deleted
-- 2. Duplicate student_number unique constraint collisions inside auth trigger
-- 3. Automatic cascade deletion from auth.users to public.users

-- 1. Enhanced handle_new_auth_user()
create or replace function handle_new_auth_user()
returns trigger language plpgsql security definer as $$
declare
  v_role text;
  v_existing_user_id uuid;
  v_student_num text;
begin
  v_role := coalesce(new.raw_user_meta_data->>'role', 'Student');

  -- Reconcile any orphaned records with the same email in public.users
  select user_id into v_existing_user_id
  from public.users
  where lower(email) = lower(new.email)
    and user_id <> new.id;

  if v_existing_user_id is not null then
    -- Clean out orphaned user record (cascades to students/assignments)
    delete from public.users where user_id = v_existing_user_id;
  end if;

  -- Insert or update user record
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

  -- If Student, populate public.students table safely
  if v_role = 'Student' then
    v_student_num := coalesce(new.raw_user_meta_data->>'student_number', 'PENDING-' || substr(new.id::text, 1, 8));

    -- If student_number is already claimed by another user, use a safe pending fallback to prevent 23505 abort
    if exists (select 1 from public.students where student_number = v_student_num and user_id <> new.id) then
      v_student_num := 'PENDING-' || substr(new.id::text, 1, 8);
    end if;

    insert into public.students (user_id, student_number, course, year_level, status)
    values (
      new.id,
      v_student_num,
      coalesce(new.raw_user_meta_data->>'course', 'BSIT'),
      coalesce((new.raw_user_meta_data->>'year_level')::int, 4),
      'active'
    )
    on conflict (user_id) do update set
      student_number = case 
        when excluded.student_number like 'PENDING-%' and students.student_number not like 'PENDING-%' 
        then students.student_number 
        else excluded.student_number 
      end,
      course = excluded.course,
      year_level = excluded.year_level;
  end if;

  return new;
end;
$$;

-- 2. Automatically delete public.users when an auth.user is deleted
create or replace function handle_deleted_auth_user()
returns trigger language plpgsql security definer as $$
begin
  delete from public.users where user_id = old.id;
  return old;
end;
$$;

drop trigger if exists on_auth_user_deleted on auth.users;
create trigger on_auth_user_deleted
  after delete on auth.users
  for each row execute procedure handle_deleted_auth_user();

-- 3. One-time cleanup of orphaned users in public.users (not present in auth.users)
delete from public.users
where user_id not in (select id from auth.users);
