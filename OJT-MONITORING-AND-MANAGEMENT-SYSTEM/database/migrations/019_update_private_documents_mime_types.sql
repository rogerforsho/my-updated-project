-- Migration 019: Update private-documents bucket allowed MIME types
-- Allow DOC and DOCX uploads in addition to PDF and Images

UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/jpg',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
]
WHERE id = 'private-documents';
