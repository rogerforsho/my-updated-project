BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$ BEGIN
  IF to_regprocedure('private.get_my_student_id()') IS NULL
     OR to_regprocedure('private.staff_has_student(uuid)') IS NULL
     OR to_regprocedure('private.get_my_role()') IS NULL THEN
    RAISE EXCEPTION 'Apply and verify the four-role authorization migrations first';
  END IF;
END $$;

DO $$ DECLARE v_invalid integer; BEGIN
  SELECT count(*) INTO v_invalid FROM public.companies
  WHERE (coalesce(geofence_enabled, false) AND (latitude IS NULL OR longitude IS NULL))
     OR ((latitude IS NULL) <> (longitude IS NULL))
     OR (latitude IS NOT NULL AND latitude NOT BETWEEN -90 AND 90)
     OR (longitude IS NOT NULL AND longitude NOT BETWEEN -180 AND 180);
  IF v_invalid > 0 THEN
    RAISE EXCEPTION '% existing company coordinate/geofence row(s) are invalid; correct them before adding branches', v_invalid;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.company_branches (
  branch_id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  company_id uuid NOT NULL REFERENCES public.companies(company_id) ON DELETE CASCADE,
  branch_name text NOT NULL CHECK (length(trim(branch_name)) BETWEEN 1 AND 150),
  address text NOT NULL CHECK (length(trim(address)) BETWEEN 1 AND 500),
  contact_person text,
  contact_email text,
  contact_number text,
  latitude numeric(10,7),
  longitude numeric(10,7),
  geofence_radius_meters integer NOT NULL DEFAULT 150 CHECK (geofence_radius_meters BETWEEN 50 AND 5000),
  geofence_enabled boolean NOT NULL DEFAULT false,
  is_primary boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, branch_id),
  CHECK ((latitude IS NULL AND longitude IS NULL) OR
         (latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180)),
  CHECK (NOT geofence_enabled OR (latitude IS NOT NULL AND longitude IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_company_branches_primary
  ON public.company_branches(company_id) WHERE is_primary;
CREATE UNIQUE INDEX IF NOT EXISTS uq_company_branches_name
  ON public.company_branches(company_id, lower(trim(branch_name)));
CREATE INDEX IF NOT EXISTS idx_company_branches_company ON public.company_branches(company_id);

CREATE OR REPLACE FUNCTION public.create_primary_company_branch()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '' SET row_security = off AS $$
BEGIN
  INSERT INTO public.company_branches(
    company_id, branch_name, address, contact_person, contact_email, contact_number,
    latitude, longitude, geofence_radius_meters, geofence_enabled, is_primary
  ) VALUES (
    NEW.company_id, 'Main Branch', NEW.address, NEW.contact_person, NEW.contact_email, NEW.contact_number,
    NEW.latitude, NEW.longitude, coalesce(NEW.geofence_radius_meters, 150),
    coalesce(NEW.geofence_enabled, false), true
  ) ON CONFLICT (company_id) WHERE is_primary DO NOTHING;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.create_primary_company_branch() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS create_primary_company_branch ON public.companies;
CREATE TRIGGER create_primary_company_branch AFTER INSERT ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.create_primary_company_branch();

CREATE OR REPLACE FUNCTION public.sync_primary_company_branch()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '' SET row_security = off AS $$
BEGIN
  UPDATE public.company_branches SET address = NEW.address, contact_person = NEW.contact_person,
    contact_email = NEW.contact_email, contact_number = NEW.contact_number,
    latitude = NEW.latitude, longitude = NEW.longitude,
    geofence_radius_meters = coalesce(NEW.geofence_radius_meters, 150),
    geofence_enabled = coalesce(NEW.geofence_enabled, false), updated_at = now()
  WHERE company_id = NEW.company_id AND is_primary;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.sync_primary_company_branch() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS sync_primary_company_branch ON public.companies;
CREATE TRIGGER sync_primary_company_branch AFTER UPDATE OF address, contact_person, contact_email, contact_number,
  latitude, longitude, geofence_radius_meters, geofence_enabled ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.sync_primary_company_branch();

INSERT INTO public.company_branches(
  company_id, branch_name, address, contact_person, contact_email, contact_number,
  latitude, longitude, geofence_radius_meters, geofence_enabled, is_primary
)
SELECT c.company_id, 'Main Branch', c.address, c.contact_person, c.contact_email, c.contact_number,
       c.latitude, c.longitude, coalesce(c.geofence_radius_meters, 150), coalesce(c.geofence_enabled, false), true
FROM public.companies c
WHERE NOT EXISTS (SELECT 1 FROM public.company_branches b WHERE b.company_id = c.company_id AND b.is_primary);

ALTER TABLE public.student_assignments ADD COLUMN IF NOT EXISTS branch_id uuid;
UPDATE public.student_assignments sa SET branch_id = b.branch_id
FROM public.company_branches b
WHERE sa.company_id = b.company_id AND b.is_primary AND sa.branch_id IS NULL;
DO $$ DECLARE v_missing integer; BEGIN
  SELECT count(*) INTO v_missing FROM public.student_assignments WHERE branch_id IS NULL;
  IF v_missing > 0 THEN RAISE EXCEPTION '% assignment(s) do not map to a primary HTE branch', v_missing; END IF;
END $$;
ALTER TABLE public.student_assignments ALTER COLUMN branch_id SET NOT NULL;
ALTER TABLE public.student_assignments DROP CONSTRAINT IF EXISTS student_assignments_company_branch_fkey;
ALTER TABLE public.student_assignments ADD CONSTRAINT student_assignments_company_branch_fkey
  FOREIGN KEY (company_id, branch_id) REFERENCES public.company_branches(company_id, branch_id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS idx_student_assignments_company_branch ON public.student_assignments(company_id, branch_id);

ALTER TABLE public.practicum_schedules ADD COLUMN IF NOT EXISTS branch_id uuid;
UPDATE public.practicum_schedules ps SET branch_id = b.branch_id
FROM public.company_branches b
WHERE ps.company_id = b.company_id AND b.is_primary AND ps.branch_id IS NULL;
ALTER TABLE public.practicum_schedules DROP CONSTRAINT IF EXISTS practicum_schedules_company_branch_fkey;
ALTER TABLE public.practicum_schedules ADD CONSTRAINT practicum_schedules_company_branch_fkey
  FOREIGN KEY (company_id, branch_id) REFERENCES public.company_branches(company_id, branch_id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS idx_practicum_schedules_company_branch ON public.practicum_schedules(company_id, branch_id);

CREATE TABLE IF NOT EXISTS public.company_requests (
  request_id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  student_id uuid NOT NULL REFERENCES public.students(student_id) ON DELETE RESTRICT,
  submitted_by uuid NOT NULL REFERENCES public.users(user_id) ON DELETE RESTRICT,
  requested_company_name text NOT NULL CHECK (length(trim(requested_company_name)) BETWEEN 2 AND 200),
  company_address text NOT NULL CHECK (length(trim(company_address)) BETWEEN 2 AND 500),
  contact_person text NOT NULL CHECK (length(trim(contact_person)) BETWEEN 2 AND 150),
  contact_email text NOT NULL CHECK (length(trim(contact_email)) <= 254),
  contact_number text NOT NULL CHECK (length(trim(contact_number)) BETWEEN 5 AND 40),
  requested_branch_name text NOT NULL CHECK (length(trim(requested_branch_name)) BETWEEN 1 AND 150),
  branch_address text NOT NULL CHECK (length(trim(branch_address)) BETWEEN 2 AND 500),
  business_permit_path text,
  moa_path text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  feedback text,
  reviewed_by uuid REFERENCES public.users(user_id) ON DELETE RESTRICT,
  reviewed_at timestamptz,
  company_id uuid REFERENCES public.companies(company_id) ON DELETE RESTRICT,
  branch_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((business_permit_path IS NULL OR business_permit_path LIKE submitted_by::text || '/reports/%')
     AND (moa_path IS NULL OR moa_path LIKE submitted_by::text || '/reports/%')),
  CHECK (
    (status = 'pending' AND reviewed_by IS NULL AND reviewed_at IS NULL AND company_id IS NULL AND branch_id IS NULL)
    OR (status = 'approved' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND company_id IS NOT NULL AND branch_id IS NOT NULL)
    OR (status = 'rejected' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND company_id IS NULL AND branch_id IS NULL AND length(trim(coalesce(feedback, ''))) > 0)
  )
);
ALTER TABLE public.company_requests DROP CONSTRAINT IF EXISTS company_requests_company_branch_fkey;
ALTER TABLE public.company_requests ADD CONSTRAINT company_requests_company_branch_fkey
  FOREIGN KEY (company_id, branch_id) REFERENCES public.company_branches(company_id, branch_id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS idx_company_requests_student_created ON public.company_requests(student_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_company_requests_status_created ON public.company_requests(status, created_at);
CREATE INDEX IF NOT EXISTS idx_company_requests_company_branch ON public.company_requests(company_id, branch_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_company_requests_one_pending_per_student
  ON public.company_requests(student_id) WHERE status = 'pending';

ALTER TABLE public.company_branches ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.company_branches FROM PUBLIC, anon;
GRANT SELECT ON public.company_branches TO authenticated;
GRANT INSERT, UPDATE ON public.company_branches TO authenticated;
CREATE OR REPLACE FUNCTION private.coordinator_can_manage_company_branch(p_branch_id uuid, p_company_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = '' SET row_security = off AS $$
  SELECT private.get_my_role() = 'Coordinator'
    AND NOT EXISTS (
      SELECT 1 FROM public.student_assignments sa
      WHERE sa.branch_id = p_branch_id AND NOT private.staff_has_student(sa.student_id)
    )
    AND (EXISTS (
      SELECT 1 FROM public.student_assignments sa
      WHERE sa.branch_id = p_branch_id AND private.staff_has_student(sa.student_id)
    ) OR (NOT EXISTS (
      SELECT 1 FROM public.student_assignments sa WHERE sa.branch_id = p_branch_id
    ) AND EXISTS (
      SELECT 1 FROM public.practicum_schedules ps
      WHERE ps.company_id = p_company_id AND ps.status = 'pending'
        AND private.staff_has_student(ps.student_id)
    )))
$$;
REVOKE ALL ON FUNCTION private.coordinator_can_manage_company_branch(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.coordinator_can_manage_company_branch(uuid, uuid) TO authenticated, service_role;
CREATE OR REPLACE FUNCTION private.coordinator_has_company_branch_context(p_company_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = '' SET row_security = off AS $$
  SELECT private.get_my_role() = 'Coordinator' AND (
    EXISTS (SELECT 1 FROM public.student_assignments sa
      WHERE sa.company_id = p_company_id AND private.staff_has_student(sa.student_id))
    OR EXISTS (SELECT 1 FROM public.practicum_schedules ps
      WHERE ps.company_id = p_company_id AND ps.status IN ('pending', 'approved')
        AND private.staff_has_student(ps.student_id))
    OR EXISTS (SELECT 1 FROM public.company_requests cr
      WHERE cr.company_id = p_company_id AND cr.status = 'approved'
        AND private.staff_has_student(cr.student_id))
  )
$$;
REVOKE ALL ON FUNCTION private.coordinator_has_company_branch_context(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.coordinator_has_company_branch_context(uuid) TO authenticated, service_role;
CREATE OR REPLACE FUNCTION private.student_owns_company_branch(p_branch_id uuid, p_company_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = '' SET row_security = off AS $$
  SELECT private.get_my_role() = 'Student' AND EXISTS (
    SELECT 1 FROM public.student_assignments sa
    WHERE sa.student_id = private.get_my_student_id()
      AND sa.company_id = p_company_id AND sa.branch_id = p_branch_id
  )
$$;
REVOKE ALL ON FUNCTION private.student_owns_company_branch(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.student_owns_company_branch(uuid, uuid) TO authenticated, service_role;
DROP POLICY IF EXISTS active_company_branches_read ON public.company_branches;
CREATE POLICY active_company_branches_read ON public.company_branches FOR SELECT TO authenticated
  USING (private.student_owns_company_branch(branch_id, company_id)
    OR private.coordinator_has_company_branch_context(company_id)
    OR (private.get_my_role() = 'Supervisor' AND EXISTS (
      SELECT 1 FROM public.student_assignments sa
      WHERE sa.company_id = company_branches.company_id AND sa.branch_id = company_branches.branch_id
        AND sa.assignment_status = 'active'
        AND sa.supervisor_id = private.get_my_supervisor_id()
        AND private.supervisor_has_active_student(sa.student_id)
    )));
DROP POLICY IF EXISTS coordinator_manage_company_branches ON public.company_branches;
CREATE POLICY coordinator_create_company_branches ON public.company_branches FOR INSERT TO authenticated
  WITH CHECK (private.coordinator_can_manage_company_branch(branch_id, company_id));
CREATE POLICY coordinator_update_company_branches ON public.company_branches FOR UPDATE TO authenticated
  USING (private.coordinator_can_manage_company_branch(branch_id, company_id))
  WITH CHECK (private.coordinator_can_manage_company_branch(branch_id, company_id));

ALTER TABLE public.company_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.company_requests FROM PUBLIC, anon;
GRANT SELECT, INSERT ON public.company_requests TO authenticated;
DROP POLICY IF EXISTS company_request_student_read_insert ON public.company_requests;
CREATE POLICY company_request_student_read_insert ON public.company_requests FOR SELECT TO authenticated
  USING (private.get_my_role() = 'Student' AND student_id = private.get_my_student_id());
DROP POLICY IF EXISTS company_request_student_insert ON public.company_requests;
CREATE POLICY company_request_student_insert ON public.company_requests FOR INSERT TO authenticated
  WITH CHECK (private.get_my_role() = 'Student' AND student_id = private.get_my_student_id() AND submitted_by = auth.uid());
DROP POLICY IF EXISTS company_request_coordinator_read ON public.company_requests;
CREATE POLICY company_request_coordinator_read ON public.company_requests FOR SELECT TO authenticated
  USING (private.get_my_role() = 'Coordinator' AND private.staff_has_student(student_id));
DROP POLICY IF EXISTS company_request_coordinator_update ON public.company_requests;

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
DROP TRIGGER IF EXISTS guard_company_request ON public.company_requests;
CREATE TRIGGER guard_company_request BEFORE INSERT OR UPDATE ON public.company_requests
  FOR EACH ROW EXECUTE FUNCTION public.guard_company_request();

CREATE OR REPLACE FUNCTION public.review_company_request(
  p_request_id uuid, p_decision text, p_feedback text DEFAULT NULL,
  p_latitude numeric DEFAULT NULL, p_longitude numeric DEFAULT NULL, p_radius integer DEFAULT 150
)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '' SET row_security = off AS $$
DECLARE v_actor public.users%ROWTYPE; v_request public.company_requests%ROWTYPE; v_company_id uuid; v_branch_id uuid;
BEGIN
  IF auth.uid() IS NULL OR p_request_id IS NULL OR p_decision IS NULL OR p_decision NOT IN ('approve', 'reject') THEN RETURN 'invalid_request'; END IF;
  SELECT * INTO v_actor FROM public.users WHERE user_id = auth.uid() AND role = 'Coordinator' AND account_status = 'active';
  IF NOT FOUND THEN RETURN 'forbidden'; END IF;
  SELECT * INTO v_request FROM public.company_requests WHERE request_id = p_request_id AND status = 'pending' FOR UPDATE;
  IF NOT FOUND THEN RETURN 'not_found'; END IF;
  IF NOT private.staff_has_student(v_request.student_id) THEN RETURN 'forbidden'; END IF;
  IF p_decision = 'reject' AND length(trim(coalesce(p_feedback, ''))) = 0 THEN RETURN 'feedback_required'; END IF;
  IF p_decision = 'reject' THEN
    UPDATE public.company_requests SET status = 'rejected', feedback = left(trim(p_feedback), 3000), reviewed_by = auth.uid()
    WHERE request_id = p_request_id;
  ELSE
    IF p_latitude IS NULL OR p_longitude IS NULL OR p_radius IS NULL
       OR (p_latitude IS NULL) <> (p_longitude IS NULL)
       OR (p_latitude IS NOT NULL AND (p_latitude < -90 OR p_latitude > 90 OR p_longitude < -180 OR p_longitude > 180))
       OR p_radius NOT BETWEEN 50 AND 5000 THEN RETURN 'invalid_geofence'; END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended(lower(trim(v_request.requested_company_name)), 0));
    IF EXISTS (SELECT 1 FROM public.companies c WHERE lower(trim(c.company_name)) = lower(trim(v_request.requested_company_name)))
      THEN RETURN 'duplicate_company'; END IF;
    INSERT INTO public.companies(
      company_name, address, contact_person, contact_email, contact_number, status,
      latitude, longitude, geofence_radius_meters, geofence_enabled
    ) VALUES (
      trim(v_request.requested_company_name), trim(v_request.company_address), trim(v_request.contact_person),
      lower(trim(v_request.contact_email)), trim(v_request.contact_number), 'active',
      p_latitude, p_longitude, p_radius, p_latitude IS NOT NULL
    ) RETURNING company_id INTO v_company_id;
    UPDATE public.company_branches SET branch_name = trim(v_request.requested_branch_name),
      address = trim(v_request.branch_address), latitude = p_latitude, longitude = p_longitude,
      geofence_radius_meters = p_radius, geofence_enabled = p_latitude IS NOT NULL,
      updated_at = now() WHERE company_id = v_company_id AND is_primary RETURNING branch_id INTO v_branch_id;
    UPDATE public.company_requests SET status = 'approved', feedback = nullif(left(trim(coalesce(p_feedback, '')), 3000), ''),
      reviewed_by = auth.uid(), company_id = v_company_id, branch_id = v_branch_id
    WHERE request_id = p_request_id;
  END IF;
  INSERT INTO public.notifications(receiver_user_id, message, status, notification_date)
  SELECT s.user_id, CASE WHEN p_decision = 'approve'
    THEN 'Your HTE request was approved. Your OJT Coordinator will complete branch and supervisor placement.'
    ELSE 'Your HTE request needs changes. Review your OJT Coordinator feedback in the mobile app.' END,
    'unread', now() FROM public.students s WHERE s.student_id = v_request.student_id;
  INSERT INTO public.audit_logs(actor_user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'HTE_REQUEST_' || upper(p_decision), 'company_request', p_request_id::text,
    jsonb_build_object('company_id', v_company_id, 'branch_id', v_branch_id));
  RETURN 'ok';
END;
$$;
REVOKE ALL ON FUNCTION public.review_company_request(uuid, text, text, numeric, numeric, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_company_request(uuid, text, text, numeric, numeric, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.guard_schedule_branch_assignment()
RETURNS trigger LANGUAGE plpgsql
SET search_path = '' AS $$
BEGIN
  IF private.get_my_role() = 'Student' AND NEW.branch_id IS DISTINCT FROM OLD.branch_id THEN
    RAISE EXCEPTION 'Only the OJT Coordinator finalizes the placement branch' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_schedule_branch_assignment() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS guard_schedule_branch_assignment ON public.practicum_schedules;
CREATE TRIGGER guard_schedule_branch_assignment BEFORE UPDATE ON public.practicum_schedules
  FOR EACH ROW EXECUTE FUNCTION public.guard_schedule_branch_assignment();

COMMIT;
