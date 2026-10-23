BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$ BEGIN
  IF to_regprocedure('public.ojt_security_revision()') IS NULL
     OR public.ojt_security_revision() < 44
     OR to_regprocedure('public.coordinator_decide_attendance_exception(uuid,text,text)') IS NULL THEN
    RAISE EXCEPTION 'Apply and verify migrations through revision 44 first';
  END IF;
END $$;

-- Coordinators change attendance status only through the audited, SECURITY
-- DEFINER coordinator_decide_attendance_exception (it bypasses RLS itself).
-- Admins are already excluded from attendance by ojt_staff_department_boundary.
DROP POLICY IF EXISTS coordinator_admin_update_attendance ON public.attendance;

COMMIT;
