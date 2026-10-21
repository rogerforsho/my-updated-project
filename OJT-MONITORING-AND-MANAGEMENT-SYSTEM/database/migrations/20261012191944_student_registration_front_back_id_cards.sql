-- Registration accepts only the four approved ICS/IBE programs and stores both
-- sides of the validated student ID independently for coordinator review.
BEGIN;

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS id_card_front_path text,
  ADD COLUMN IF NOT EXISTS id_card_back_path text;

UPDATE public.students
SET id_card_front_path = id_card_path
WHERE id_card_front_path IS NULL AND id_card_path IS NOT NULL;

CREATE OR REPLACE FUNCTION public.validate_new_student_registration()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF coalesce(NEW.raw_app_meta_data->>'role','Student')='Student' THEN
    IF NEW.raw_user_meta_data->>'year_level' IS DISTINCT FROM '4'
       OR upper(trim(coalesce(NEW.raw_user_meta_data->>'course',''))) NOT IN ('BSIT','BS-CPE','BSBA-HRM','BSENTREP') THEN
      RAISE EXCEPTION 'Registration requires a fourth-year student in an approved ICS or IBE program';
    END IF;
  END IF;
  RETURN NEW;
END
$$;

REVOKE ALL ON FUNCTION public.validate_new_student_registration() FROM PUBLIC, anon, authenticated;

COMMIT;
