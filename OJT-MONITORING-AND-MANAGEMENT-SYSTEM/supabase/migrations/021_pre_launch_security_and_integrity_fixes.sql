-- ==============================================================================
-- MIGRATION 021: PRE-LAUNCH SECURITY, RLS, INTEGRITY & CONCURRENCY FIXES
-- Colegio de Montalban — Cross-Platform OJT Monitoring and Management System
-- ==============================================================================

-- 1. FIX ATTENDANCE SCHEMA CONSTRAINTS (DB-01)
-- Make legacy qr_validation_status nullable with safe default 'not_applicable' if column exists,
-- ensuring GPS-based mobile attendance inserts never fail on constraint checks.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'attendance' 
      AND column_name = 'qr_validation_status'
  ) THEN
    ALTER TABLE public.attendance ALTER COLUMN qr_validation_status DROP NOT NULL;
    ALTER TABLE public.attendance ALTER COLUMN qr_validation_status SET DEFAULT 'not_applicable';
  END IF;
END $$;

-- 2. ATOMIC DAILY ATTENDANCE CONSTRAINT (DB-02)
-- Prevents duplicate daily time-in inserts under concurrent taps or offline sync replay.
-- Safely cleans up any pre-existing duplicate attendance entries before applying index.
DELETE FROM public.attendance a
USING public.attendance b
WHERE a.student_id = b.student_id
  AND a.attendance_date = b.attendance_date
  AND (a.created_at < b.created_at OR (a.created_at = b.created_at AND a.attendance_id < b.attendance_id));

CREATE UNIQUE INDEX IF NOT EXISTS uq_student_daily_attendance 
ON public.attendance (student_id, attendance_date);

-- 3. ATTENDANCE RLS SECURITY FIX (SEC-01)
-- Enforce WITH CHECK on student attendance updates to prevent trainees from
-- self-verifying attendance records or modifying hours directly.
DROP POLICY IF EXISTS "student_update_own_attendance" ON public.attendance;

CREATE POLICY "student_update_own_attendance" ON public.attendance
  FOR UPDATE
  USING (
    student_id = get_my_student_id()
    AND verification_status = 'pending'
    AND sync_status != 'conflict'
  )
  WITH CHECK (
    student_id = get_my_student_id()
    AND verification_status = 'pending'
  );

-- 4. STORAGE RLS HARDENING (SEC-02)
-- Drop overly permissive bucket policies that allowed cross-student reads/overwrites
DROP POLICY IF EXISTS "Allow authenticated read for private-documents" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated update for private-documents" ON storage.objects;
DROP POLICY IF EXISTS "Allow users to update own selfie objects" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated uploads to private-documents" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated uploads to attendance-selfies" ON storage.objects;
DROP POLICY IF EXISTS "private_documents_user_insert" ON storage.objects;
DROP POLICY IF EXISTS "private_documents_scoped_select" ON storage.objects;
DROP POLICY IF EXISTS "private_documents_user_update" ON storage.objects;
DROP POLICY IF EXISTS "attendance_selfies_student_insert" ON storage.objects;
DROP POLICY IF EXISTS "attendance_selfies_student_update" ON storage.objects;

-- Private Documents: Students can only upload into their own auth.uid() folder
CREATE POLICY "private_documents_user_insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'private-documents' 
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR (SELECT role FROM public.users WHERE user_id = auth.uid()) IN ('Coordinator', 'Admin')
  )
);

-- Private Documents: Students can only read their own documents; Staff can inspect all
CREATE POLICY "private_documents_scoped_select"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'private-documents' 
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR (SELECT role FROM public.users WHERE user_id = auth.uid()) IN ('Coordinator', 'Admin', 'ProgramHead')
  )
);

-- Private Documents: Users can only update/overwrite files in their own folder
CREATE POLICY "private_documents_user_update"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'private-documents' 
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR (SELECT role FROM public.users WHERE user_id = auth.uid()) IN ('Coordinator', 'Admin')
  )
)
WITH CHECK (
  bucket_id = 'private-documents' 
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR (SELECT role FROM public.users WHERE user_id = auth.uid()) IN ('Coordinator', 'Admin')
  )
);

-- Attendance Selfies: Students can only insert/update selfies in their own student folder
CREATE POLICY "attendance_selfies_student_insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'attendance-selfies' 
  AND (
    (storage.foldername(name))[1] = (SELECT student_id::text FROM public.students WHERE user_id = auth.uid())
    OR (SELECT role FROM public.users WHERE user_id = auth.uid()) IN ('Coordinator', 'Admin')
  )
);

CREATE POLICY "attendance_selfies_student_update"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'attendance-selfies' 
  AND (
    (storage.foldername(name))[1] = (SELECT student_id::text FROM public.students WHERE user_id = auth.uid())
    OR (SELECT role FROM public.users WHERE user_id = auth.uid()) IN ('Coordinator', 'Admin')
  )
);

-- 5. PROGRESS COMPUTATION TRIGGER HARDENING (DATA-01)
-- Guarantees rendered hours cannot be negative and are capped safely to CHED/DOLE standards.
CREATE OR REPLACE FUNCTION recompute_internship_progress()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_student_id uuid;
  v_total_hours numeric := 0;
  v_required_hours numeric := 0;
  v_remaining_hours numeric := 0;
  v_status text := 'not_started';
BEGIN
  v_student_id := coalesce(new.student_id, old.student_id);

  -- Compute total verified rendered hours with safety bounds (0 - 12h max per entry)
  SELECT coalesce(sum(
    greatest(0, least(12, extract(epoch from (time_out - time_in)) / 3600.0))
  ), 0)
  INTO v_total_hours
  FROM public.attendance
  WHERE student_id = v_student_id
    AND verification_status = 'verified'
    AND time_out IS NOT NULL
    AND time_out >= time_in;

  -- Fetch required hours configured by coordinator (defaults to 486 standard)
  SELECT coalesce(required_hours, 486)
  INTO v_required_hours
  FROM public.students
  WHERE student_id = v_student_id;

  -- Calculate remaining hours and status
  v_remaining_hours := greatest(0, round(v_required_hours - v_total_hours, 2));
  v_total_hours := round(v_total_hours, 2);

  IF v_total_hours >= v_required_hours AND v_required_hours > 0 THEN
    v_status := 'completed';
  ELSIF v_total_hours > 0 THEN
    v_status := 'in_progress';
  ELSE
    v_status := 'not_started';
  END IF;

  -- Upsert into internship_progress
  INSERT INTO public.internship_progress (student_id, completed_hours, remaining_hours, progress_status, updated_at)
  VALUES (v_student_id, v_total_hours, v_remaining_hours, v_status, now())
  ON CONFLICT (student_id) DO UPDATE SET
    completed_hours = excluded.completed_hours,
    remaining_hours = excluded.remaining_hours,
    progress_status = excluded.progress_status,
    updated_at = now();

  RETURN new;
END;
$$;
