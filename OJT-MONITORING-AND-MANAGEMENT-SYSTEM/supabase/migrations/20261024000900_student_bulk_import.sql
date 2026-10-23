BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$ BEGIN
  IF to_regprocedure('public.ojt_security_revision()') IS NULL
     OR public.ojt_security_revision() < 44
     OR to_regclass('public.pending_staff_invites') IS NULL THEN
    RAISE EXCEPTION 'Apply and verify migrations through 20261024000500 first';
  END IF;
END $$;

-- A Coordinator CSV import creates students on the server without ID-card images.
-- 'student_import' invites skip only the ID-card check: the account must still be
-- a fourth-year ICS or IBE student. 'staff' keeps the earlier full bypass.
ALTER TABLE public.pending_staff_invites
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'staff'
  CHECK (kind IN ('staff', 'student_import'));

CREATE OR REPLACE FUNCTION public.validate_new_student_registration()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_invite_kind text;
  v_front text;
  v_back text;
  v_front_match text[];
  v_back_match text[];
  v_object_count integer;
BEGIN
  IF coalesce(NEW.raw_app_meta_data->>'role', 'Student') = 'Student' THEN
    SELECT p.kind INTO v_invite_kind FROM public.pending_staff_invites p
    WHERE p.email = lower(trim(NEW.email)) AND p.created_at > now() - interval '5 minutes';

    IF v_invite_kind IS DISTINCT FROM 'staff' THEN
      IF NEW.raw_user_meta_data->>'year_level' IS DISTINCT FROM '4'
         OR public.course_department(NEW.raw_user_meta_data->>'course') IS NULL THEN
        RAISE EXCEPTION 'Registration requires a fourth-year ICS or IBE student';
      END IF;
      IF v_invite_kind IS DISTINCT FROM 'student_import' THEN
        v_front := nullif(trim(coalesce(NEW.raw_user_meta_data->>'id_card_front_path', NEW.raw_user_meta_data->>'id_card_path', '')), '');
        v_back := nullif(trim(coalesce(NEW.raw_user_meta_data->>'id_card_back_path', '')), '');
        v_front_match := regexp_match(v_front, '^id-cards/([0-9]{10,16}_[a-f0-9]{24})_front\.(jpe?g|png)$', 'i');
        v_back_match := regexp_match(v_back, '^id-cards/([0-9]{10,16}_[a-f0-9]{24})_back\.(jpe?g|png)$', 'i');
        IF v_front_match IS NULL OR v_back_match IS NULL OR lower(v_front_match[1]) <> lower(v_back_match[1]) THEN
          RAISE EXCEPTION 'Registration requires both sides of the student ID';
        END IF;
        SELECT count(*) INTO v_object_count FROM storage.objects
        WHERE bucket_id = 'private-documents' AND name IN (v_front, v_back);
        IF v_object_count <> 2 THEN
          RAISE EXCEPTION 'Registration requires both uploaded student ID images';
        END IF;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION public.validate_new_student_registration() FROM PUBLIC, anon, authenticated;

COMMIT;
