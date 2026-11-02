-- Tell the student when a Supervisor or Coordinator decides an attendance record.

CREATE OR REPLACE FUNCTION public.notify_attendance_decision()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET row_security = off AS $$
DECLARE student_user_id uuid;
BEGIN
  IF OLD.verification_status IS DISTINCT FROM 'pending'
     OR NEW.verification_status NOT IN ('verified', 'rejected') THEN
    RETURN NEW;
  END IF;
  SELECT user_id INTO student_user_id FROM public.students WHERE student_id = NEW.student_id;
  INSERT INTO public.notifications(sender_user_id, receiver_user_id, message, status, notification_date)
  VALUES (
    (SELECT user_id FROM public.users WHERE user_id = auth.uid()),
    student_user_id,
    CASE NEW.verification_status
      WHEN 'verified' THEN 'Your attendance for ' || NEW.attendance_date || ' was verified.'
      ELSE 'Your attendance for ' || NEW.attendance_date || ' was disputed. Contact your Supervisor or Coordinator.'
    END,
    'unread', now());
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.notify_attendance_decision() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS notify_attendance_decision ON public.attendance;
CREATE TRIGGER notify_attendance_decision AFTER UPDATE OF verification_status ON public.attendance
  FOR EACH ROW EXECUTE FUNCTION public.notify_attendance_decision();
