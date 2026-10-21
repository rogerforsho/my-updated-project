BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.users DROP COLUMN account_category;
ALTER TABLE public.users ADD COLUMN account_category text
  GENERATED ALWAYS AS (
    CASE role
      WHEN 'Student' THEN 'OJT Student'
      WHEN 'Coordinator' THEN 'OJT Coordinator'
      WHEN 'Supervisor' THEN 'Supervisor'
      WHEN 'Admin' THEN 'Super Admin'
    END
  ) STORED;

COMMENT ON COLUMN public.users.account_category IS
  'User-facing category label for the four supported account roles.';

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text := coalesce(new.raw_app_meta_data->>'role', 'Student');
  v_student_num text;
  v_id_card text := new.raw_user_meta_data->>'id_card_path';
BEGIN
  IF v_role NOT IN ('Student', 'Coordinator', 'Supervisor', 'Admin') THEN
    RAISE EXCEPTION 'Unsupported account role' USING ERRCODE = '23514';
  END IF;

  IF nullif(trim(new.email), '') IS NULL THEN
    RAISE EXCEPTION 'Account email is required' USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.users u
    WHERE lower(u.email) = lower(trim(new.email)) AND u.user_id <> new.id
  ) THEN
    RAISE EXCEPTION 'Account email is already in use' USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.users (user_id, full_name, email, role, account_status)
  VALUES (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'), ''), ''),
    lower(trim(new.email)),
    v_role,
    'pending'
  )
  ON CONFLICT (user_id) DO UPDATE SET
    full_name = excluded.full_name,
    email = excluded.email,
    role = excluded.role;

  IF v_role = 'Student' THEN
    v_student_num := coalesce(
      nullif(trim(new.raw_user_meta_data->>'student_number'), ''),
      'PENDING-' || substr(new.id::text, 1, 8)
    );

    IF EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.student_number = v_student_num AND s.user_id <> new.id
    ) THEN
      RAISE EXCEPTION 'Student number is already linked to an account' USING ERRCODE = '23505';
    END IF;

    INSERT INTO public.students (
      user_id, student_number, course, year_level, status, id_card_path
    )
    VALUES (
      new.id,
      v_student_num,
      coalesce(nullif(trim(new.raw_user_meta_data->>'course'), ''), 'BSIT'),
      coalesce((new.raw_user_meta_data->>'year_level')::integer, 4),
      'active',
      v_id_card
    )
    ON CONFLICT (user_id) DO UPDATE SET
      student_number = CASE
        WHEN excluded.student_number LIKE 'PENDING-%'
          AND students.student_number NOT LIKE 'PENDING-%'
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
