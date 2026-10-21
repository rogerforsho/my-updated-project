BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$
DECLARE
  invalid_count bigint;
BEGIN
  SELECT count(*) INTO invalid_count
  FROM public.practicum_schedules
  WHERE (work_modality IN ('remote', 'hybrid') AND end_date IS NULL)
     OR (end_date IS NOT NULL AND end_date < start_date);

  IF invalid_count > 0 THEN
    RAISE EXCEPTION 'Cannot require finite off-site schedules: % existing schedule(s) need Coordinator review and correction first.', invalid_count;
  END IF;
END;
$$;

ALTER TABLE public.practicum_schedules
  ADD CONSTRAINT practicum_schedules_valid_date_range
    CHECK (end_date IS NULL OR end_date >= start_date),
  ADD CONSTRAINT practicum_schedules_offsite_finite
    CHECK (work_modality NOT IN ('remote', 'hybrid') OR end_date IS NOT NULL);

COMMIT;
