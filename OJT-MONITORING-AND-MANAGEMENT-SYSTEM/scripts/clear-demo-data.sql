-- Undo for seed-demo-data.sql (local only).
-- Run: docker exec -i supabase_db_cdm-ojt-test-local psql -U postgres -d postgres < scripts/clear-demo-data.sql
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL session_replication_role = replica;
-- Removes everything seed-demo-data.sql created. Child tables first: several FKs are ON DELETE RESTRICT.
DELETE FROM non_working_days    WHERE label LIKE 'DEMO %';
DELETE FROM evaluation_appeals WHERE student_id IN (SELECT student_id FROM students s JOIN users u USING (user_id) WHERE u.email LIKE '%@demo.local');
DELETE FROM incident_reports   WHERE student_id IN (SELECT student_id FROM students s JOIN users u USING (user_id) WHERE u.email LIKE '%@demo.local');
DELETE FROM company_requests   WHERE student_id IN (SELECT student_id FROM students s JOIN users u USING (user_id) WHERE u.email LIKE '%@demo.local');
DELETE FROM evaluations        WHERE student_id IN (SELECT student_id FROM students s JOIN users u USING (user_id) WHERE u.email LIKE '%@demo.local');
DELETE FROM student_assignments WHERE student_id IN (SELECT student_id FROM students s JOIN users u USING (user_id) WHERE u.email LIKE '%@demo.local');
DELETE FROM reports            WHERE file_path LIKE 'demo/%';
DELETE FROM audit_logs         WHERE details->>'demo' = 'true';
DELETE FROM students           WHERE user_id IN (SELECT user_id FROM users WHERE email LIKE '%@demo.local');
DELETE FROM supervisors        WHERE user_id IN (SELECT user_id FROM users WHERE email LIKE '%@demo.local');
DELETE FROM users              WHERE email LIKE '%@demo.local';
DELETE FROM companies          WHERE company_name LIKE 'DEMO %';
COMMIT;
