-- ==============================================================================
-- Migration 009: Storage Buckets & Security Policies for OJT Management System
-- Colegio de Montalban (ICS & IBE Practicum Monitoring)
-- ==============================================================================

-- 1. Create 'attendance-selfies' bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'attendance-selfies',
    'attendance-selfies',
    true,
    5242880, -- 5 MB limit
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/jpg']
)
ON CONFLICT (id) DO UPDATE SET
    public = true,
    file_size_limit = 5242880,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];

-- 2. Create 'private-documents' bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'private-documents',
    'private-documents',
    false,
    10485760, -- 10 MB limit
    ARRAY['application/pdf', 'image/jpeg', 'image/png', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
ON CONFLICT (id) DO UPDATE SET
    public = false,
    file_size_limit = 10485760;

-- 3. Storage RLS Policies for 'attendance-selfies'
DROP POLICY IF EXISTS "Allow authenticated uploads to attendance-selfies" ON storage.objects;
CREATE POLICY "Allow authenticated uploads to attendance-selfies"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'attendance-selfies');

DROP POLICY IF EXISTS "Allow public/authenticated read for attendance-selfies" ON storage.objects;
CREATE POLICY "Allow public/authenticated read for attendance-selfies"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'attendance-selfies');

DROP POLICY IF EXISTS "Allow users to update own selfie objects" ON storage.objects;
CREATE POLICY "Allow users to update own selfie objects"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'attendance-selfies');

-- 4. Storage RLS Policies for 'private-documents'
DROP POLICY IF EXISTS "Allow authenticated uploads to private-documents" ON storage.objects;
CREATE POLICY "Allow authenticated uploads to private-documents"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'private-documents');

DROP POLICY IF EXISTS "Allow authenticated read for private-documents" ON storage.objects;
CREATE POLICY "Allow authenticated read for private-documents"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'private-documents');

DROP POLICY IF EXISTS "Allow authenticated update for private-documents" ON storage.objects;
CREATE POLICY "Allow authenticated update for private-documents"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'private-documents');
