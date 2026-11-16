-- National holidays are now imported automatically from Nager.Date (/api/internal/import-holidays).
-- 'source' marks those rows so the importer runs once per year: a year with a 'nager' row is
-- never re-imported, which keeps days the Super Admin deleted deleted. Existing and
-- hand-entered rows are 'manual'. RLS and grants are unchanged.
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.non_working_days
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual'
  CONSTRAINT non_working_days_source_check CHECK (source IN ('manual', 'nager'));

COMMENT ON COLUMN public.non_working_days.source IS
  'manual = entered by a Super Admin or Coordinator; nager = imported by the yearly holiday import.';

COMMIT;
