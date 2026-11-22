-- A Coordinator can be granted a whole department (ICS / IBE) or only some of its programs (e.g. BSIT).
-- staff_capability_grants.program_scope: NULL = the whole department (every existing row), otherwise the programs.
-- Student records, notifications, Target Hours and documents follow the programs. The department group chat and the
-- department's non-working days stay shared by the whole department (staff_has_department / group_chat_has_member unchanged).
-- Match rule used everywhere: g.program_scope IS NULL OR program_key_for_course(course) = ANY (g.program_scope).
-- A course that maps to no program (legacy BSCS, BSA) is therefore visible only to department-wide Coordinators.
BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$ BEGIN
  IF to_regprocedure('public.ojt_security_revision()') IS NULL
     OR public.ojt_security_revision() < 45
     OR to_regprocedure('public.program_key_for_course(text)') IS NULL
     OR to_regprocedure('private.staff_has_course(text)') IS NULL THEN
    RAISE EXCEPTION 'Apply and verify migrations through 20261122000100 first';
  END IF;
END $$;

-- ---------------------------------------------------------------- the column
ALTER TABLE public.staff_capability_grants ADD COLUMN IF NOT EXISTS program_scope text[];
ALTER TABLE public.staff_capability_grants DROP CONSTRAINT IF EXISTS staff_capability_grants_program_scope_valid;
ALTER TABLE public.staff_capability_grants ADD CONSTRAINT staff_capability_grants_program_scope_valid CHECK (
  program_scope IS NULL OR (
    cardinality(program_scope) > 0
    AND department_scope IN ('ICS', 'IBE')
    AND program_scope <@ CASE department_scope
      WHEN 'ICS' THEN ARRAY['BSIT', 'BS-CPE']
      ELSE ARRAY['BSBA-HRM', 'BSENTREP'] END));

-- ---------------------------------------------------------------- the main switch
-- students RLS, staff_has_student, staff_can_read_user and every policy built on them follow this one function.
CREATE OR REPLACE FUNCTION private.staff_has_course(p_course text)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public SET row_security = off AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    JOIN public.staff_capability_grants g ON g.user_id = u.user_id
    WHERE u.user_id = auth.uid() AND u.role = 'Coordinator' AND u.account_status = 'active'
      AND g.capability = 'academic_workflows' AND g.revoked_at IS NULL
      AND g.department_scope = public.course_department(p_course)
      AND (g.program_scope IS NULL OR public.program_key_for_course(p_course) = ANY (g.program_scope))
  );
$$;
REVOKE ALL ON FUNCTION private.staff_has_course(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.staff_has_course(text) TO authenticated, service_role;

-- A program (not a course): used by program-targeted announcements.
CREATE OR REPLACE FUNCTION private.staff_has_program(p_program text)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public SET row_security = off AS $$
  SELECT private.staff_has_course(p_program);
$$;
REVOKE ALL ON FUNCTION private.staff_has_program(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.staff_has_program(text) TO authenticated, service_role;

-- ---------------------------------------------------------------- Coordinator <-> Supervisor chat
CREATE OR REPLACE FUNCTION public.chat_pair_is_eligible(p_coordinator_user_id uuid, p_supervisor_user_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public SET row_security = off AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users cu
    JOIN public.coordinators c ON c.user_id = cu.user_id
    JOIN public.staff_capability_grants g ON g.user_id = cu.user_id
      AND g.capability = 'academic_workflows' AND g.revoked_at IS NULL
    JOIN public.users su ON su.user_id = p_supervisor_user_id
    JOIN public.supervisors sp ON sp.user_id = su.user_id
    JOIN public.student_assignments sa ON sa.supervisor_id = sp.supervisor_id
      AND sa.assignment_status = 'active'
    JOIN public.students s ON s.student_id = sa.student_id
    WHERE cu.user_id = p_coordinator_user_id
      AND cu.role = 'Coordinator' AND cu.account_status = 'active'
      AND su.role = 'Supervisor' AND su.account_status = 'active'
      AND g.department_scope = public.course_department(s.course)
      AND (g.program_scope IS NULL OR public.program_key_for_course(s.course) = ANY (g.program_scope))
  );
$$;

CREATE OR REPLACE FUNCTION public.chat_student_is_taggable(
  p_coordinator_user_id uuid, p_supervisor_user_id uuid, p_student_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public SET row_security = off AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users cu
    JOIN public.coordinators c ON c.user_id = cu.user_id
    JOIN public.staff_capability_grants g ON g.user_id = cu.user_id
      AND g.capability = 'academic_workflows' AND g.revoked_at IS NULL
    JOIN public.users su ON su.user_id = p_supervisor_user_id
    JOIN public.supervisors sp ON sp.user_id = su.user_id
    JOIN public.student_assignments sa ON sa.supervisor_id = sp.supervisor_id
      AND sa.assignment_status = 'active'
    JOIN public.students s ON s.student_id = sa.student_id
    WHERE cu.user_id = p_coordinator_user_id
      AND cu.role = 'Coordinator' AND cu.account_status = 'active'
      AND su.role = 'Supervisor' AND su.account_status = 'active'
      AND s.student_id = p_student_id
      AND g.department_scope = public.course_department(s.course)
      AND (g.program_scope IS NULL OR public.program_key_for_course(s.course) = ANY (g.program_scope))
  );
$$;

-- ---------------------------------------------------------------- notifications to Coordinators
-- Same bodies as their latest versions; only the program condition is new.
CREATE OR REPLACE FUNCTION public.notify_evaluation_appeal()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET row_security = off AS $$
DECLARE student_user_id uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.notifications(receiver_user_id, message, status, notification_date)
    SELECT u.user_id, 'A student submitted an evaluation appeal for your department.', 'unread', now()
    FROM public.staff_capability_grants g
    JOIN public.users u ON u.user_id = g.user_id AND u.role = 'Coordinator' AND u.account_status = 'active'
    JOIN public.students s ON s.student_id = NEW.student_id
    WHERE g.capability = 'academic_workflows' AND g.revoked_at IS NULL
      AND g.department_scope = public.course_department(s.course)
      AND (g.program_scope IS NULL OR public.program_key_for_course(s.course) = ANY (g.program_scope));
  ELSE
    SELECT user_id INTO student_user_id FROM public.students WHERE student_id = NEW.student_id;
    INSERT INTO public.notifications(receiver_user_id, message, status, notification_date)
    VALUES (student_user_id, 'Your evaluation appeal has been decided. Open Evaluation Results in the mobile app for the decision.', 'unread', now());
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.notify_evaluation_appeal() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.notify_incident_report()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET row_security = off AS $$
DECLARE student_user_id uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.notifications(receiver_user_id, message, status, notification_date)
    SELECT u.user_id, 'A confidential incident report was submitted for your department.', 'unread', now()
    FROM public.staff_capability_grants g
    JOIN public.users u ON u.user_id = g.user_id AND u.role = 'Coordinator' AND u.account_status = 'active'
    JOIN public.students s ON s.student_id = NEW.student_id
    WHERE g.capability = 'academic_workflows' AND g.revoked_at IS NULL
      AND g.department_scope = public.course_department(s.course)
      AND (g.program_scope IS NULL OR public.program_key_for_course(s.course) = ANY (g.program_scope));
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    SELECT user_id INTO student_user_id FROM public.students WHERE student_id = NEW.student_id;
    INSERT INTO public.notifications(receiver_user_id, message, status, notification_date)
    VALUES (student_user_id,
      CASE NEW.status WHEN 'acknowledged' THEN 'Your OJT Coordinator acknowledged your incident report.'
        ELSE 'Your OJT Coordinator closed your incident report. Open it in the mobile app to read the response.' END,
      'unread', now());
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.notify_incident_report() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.notify_schedule_submitted()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET row_security = off AS $$
BEGIN
  INSERT INTO public.notifications(sender_user_id, receiver_user_id, message, status, notification_date)
  SELECT st.user_id, u.user_id,
    coalesce(su.full_name, 'A student') || ' submitted a practicum schedule proposal for your review.',
    'unread', now()
  FROM public.students st
  JOIN public.users su ON su.user_id = st.user_id
  JOIN public.staff_capability_grants g ON g.capability = 'academic_workflows' AND g.revoked_at IS NULL
    AND g.department_scope = public.course_department(st.course)
    AND (g.program_scope IS NULL OR public.program_key_for_course(st.course) = ANY (g.program_scope))
  JOIN public.users u ON u.user_id = g.user_id AND u.role = 'Coordinator' AND u.account_status = 'active'
  WHERE st.student_id = NEW.student_id;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.notify_schedule_submitted() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.notify_report_submitted()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET row_security = off AS $$
BEGIN
  -- Weekly Journals (and the retired Daily Journal / Accomplishment Report) are reviewed by the
  -- Supervisor. Compiled Weekly Journals go to the Coordinator, so they are not skipped.
  IF private.is_supervisor_reviewed_type(NEW.report_type) THEN
    RETURN NEW;
  END IF;
  INSERT INTO public.notifications(sender_user_id, receiver_user_id, message, status, notification_date)
  SELECT st.user_id, u.user_id,
    'New "' || NEW.report_type || '" submitted by ' || coalesce(su.full_name, 'a student') || ' is waiting for your review.',
    'unread', now()
  FROM public.students st
  JOIN public.users su ON su.user_id = st.user_id
  JOIN public.staff_capability_grants g ON g.capability = 'academic_workflows' AND g.revoked_at IS NULL
    AND g.department_scope = public.course_department(st.course)
    AND (g.program_scope IS NULL OR public.program_key_for_course(st.course) = ANY (g.program_scope))
  JOIN public.users u ON u.user_id = g.user_id AND u.role = 'Coordinator' AND u.account_status = 'active'
  WHERE st.student_id = NEW.student_id;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.notify_report_submitted() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------- Target Hours
-- A Coordinator sets and sees only the programs they are granted. Same bodies as 20261122000100 except the check.
DROP POLICY IF EXISTS program_target_hours_read ON public.program_target_hours;
CREATE POLICY program_target_hours_read ON public.program_target_hours
  FOR SELECT TO authenticated
  USING (private.get_my_role() = 'Admin' OR private.staff_has_course(course));

CREATE OR REPLACE FUNCTION public.set_program_target_hours(p_course text, p_hours integer)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' SET row_security = off AS $$
DECLARE
  v_old integer;
  v_ids uuid[];
BEGIN
  IF p_course IS NULL OR p_course NOT IN ('BSIT', 'BS-CPE', 'BSBA-HRM', 'BSENTREP') THEN
    RAISE EXCEPTION 'Choose one of the four programs' USING ERRCODE = '22023';
  END IF;
  IF p_hours IS NULL OR p_hours < 1 OR p_hours > 840 THEN
    RAISE EXCEPTION 'Target Hours must be between 1 and 840' USING ERRCODE = '22023';
  END IF;
  -- Only an active Coordinator granted this program. The Super Admin does not edit academic rules (ADR 0006).
  IF NOT private.staff_has_course(p_course) THEN
    RAISE EXCEPTION 'You are not granted this program' USING ERRCODE = '42501';
  END IF;

  SELECT required_hours INTO v_old FROM public.program_target_hours WHERE course = p_course FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Program not found' USING ERRCODE = '22023';
  END IF;

  UPDATE public.program_target_hours
  SET required_hours = p_hours, confirmed_at = now(), updated_by = auth.uid(), updated_at = now()
  WHERE course = p_course;

  WITH moved AS (
    UPDATE public.students s SET required_hours = p_hours
    WHERE public.program_key_for_course(s.course) = p_course
      AND (s.required_hours IS NULL OR s.required_hours = v_old)
      AND s.required_hours IS DISTINCT FROM p_hours
      AND NOT EXISTS (SELECT 1 FROM public.certificates c WHERE c.student_id = s.student_id)
    RETURNING s.student_id
  )
  SELECT coalesce(array_agg(student_id), '{}') INTO v_ids FROM moved;

  UPDATE public.internship_progress p SET
    remaining_hours = greatest(0, round(p_hours - p.completed_hours, 2)),
    progress_status = CASE
      WHEN p.completed_hours >= p_hours THEN 'completed'
      WHEN p.completed_hours > 0 THEN 'in_progress'
      ELSE 'not_started' END,
    updated_at = now()
  WHERE p.student_id = ANY (v_ids);

  RETURN cardinality(v_ids);
END;
$$;
REVOKE ALL ON FUNCTION public.set_program_target_hours(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_program_target_hours(text, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.count_students_following_target_hours(p_course text)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' SET row_security = off AS $$
  SELECT CASE WHEN private.staff_has_course(p_course) THEN (
    SELECT count(*)::integer FROM public.students s
    WHERE public.program_key_for_course(s.course) = p_course
      AND (s.required_hours IS NULL OR s.required_hours = (SELECT t.required_hours FROM public.program_target_hours t WHERE t.course = p_course))
      AND NOT EXISTS (SELECT 1 FROM public.certificates c WHERE c.student_id = s.student_id)
  ) ELSE 0 END;
$$;
REVOKE ALL ON FUNCTION public.count_students_following_target_hours(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.count_students_following_target_hours(text) TO authenticated;

-- ---------------------------------------------------------------- documents sent to students
-- "Whole department" (NULL ids) now means every student of the sender's programs. A listed student outside them
-- makes the counts differ and raises 22023, as an out-of-department student did before.
CREATE OR REPLACE FUNCTION public.send_coordinator_document(
  p_sender uuid, p_department text, p_title text, p_path text, p_name text, p_student_user_ids uuid[])
RETURNS TABLE(document_id uuid, recipient_count integer)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET row_security = off AS $$
DECLARE
  v_dept text := upper(trim(coalesce(p_department, '')));
  v_title text := trim(coalesce(p_title, ''));
  v_name text := trim(coalesce(p_name, ''));
  v_doc uuid; v_recipients uuid[]; v_sender_name text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.users u WHERE u.user_id = p_sender AND u.role = 'Coordinator')
     OR NOT public.group_chat_has_member(p_sender, v_dept) THEN
    RAISE EXCEPTION 'Only a Coordinator of this department can send documents' USING ERRCODE = '42501';
  END IF;
  IF v_title = '' OR char_length(v_title) > 200 OR v_name = '' OR char_length(v_name) > 255 OR v_name ~ '[/\\]' THEN
    RAISE EXCEPTION 'Invalid document title or file name' USING ERRCODE = '22023';
  END IF;
  IF p_path !~ ('^chat/' || p_sender::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|docx|doc|jpg|jpeg|png)$')
     OR NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'private-documents' AND o.name = p_path) THEN
    RAISE EXCEPTION 'Invalid document file' USING ERRCODE = '22023';
  END IF;

  SELECT coalesce(array_agg(DISTINCT s.user_id), '{}') INTO v_recipients
  FROM public.students s JOIN public.users u ON u.user_id = s.user_id AND u.account_status = 'active'
  WHERE public.course_department(s.course) = v_dept
    AND EXISTS (
      SELECT 1 FROM public.staff_capability_grants g
      WHERE g.user_id = p_sender AND g.capability = 'academic_workflows' AND g.revoked_at IS NULL
        AND g.department_scope = v_dept
        AND (g.program_scope IS NULL OR public.program_key_for_course(s.course) = ANY (g.program_scope)))
    AND (p_student_user_ids IS NULL OR s.user_id = ANY(p_student_user_ids));
  IF cardinality(v_recipients) = 0
     OR (p_student_user_ids IS NOT NULL AND cardinality(v_recipients) <> (SELECT count(DISTINCT x) FROM unnest(p_student_user_ids) x)) THEN
    RAISE EXCEPTION 'Recipients must be active students of this department' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.coordinator_documents(department, title, file_path, file_name, sent_by)
    VALUES (v_dept, v_title, p_path, v_name, p_sender) RETURNING coordinator_documents.document_id INTO v_doc;
  INSERT INTO public.coordinator_document_recipients(document_id, student_user_id)
    SELECT v_doc, unnest(v_recipients);
  SELECT u.full_name INTO v_sender_name FROM public.users u WHERE u.user_id = p_sender;
  INSERT INTO public.notifications(sender_user_id, receiver_user_id, message)
    SELECT p_sender, r, 'New document from ' || coalesce(v_sender_name, 'your Coordinator') || ': ' || v_title
    FROM unnest(v_recipients) r;
  RETURN QUERY SELECT v_doc, cardinality(v_recipients);
END;
$$;
REVOKE ALL ON FUNCTION public.send_coordinator_document(uuid, text, text, text, text, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.send_coordinator_document(uuid, text, text, text, text, uuid[]) TO service_role;

-- ---------------------------------------------------------------- announcements
-- NULL = the whole department (all existing rows). A program-targeted row is read only by students of that program,
-- Coordinators granted it, and the Super Admin. Existing rows are unaffected.
ALTER TABLE public.announcements ADD COLUMN IF NOT EXISTS target_program text;
ALTER TABLE public.announcements DROP CONSTRAINT IF EXISTS announcements_target_program_valid;
ALTER TABLE public.announcements ADD CONSTRAINT announcements_target_program_valid
  CHECK (target_program IS NULL OR target_program IN ('BSIT', 'BS-CPE', 'BSBA-HRM', 'BSENTREP'));

DROP POLICY IF EXISTS announcement_program_boundary ON public.announcements;
CREATE POLICY announcement_program_boundary ON public.announcements AS RESTRICTIVE
  FOR SELECT TO authenticated USING (
    target_program IS NULL
    OR private.get_my_role() = 'Admin'
    OR (private.get_my_role() = 'Coordinator' AND private.staff_has_program(target_program))
    OR (private.get_my_role() = 'Student' AND EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.user_id = auth.uid() AND public.program_key_for_course(s.course) = target_program)));

DROP POLICY IF EXISTS ojt_staff_announcement_write ON public.announcements;
CREATE POLICY ojt_staff_announcement_write ON public.announcements AS RESTRICTIVE
  FOR ALL TO authenticated USING (
    private.get_my_role() <> 'Coordinator'
    OR (private.staff_has_department(target_department)
        AND (target_program IS NULL OR private.staff_has_program(target_program))))
  WITH CHECK (
    private.get_my_role() <> 'Coordinator'
    OR (private.staff_has_department(target_department)
        AND (target_program IS NULL OR private.staff_has_program(target_program))));

CREATE OR REPLACE FUNCTION public.ojt_security_revision()
RETURNS integer LANGUAGE sql IMMUTABLE AS $$ SELECT 46 $$;
REVOKE ALL ON FUNCTION public.ojt_security_revision() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ojt_security_revision() TO service_role;

COMMIT;
