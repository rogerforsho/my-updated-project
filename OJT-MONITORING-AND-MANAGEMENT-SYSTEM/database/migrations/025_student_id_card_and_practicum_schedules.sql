-- ==============================================================================
-- Migration 025: Student ID Card Verification & Practicum Work Schedule Proposals
-- Colegio de Montalban - OJT Monitoring and Management System
-- ==============================================================================

-- 1. Add id_card_path to students table
ALTER TABLE public.students 
ADD COLUMN IF NOT EXISTS id_card_path TEXT;

-- 2. Update handle_new_auth_user() trigger to persist student ID card path from auth metadata
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_role text;
  v_existing_user_id uuid;
  v_student_num text;
  v_id_card text;
BEGIN
  v_role := coalesce(new.raw_user_meta_data->>'role', 'Student');
  v_id_card := new.raw_user_meta_data->>'id_card_path';

  -- Reconcile any orphaned records with the same email in public.users
  SELECT user_id INTO v_existing_user_id
  FROM public.users
  WHERE lower(email) = lower(new.email)
    AND user_id <> new.id;

  IF v_existing_user_id IS NOT NULL THEN
    DELETE FROM public.users WHERE user_id = v_existing_user_id;
  END IF;

  -- Insert or update user record
  INSERT INTO public.users (user_id, full_name, email, role, account_status)
  VALUES (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    new.email,
    v_role,
    'pending'
  )
  ON CONFLICT (user_id) DO UPDATE SET
    full_name = excluded.full_name,
    email = excluded.email,
    role = excluded.role;

  -- If Student, populate public.students table safely
  IF v_role = 'Student' THEN
    v_student_num := coalesce(new.raw_user_meta_data->>'student_number', 'PENDING-' || substr(new.id::text, 1, 8));

    IF EXISTS (SELECT 1 FROM public.students WHERE student_number = v_student_num AND user_id <> new.id) THEN
      v_student_num := 'PENDING-' || substr(new.id::text, 1, 8);
    END IF;

    INSERT INTO public.students (user_id, student_number, course, year_level, status, id_card_path)
    VALUES (
      new.id,
      v_student_num,
      coalesce(new.raw_user_meta_data->>'course', 'BSIT'),
      coalesce((new.raw_user_meta_data->>'year_level')::int, 4),
      'active',
      v_id_card
    )
    ON CONFLICT (user_id) DO UPDATE SET
      student_number = CASE 
        WHEN excluded.student_number LIKE 'PENDING-%' AND students.student_number NOT LIKE 'PENDING-%' 
        THEN students.student_number 
        ELSE excluded.student_number 
      END,
      course = excluded.course,
      year_level = excluded.year_level,
      id_card_path = coalesce(excluded.id_card_path, students.id_card_path);
  END IF;

  RETURN new;
END;
$$;

-- 3. Storage policy: Allow unauthenticated/authenticated registration upload of Student ID cards into 'id-cards' folder
DROP POLICY IF EXISTS "Allow registration upload student id" ON storage.objects;
CREATE POLICY "Allow registration upload student id"
ON storage.objects FOR INSERT
TO anon, authenticated
WITH CHECK (
  bucket_id = 'private-documents' 
  AND (storage.foldername(name))[1] = 'id-cards'
);

-- 4. Create practicum_schedules table for student work schedule proposals (Option A)
CREATE TABLE IF NOT EXISTS public.practicum_schedules (
  schedule_id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  student_id UUID NOT NULL REFERENCES public.students(student_id) ON DELETE CASCADE,
  company_id UUID REFERENCES public.companies(company_id) ON DELETE SET NULL,
  custom_company_name TEXT,
  work_modality TEXT NOT NULL DEFAULT 'on_site' CHECK (work_modality IN ('on_site', 'hybrid', 'remote')),
  work_days INT[] NOT NULL DEFAULT '{1,2,3,4,5}',
  time_in TIME NOT NULL DEFAULT '08:00:00',
  time_out TIME NOT NULL DEFAULT '17:00:00',
  lunch_break_minutes INT NOT NULL DEFAULT 60,
  daily_hours NUMERIC(4,2) NOT NULL DEFAULT 8.00,
  weekly_hours NUMERIC(4,2) NOT NULL DEFAULT 40.00,
  start_date DATE NOT NULL,
  end_date DATE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'modified')),
  student_notes TEXT,
  coordinator_feedback TEXT,
  reviewed_by UUID REFERENCES public.users(user_id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_practicum_schedules_student_id ON public.practicum_schedules(student_id);
CREATE INDEX IF NOT EXISTS idx_practicum_schedules_company_id ON public.practicum_schedules(company_id);
CREATE INDEX IF NOT EXISTS idx_practicum_schedules_status ON public.practicum_schedules(status);

ALTER TABLE public.practicum_schedules ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies for practicum_schedules
DROP POLICY IF EXISTS "student_read_own_practicum_schedule" ON public.practicum_schedules;
CREATE POLICY "student_read_own_practicum_schedule" ON public.practicum_schedules
FOR SELECT USING (student_id = get_my_student_id());

DROP POLICY IF EXISTS "student_insert_own_practicum_schedule" ON public.practicum_schedules;
CREATE POLICY "student_insert_own_practicum_schedule" ON public.practicum_schedules
FOR INSERT WITH CHECK (student_id = get_my_student_id());

DROP POLICY IF EXISTS "student_update_own_pending_schedule" ON public.practicum_schedules;
CREATE POLICY "student_update_own_pending_schedule" ON public.practicum_schedules
FOR UPDATE USING (student_id = get_my_student_id() AND status = 'pending');

DROP POLICY IF EXISTS "coordinator_read_all_practicum_schedules" ON public.practicum_schedules;
CREATE POLICY "coordinator_read_all_practicum_schedules" ON public.practicum_schedules
FOR SELECT USING (get_my_role() IN ('Coordinator', 'Admin', 'ProgramHead'));

DROP POLICY IF EXISTS "coordinator_update_practicum_schedules" ON public.practicum_schedules;
CREATE POLICY "coordinator_update_practicum_schedules" ON public.practicum_schedules
FOR UPDATE USING (get_my_role() IN ('Coordinator', 'Admin'));
