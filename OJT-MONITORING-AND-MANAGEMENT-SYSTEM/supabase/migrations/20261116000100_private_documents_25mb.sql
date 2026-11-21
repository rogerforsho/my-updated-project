-- One combined Pre-deployment Requirements file (PDF/DOCX) can hold four scanned documents,
-- so the private-documents bucket allows up to 25 MB instead of 10 MB.
UPDATE storage.buckets
SET file_size_limit = 26214400
WHERE id = 'private-documents';
