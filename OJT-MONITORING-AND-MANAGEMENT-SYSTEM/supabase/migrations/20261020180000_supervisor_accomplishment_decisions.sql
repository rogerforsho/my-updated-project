BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS supervisor_decision text,
  ADD COLUMN IF NOT EXISTS supervisor_decided_by uuid REFERENCES public.users(user_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS supervisor_decided_at timestamptz;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reports_supervisor_decision_check') THEN
    ALTER TABLE public.reports ADD CONSTRAINT reports_supervisor_decision_check
      CHECK (supervisor_decision IS NULL OR supervisor_decision IN ('approved', 'returned'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reports_supervisor_decision_state_check') THEN
    ALTER TABLE public.reports ADD CONSTRAINT reports_supervisor_decision_state_check
      CHECK ((supervisor_decision IS NULL AND supervisor_decided_by IS NULL AND supervisor_decided_at IS NULL)
        OR (supervisor_decision IS NOT NULL AND supervisor_decided_by IS NOT NULL AND supervisor_decided_at IS NOT NULL));
  END IF;
END $$;

COMMENT ON COLUMN public.reports.supervisor_decision IS
  'Supervisor decision for an assigned daily accomplishment report; separate from Coordinator gateway-document status.';

DROP POLICY IF EXISTS supervisor_report_review_type_boundary ON public.reports;
CREATE POLICY supervisor_report_review_type_boundary ON public.reports AS RESTRICTIVE FOR SELECT TO authenticated
USING (private.get_my_role() <> 'Supervisor' OR lower(trim(report_type)) IN ('daily journal', 'accomplishment report'));

CREATE OR REPLACE FUNCTION public.guard_ojt_client_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public SET row_security=off AS $$
DECLARE actor_role text; before_row jsonb; after_row jsonb; allowed text[];
BEGIN
 IF coalesce(current_setting('role',true),'') NOT IN ('anon','authenticated') THEN RETURN NEW; END IF;
 actor_role:=private.get_my_role();
 IF actor_role IS NULL THEN RAISE EXCEPTION 'Active account required' USING ERRCODE='42501'; END IF;
 after_row:=to_jsonb(NEW);
 IF TG_OP='UPDATE' THEN
  before_row:=to_jsonb(OLD);
  IF (after_row->'student_id') IS DISTINCT FROM (before_row->'student_id')
     OR (after_row->'user_id') IS DISTINCT FROM (before_row->'user_id')
     OR (TG_TABLE_NAME IN ('attendance','evaluations') AND
       ((after_row->'assignment_id') IS DISTINCT FROM (before_row->'assignment_id')
        OR (after_row->'supervisor_id') IS DISTINCT FROM (before_row->'supervisor_id'))) THEN
   RAISE EXCEPTION 'Record ownership cannot be changed' USING ERRCODE='42501';
  END IF;
  IF actor_role='Student' AND TG_TABLE_NAME='attendance' THEN
   allowed:=ARRAY['time_out','time_out_selfie_path','time_out_lat','time_out_lng','time_out_distance_meters','time_out_location_status','time_out_flag_reason','time_out_received_at','sync_status','synced_at','updated_at'];
   IF after_row-allowed IS DISTINCT FROM before_row-allowed OR OLD.time_out IS NOT NULL THEN
    RAISE EXCEPTION 'Only the first time-out may update a pending attendance record' USING ERRCODE='42501';
   END IF;
  ELSIF actor_role='Supervisor' AND TG_TABLE_NAME='attendance' THEN
   allowed:=ARRAY['verification_status','updated_at'];
   IF after_row-allowed IS DISTINCT FROM before_row-allowed OR OLD.verification_status<>'pending' THEN
    RAISE EXCEPTION 'Only pending attendance verification may be changed' USING ERRCODE='42501';
   END IF;
  ELSIF actor_role='Supervisor' AND TG_TABLE_NAME='reports' THEN
   allowed:=ARRAY['supervisor_feedback','supervisor_endorsed_at','supervisor_decision','supervisor_decided_by','supervisor_decided_at','updated_at'];
   IF after_row-allowed IS DISTINCT FROM before_row-allowed
      OR OLD.supervisor_decision IS NOT NULL
      OR lower(trim(coalesce(OLD.report_type,''))) NOT IN ('daily journal','accomplishment report')
      OR NEW.supervisor_decision IS NULL
      OR NEW.supervisor_decision NOT IN ('approved','returned')
      OR NEW.supervisor_decided_by IS DISTINCT FROM auth.uid()
      OR NEW.supervisor_decided_at IS NULL THEN
    RAISE EXCEPTION 'Supervisor may decide an undecided assigned daily accomplishment report only' USING ERRCODE='42501';
   END IF;
  ELSIF actor_role='Student' AND TG_TABLE_NAME='practicum_schedules' THEN
   IF OLD.status<>'pending' OR NEW.status<>'pending' OR NEW.reviewed_by IS NOT NULL
      OR NEW.reviewed_at IS NOT NULL OR NEW.coordinator_feedback IS NOT NULL THEN
    RAISE EXCEPTION 'Student cannot review a schedule' USING ERRCODE='42501';
   END IF;
  END IF;
 END IF;
 IF TG_TABLE_NAME='attendance' THEN
  IF NEW.time_out IS NOT NULL AND NEW.time_out<NEW.time_in THEN RAISE EXCEPTION 'Time-out precedes time-in'; END IF;
  IF NEW.attendance_date<>(NEW.time_in AT TIME ZONE 'Asia/Manila')::date THEN RAISE EXCEPTION 'Attendance date must match time-in in Asia/Manila'; END IF;
 ELSIF TG_TABLE_NAME='evaluations' THEN
  IF NEW.performance_score IS NOT NULL AND NOT (NEW.performance_score>=0 AND NEW.performance_score<=100) THEN
   RAISE EXCEPTION 'Evaluation score must be between 0 and 100';
  END IF;
 END IF;
 RETURN NEW;
END $$;

COMMIT;
