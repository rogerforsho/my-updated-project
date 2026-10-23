-- Workplace geofence radius is 30..50 m (default 50). Clamp existing rows first, then tighten the check.
BEGIN;
SET LOCAL lock_timeout = '5s';

UPDATE public.companies SET geofence_radius_meters = least(greatest(geofence_radius_meters, 30), 50)
WHERE geofence_radius_meters NOT BETWEEN 30 AND 50;
UPDATE public.company_branches SET geofence_radius_meters = least(greatest(geofence_radius_meters, 30), 50), updated_at = now()
WHERE geofence_radius_meters NOT BETWEEN 30 AND 50;

ALTER TABLE public.companies ALTER COLUMN geofence_radius_meters SET DEFAULT 50;
ALTER TABLE public.company_branches ALTER COLUMN geofence_radius_meters SET DEFAULT 50;

ALTER TABLE public.company_branches DROP CONSTRAINT IF EXISTS company_branches_geofence_radius_meters_check;
ALTER TABLE public.company_branches ADD CONSTRAINT company_branches_geofence_radius_meters_check
  CHECK (geofence_radius_meters BETWEEN 30 AND 50);

-- Body copied from 20261020230000_hte_branches_and_requests.sql; only the p_radius range changes.
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
       OR p_radius NOT BETWEEN 30 AND 50 THEN RETURN 'invalid_geofence'; END IF;
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

COMMIT;
