-- Student-suggested branch pin on an HTE request. Advisory only: the coordinator's
-- confirmed pin (review_company_request) is what becomes the branch geofence.
ALTER TABLE public.company_requests
  ADD COLUMN IF NOT EXISTS branch_latitude numeric(10,7),
  ADD COLUMN IF NOT EXISTS branch_longitude numeric(10,7);

ALTER TABLE public.company_requests DROP CONSTRAINT IF EXISTS company_requests_branch_pin_check;
ALTER TABLE public.company_requests ADD CONSTRAINT company_requests_branch_pin_check CHECK (
  (branch_latitude IS NULL AND branch_longitude IS NULL)
  OR (branch_latitude IS NOT NULL AND branch_longitude IS NOT NULL
      AND branch_latitude BETWEEN -90 AND 90 AND branch_longitude BETWEEN -180 AND 180)
);

-- Re-create the guard so a coordinator decision cannot rewrite the student's pin.
CREATE OR REPLACE FUNCTION public.guard_company_request()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '' SET row_security = off AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF private.get_my_role() IS DISTINCT FROM 'Student'
       OR NEW.student_id IS DISTINCT FROM private.get_my_student_id()
       OR NEW.submitted_by IS DISTINCT FROM auth.uid()
       OR NEW.status <> 'pending'
       OR NEW.business_permit_path IS NOT NULL AND NEW.business_permit_path NOT LIKE auth.uid()::text || '/reports/%'
       OR NEW.moa_path IS NOT NULL AND NEW.moa_path NOT LIKE auth.uid()::text || '/reports/%' THEN
      RAISE EXCEPTION 'Students may request HTE verification only for themselves' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;
  IF private.get_my_role() IS DISTINCT FROM 'Coordinator'
     OR NOT private.staff_has_student(OLD.student_id)
     OR OLD.status <> 'pending'
     OR NEW.status NOT IN ('approved', 'rejected')
     OR NEW.request_id IS DISTINCT FROM OLD.request_id
     OR NEW.student_id IS DISTINCT FROM OLD.student_id
     OR NEW.submitted_by IS DISTINCT FROM OLD.submitted_by
     OR NEW.requested_company_name IS DISTINCT FROM OLD.requested_company_name
     OR NEW.company_address IS DISTINCT FROM OLD.company_address
     OR NEW.contact_person IS DISTINCT FROM OLD.contact_person
     OR NEW.contact_email IS DISTINCT FROM OLD.contact_email
     OR NEW.contact_number IS DISTINCT FROM OLD.contact_number
     OR NEW.requested_branch_name IS DISTINCT FROM OLD.requested_branch_name
     OR NEW.branch_address IS DISTINCT FROM OLD.branch_address
     OR NEW.branch_latitude IS DISTINCT FROM OLD.branch_latitude
     OR NEW.branch_longitude IS DISTINCT FROM OLD.branch_longitude
     OR NEW.business_permit_path IS DISTINCT FROM OLD.business_permit_path
     OR NEW.moa_path IS DISTINCT FROM OLD.moa_path
     OR NEW.reviewed_by IS DISTINCT FROM auth.uid()
     OR (NEW.status = 'rejected' AND length(trim(coalesce(NEW.feedback, ''))) = 0)
     OR (NEW.status = 'approved' AND NOT EXISTS (
       SELECT 1 FROM public.company_branches b
       WHERE b.company_id = NEW.company_id AND b.branch_id = NEW.branch_id AND b.status = 'active'
     )) THEN
    RAISE EXCEPTION 'Only an assigned OJT Coordinator may decide a pending HTE request once' USING ERRCODE = '42501';
  END IF;
  NEW.reviewed_at := now();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_company_request() FROM PUBLIC, anon, authenticated;
