-- A course that maps to no department hides the student from every Coordinator,
-- so reject it at write time. Signup metadata reaches handle_new_auth_user directly,
-- which bypasses the app-level course validation.
-- NOT VALID keeps legacy rows loadable; the notice below lists how many need fixing.
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.students DROP CONSTRAINT IF EXISTS students_course_has_department;
ALTER TABLE public.students ADD CONSTRAINT students_course_has_department
  CHECK (public.course_department(course) IS NOT NULL) NOT VALID;

DO $$
DECLARE v_orphans bigint;
BEGIN
  SELECT count(*) INTO v_orphans FROM public.students WHERE public.course_department(course) IS NULL;
  IF v_orphans > 0 THEN
    RAISE NOTICE '% student row(s) have a course outside ICS/IBE and are invisible to Coordinators. Find them with: SELECT student_id, student_number, course FROM public.students WHERE public.course_department(course) IS NULL;', v_orphans;
  END IF;
END $$;

COMMIT;
