BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$
DECLARE
  v_function regprocedure := to_regprocedure('private.resubmit_student_registration(uuid,text,text,text,integer,text,text)');
  v_definition text;
BEGIN
  IF v_function IS NULL THEN
    RAISE EXCEPTION 'Student registration resubmission function is missing';
  END IF;

  v_definition := pg_get_functiondef(v_function);
  IF position('OJT Staff review' IN v_definition) > 0 THEN
    EXECUTE replace(v_definition, 'OJT Staff review', 'OJT Coordinator review');
  ELSIF position('OJT Coordinator review' IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Unexpected registration resubmission notification text';
  END IF;
END;
$$;

UPDATE public.notifications
SET message = replace(message, 'OJT Staff review', 'OJT Coordinator review')
WHERE message LIKE '%OJT Staff review%';

COMMIT;
