BEGIN;
SET LOCAL lock_timeout = '5s';

-- Punctuality is judged against the student's approved practicum schedule, and says why it cannot be judged
-- (not a scheduled work day / no approved schedule) instead of "unknown".
ALTER TABLE public.attendance DROP CONSTRAINT IF EXISTS attendance_late_status_check;
ALTER TABLE public.attendance ADD CONSTRAINT attendance_late_status_check
  CHECK (late_status IN ('on_time', 'late', 'not_work_day', 'no_schedule', 'unknown'));

-- Backfill only the old 'unknown' rows; on_time/late rows were already judged against a real cutoff.
UPDATE public.attendance a
SET late_status = x.status
FROM (
  SELECT a2.attendance_id,
    CASE
      WHEN s.time_in IS NULL THEN 'no_schedule'
      WHEN NOT (extract(dow FROM a2.attendance_date)::int = ANY (s.work_days)) THEN 'not_work_day'
      WHEN (a2.time_in AT TIME ZONE 'Asia/Manila')::time > s.time_in THEN 'late'
      ELSE 'on_time'
    END AS status
  FROM public.attendance a2
  LEFT JOIN LATERAL (
    SELECT ps.time_in, ps.work_days
    FROM public.student_assignments sa
    JOIN public.practicum_schedules ps
      ON ps.student_id = a2.student_id AND ps.company_id = sa.company_id AND ps.branch_id = sa.branch_id
    WHERE sa.assignment_id = a2.assignment_id
      AND ps.status = 'approved'
      AND ps.start_date <= a2.attendance_date
      AND (ps.end_date IS NULL OR ps.end_date >= a2.attendance_date)
    ORDER BY ps.start_date DESC, ps.created_at DESC
    LIMIT 1
  ) s ON true
  WHERE a2.late_status = 'unknown'
) x
WHERE a.attendance_id = x.attendance_id;

COMMIT;
