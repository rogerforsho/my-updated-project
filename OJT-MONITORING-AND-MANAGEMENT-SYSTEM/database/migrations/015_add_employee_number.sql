-- Migration: 015_add_employee_number.sql
-- Description: Adds non-destructive employee_number column to users table with clean 'YYYY-XXX' (e.g. 2024-001) format for faculty/staff.

-- 1. Add employee_number column to public.users safely
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS employee_number text;

-- 2. Create index for fast identity lookups during password recovery
CREATE INDEX IF NOT EXISTS idx_users_employee_number
  ON public.users(employee_number);

-- 3. Graceful automated backfill for any existing staff accounts without an employee ID
DO $$
DECLARE
    r RECORD;
    counter INT := 1;
BEGIN
    FOR r IN
        SELECT user_id, created_at
        FROM public.users
        WHERE role IN ('Coordinator', 'ProgramHead', 'Supervisor', 'Admin')
          AND (employee_number IS NULL OR trim(employee_number) = '')
        ORDER BY created_at ASC
    LOOP
        UPDATE public.users
        SET employee_number = to_char(r.created_at, 'YYYY') || '-' || lpad(counter::text, 3, '0')
        WHERE user_id = r.user_id;
        counter := counter + 1;
    END LOOP;
END $$;
