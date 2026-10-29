-- Report submissions and schedule decisions were silent: notify the department's
-- Coordinators of a new pre-deployment document, and tell the student what the
-- Coordinator decided on a schedule proposal.

CREATE OR REPLACE FUNCTION public.notify_report_submitted()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET row_security = off AS $$
BEGIN
  -- Routine journals/accomplishment reports are reviewed by the Supervisor.
  IF lower(trim(NEW.report_type)) IN ('daily journal', 'accomplishment report') THEN
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
  JOIN public.users u ON u.user_id = g.user_id AND u.role = 'Coordinator' AND u.account_status = 'active'
  WHERE st.student_id = NEW.student_id;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.notify_report_submitted() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS notify_report_submitted ON public.reports;
CREATE TRIGGER notify_report_submitted AFTER INSERT ON public.reports
  FOR EACH ROW EXECUTE FUNCTION public.notify_report_submitted();

CREATE OR REPLACE FUNCTION public.notify_schedule_decision()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET row_security = off AS $$
DECLARE student_user_id uuid;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status OR NEW.status NOT IN ('approved', 'rejected', 'modified') THEN
    RETURN NEW;
  END IF;
  SELECT user_id INTO student_user_id FROM public.students WHERE student_id = NEW.student_id;
  INSERT INTO public.notifications(sender_user_id, receiver_user_id, message, status, notification_date)
  VALUES (NEW.reviewed_by, student_user_id,
    CASE NEW.status
      WHEN 'approved' THEN 'Your OJT schedule proposal was approved.'
      WHEN 'rejected' THEN 'Your OJT schedule proposal was rejected.'
      ELSE 'Your OJT Coordinator adjusted your schedule proposal.'
    END || coalesce(' Coordinator feedback: ' || nullif(trim(NEW.coordinator_feedback), ''), ''),
    'unread', now());
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.notify_schedule_decision() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS notify_schedule_decision ON public.practicum_schedules;
CREATE TRIGGER notify_schedule_decision AFTER UPDATE OF status ON public.practicum_schedules
  FOR EACH ROW EXECUTE FUNCTION public.notify_schedule_decision();

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
  JOIN public.users u ON u.user_id = g.user_id AND u.role = 'Coordinator' AND u.account_status = 'active'
  WHERE st.student_id = NEW.student_id;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.notify_schedule_submitted() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS notify_schedule_submitted ON public.practicum_schedules;
CREATE TRIGGER notify_schedule_submitted AFTER INSERT ON public.practicum_schedules
  FOR EACH ROW WHEN (NEW.status = 'pending') EXECUTE FUNCTION public.notify_schedule_submitted();
