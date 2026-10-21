-- Migration 008: Automated Rendered-Hour Computation Trigger

create or replace function recompute_internship_progress()
returns trigger language plpgsql security definer as $$
declare
  v_student_id uuid;
  v_total_hours numeric := 0;
  v_required_hours numeric := 0;
  v_remaining_hours numeric := 0;
  v_status text := 'not_started';
begin
  v_student_id := coalesce(new.student_id, old.student_id);

  -- 1. Compute total verified rendered hours
  select coalesce(sum(
    extract(epoch from (time_out - time_in)) / 3600.0
  ), 0)
  into v_total_hours
  from public.attendance
  where student_id = v_student_id
    and verification_status = 'verified'
    and time_out is not null;

  -- 2. Fetch student required hours
  select coalesce(required_hours, 486) -- Default ICS/IBE standard or assigned
  into v_required_hours
  from public.students
  where student_id = v_student_id;

  -- 3. Calculate remaining and status
  v_remaining_hours := greatest(0, round(v_required_hours - v_total_hours, 2));
  v_total_hours := round(v_total_hours, 2);

  if v_total_hours >= v_required_hours and v_required_hours > 0 then
    v_status := 'completed';
  elsif v_total_hours > 0 then
    v_status := 'in_progress';
  else
    v_status := 'not_started';
  end if;

  -- 4. Upsert into internship_progress
  insert into public.internship_progress (student_id, completed_hours, remaining_hours, progress_status, updated_at)
  values (v_student_id, v_total_hours, v_remaining_hours, v_status, now())
  on conflict (student_id) do update set
    completed_hours = excluded.completed_hours,
    remaining_hours = excluded.remaining_hours,
    progress_status = excluded.progress_status,
    updated_at = now();

  return new;
end;
$$;

-- Drop existing trigger if present
drop trigger if exists on_attendance_verified on public.attendance;

-- Trigger whenever attendance verification status changes or record updates
create trigger on_attendance_verified
  after insert or update of verification_status, time_in, time_out on public.attendance
  for each row
  execute function recompute_internship_progress();
