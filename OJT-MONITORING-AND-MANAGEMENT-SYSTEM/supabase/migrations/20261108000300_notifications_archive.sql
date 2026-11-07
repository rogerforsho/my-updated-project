-- Soft-archive for notifications (mobile swipe-to-archive). No DELETE is granted, so rows are hidden, not removed.
-- Existing UPDATE grant (033) and the row-level policy "users_update_own_notifications" (024) already cover this column.
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS archived_at timestamptz;

-- Serves the feed (newest first), the unread count and the bulk mark-all-as-read for visible rows only.
CREATE INDEX IF NOT EXISTS notifications_receiver_visible_idx
  ON public.notifications (receiver_user_id, notification_date DESC)
  WHERE archived_at IS NULL;
