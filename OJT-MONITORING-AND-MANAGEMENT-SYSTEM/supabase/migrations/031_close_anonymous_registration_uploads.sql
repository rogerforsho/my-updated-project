-- Apply AFTER deploying the new web ID-upload endpoint and updating mobile.
-- Old mobile versions upload directly and will need to be updated first.
BEGIN;
SET LOCAL lock_timeout='5s';
DO $$ BEGIN
  IF to_regprocedure('public.ojt_security_revision()') IS NULL THEN
    RAISE EXCEPTION 'Migration 030 is not installed. Run 030_authorization_write_boundaries.sql successfully first.';
  END IF;
  IF public.ojt_security_revision()<30 THEN
    RAISE EXCEPTION 'Migration 030 security revision 30 is required before migration 031.';
  END IF;
END $$;
DROP POLICY IF EXISTS "Allow registration upload student id" ON storage.objects;
DROP POLICY IF EXISTS registration_id_upload_boundary ON storage.objects;
CREATE POLICY registration_id_upload_boundary ON storage.objects AS RESTRICTIVE FOR INSERT TO anon, authenticated
WITH CHECK (bucket_id<>'private-documents' OR split_part(name,'/',1)<>'id-cards');
COMMIT;
