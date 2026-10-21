-- Deploy the updated staff/supervisor provisioning code first, or freeze
-- staff/supervisor creation during a maintenance window until that code is live.
-- Roles must come from the database, never client-editable user metadata.
BEGIN;

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public
SET row_security = off
AS $$
  SELECT role FROM public.users
  WHERE user_id = auth.uid() AND account_status = 'active';
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_role() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated;

-- Self-registration always creates a Student. Staff provisioning explicitly
-- supplies app_metadata through the server-only Auth Admin API.
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_existing_user_id uuid;
  v_student_num text;
  v_id_card text;
BEGIN
  v_role := coalesce(new.raw_app_meta_data->>'role', 'Student');
  v_id_card := new.raw_user_meta_data->>'id_card_path';

  -- Reconcile any orphaned records with the same email in public.users
  SELECT user_id INTO v_existing_user_id
  FROM public.users
  WHERE lower(email) = lower(new.email)
    AND user_id <> new.id;

  IF v_existing_user_id IS NOT NULL THEN
    DELETE FROM public.users WHERE user_id = v_existing_user_id;
  END IF;

  -- Insert or update user record
  INSERT INTO public.users (user_id, full_name, email, role, account_status)
  VALUES (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    new.email,
    v_role,
    'pending'
  )
  ON CONFLICT (user_id) DO UPDATE SET
    full_name = excluded.full_name,
    email = excluded.email,
    role = excluded.role;

  -- If Student, populate public.students table safely
  IF v_role = 'Student' THEN
    v_student_num := coalesce(new.raw_user_meta_data->>'student_number', 'PENDING-' || substr(new.id::text, 1, 8));

    IF EXISTS (SELECT 1 FROM public.students WHERE student_number = v_student_num AND user_id <> new.id) THEN
      v_student_num := 'PENDING-' || substr(new.id::text, 1, 8);
    END IF;

    INSERT INTO public.students (user_id, student_number, course, year_level, status, id_card_path)
    VALUES (
      new.id,
      v_student_num,
      coalesce(new.raw_user_meta_data->>'course', 'BSIT'),
      coalesce((new.raw_user_meta_data->>'year_level')::int, 4),
      'active',
      v_id_card
    )
    ON CONFLICT (user_id) DO UPDATE SET
      student_number = CASE 
        WHEN excluded.student_number LIKE 'PENDING-%' AND students.student_number NOT LIKE 'PENDING-%' 
        THEN students.student_number 
        ELSE excluded.student_number 
      END,
      course = excluded.course,
      year_level = excluded.year_level,
      id_card_path = coalesce(excluded.id_card_path, students.id_card_path);
  END IF;

  RETURN new;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.handle_new_auth_user() FROM PUBLIC, anon, authenticated;

COMMIT;
