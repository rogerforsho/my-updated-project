-- Coordinator/Supervisor web chat. Apply after the existing authorization migrations.
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS related_conversation_id uuid;

CREATE TABLE IF NOT EXISTS public.chat_conversations (
  conversation_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coordinator_user_id uuid NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  supervisor_user_id uuid NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  coordinator_last_read_at timestamptz,
  supervisor_last_read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chat_conversations_distinct_participants CHECK (coordinator_user_id <> supervisor_user_id),
  CONSTRAINT chat_conversations_unique_pair UNIQUE (coordinator_user_id, supervisor_user_id)
);

CREATE TABLE IF NOT EXISTS public.chat_messages (
  message_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.chat_conversations(conversation_id) ON DELETE CASCADE,
  sender_user_id uuid NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  content text NOT NULL CONSTRAINT chat_messages_content_valid CHECK (char_length(content) BETWEEN 1 AND 4000 AND content ~ '[^[:space:]]'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chat_messages_conversation_created_idx ON public.chat_messages(conversation_id, created_at, message_id);
CREATE INDEX IF NOT EXISTS notifications_related_conversation_idx ON public.notifications(related_conversation_id) WHERE related_conversation_id IS NOT NULL;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notifications_related_conversation_fk') THEN
    ALTER TABLE public.notifications ADD CONSTRAINT notifications_related_conversation_fk
      FOREIGN KEY (related_conversation_id) REFERENCES public.chat_conversations(conversation_id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.chat_pair_is_eligible(p_coordinator_user_id uuid, p_supervisor_user_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public SET row_security = off AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users cu
    JOIN public.coordinators c ON c.user_id = cu.user_id
    JOIN public.users su ON su.user_id = p_supervisor_user_id
    JOIN public.supervisors sp ON sp.user_id = su.user_id
    JOIN public.student_assignments sa ON sa.supervisor_id = sp.supervisor_id AND sa.assignment_status = 'active'
    JOIN public.students s ON s.student_id = sa.student_id
    WHERE cu.user_id = p_coordinator_user_id
      AND cu.role = 'Coordinator' AND cu.account_status = 'active'
      AND su.role = 'Supervisor' AND su.account_status = 'active'
      AND upper(trim(c.department)) = public.course_department(s.course)
  );
$$;
REVOKE ALL ON FUNCTION public.chat_pair_is_eligible(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.chat_pair_is_eligible(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.chat_can_read_conversation(p_conversation_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public SET row_security = off AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.chat_conversations c
    JOIN public.users u ON u.user_id = auth.uid() AND u.account_status = 'active'
      AND ((u.role = 'Coordinator' AND c.coordinator_user_id = u.user_id)
        OR (u.role = 'Supervisor' AND c.supervisor_user_id = u.user_id))
    WHERE c.conversation_id = p_conversation_id
  );
$$;
REVOKE ALL ON FUNCTION public.chat_can_read_conversation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.chat_can_read_conversation(uuid) TO authenticated, service_role;

ALTER TABLE public.chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS chat_participant_read_conversations ON public.chat_conversations;
CREATE POLICY chat_participant_read_conversations ON public.chat_conversations
  FOR SELECT TO authenticated USING (public.chat_can_read_conversation(conversation_id));
DROP POLICY IF EXISTS chat_participant_read_messages ON public.chat_messages;
CREATE POLICY chat_participant_read_messages ON public.chat_messages
  FOR SELECT TO authenticated USING (public.chat_can_read_conversation(conversation_id));

REVOKE ALL ON public.chat_conversations, public.chat_messages FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.chat_conversations, public.chat_messages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_conversations, public.chat_messages TO service_role;

CREATE OR REPLACE FUNCTION public.list_chat_contacts()
RETURNS TABLE(counterpart_user_id uuid, counterpart_name text, counterpart_role text,
  conversation_id uuid, unread_count bigint, is_eligible boolean)
LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path = public SET row_security = off AS $$
DECLARE v_user_id uuid := auth.uid(); v_role text;
BEGIN
  SELECT u.role INTO v_role FROM public.users u
  WHERE u.user_id = v_user_id AND u.account_status = 'active' AND u.role IN ('Coordinator','Supervisor');
  IF v_role IS NULL THEN RETURN; END IF;

  IF v_role = 'Coordinator' THEN
    RETURN QUERY SELECT su.user_id, su.full_name, 'Supervisor'::text, cc.conversation_id,
      CASE WHEN cc.conversation_id IS NULL THEN 0::bigint ELSE (
        SELECT count(*) FROM public.chat_messages m WHERE m.conversation_id = cc.conversation_id
          AND m.sender_user_id <> v_user_id AND m.created_at > coalesce(cc.coordinator_last_read_at, '-infinity'::timestamptz)
      ) END, public.chat_pair_is_eligible(v_user_id, su.user_id)
    FROM public.users su JOIN public.supervisors sp ON sp.user_id = su.user_id
    LEFT JOIN public.chat_conversations cc ON cc.coordinator_user_id = v_user_id AND cc.supervisor_user_id = su.user_id
    WHERE su.role = 'Supervisor' AND su.account_status = 'active'
      AND (public.chat_pair_is_eligible(v_user_id, su.user_id) OR cc.conversation_id IS NOT NULL)
    ORDER BY su.full_name;
  ELSE
    RETURN QUERY SELECT cu.user_id, cu.full_name, 'Coordinator'::text, cc.conversation_id,
      CASE WHEN cc.conversation_id IS NULL THEN 0::bigint ELSE (
        SELECT count(*) FROM public.chat_messages m WHERE m.conversation_id = cc.conversation_id
          AND m.sender_user_id <> v_user_id AND m.created_at > coalesce(cc.supervisor_last_read_at, '-infinity'::timestamptz)
      ) END, public.chat_pair_is_eligible(cu.user_id, v_user_id)
    FROM public.users cu JOIN public.coordinators c ON c.user_id = cu.user_id
    LEFT JOIN public.chat_conversations cc ON cc.coordinator_user_id = cu.user_id AND cc.supervisor_user_id = v_user_id
    WHERE cu.role = 'Coordinator' AND cu.account_status = 'active'
      AND (public.chat_pair_is_eligible(cu.user_id, v_user_id) OR cc.conversation_id IS NOT NULL)
    ORDER BY cu.full_name;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.list_chat_contacts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_chat_contacts() TO authenticated;

CREATE OR REPLACE FUNCTION public.send_chat_message(p_counterpart_user_id uuid, p_content text)
RETURNS TABLE(conversation_id uuid, message_id uuid, created_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET row_security = off AS $$
DECLARE v_user_id uuid := auth.uid(); v_role text; v_coordinator_id uuid; v_supervisor_id uuid;
  v_conversation_id uuid; v_message_id uuid; v_created_at timestamptz;
  v_text text := regexp_replace(coalesce(p_content, ''), '^[[:space:]]+|[[:space:]]+$', '', 'g');
BEGIN
  SELECT u.role INTO v_role FROM public.users u
  WHERE u.user_id = v_user_id AND u.account_status = 'active' AND u.role IN ('Coordinator','Supervisor');
  IF v_role IS NULL OR p_counterpart_user_id IS NULL OR v_text = '' OR char_length(v_text) > 4000 THEN
    RAISE EXCEPTION 'Invalid chat message or participant' USING ERRCODE = '22023';
  END IF;
  IF v_role = 'Coordinator' THEN v_coordinator_id := v_user_id; v_supervisor_id := p_counterpart_user_id;
  ELSE v_coordinator_id := p_counterpart_user_id; v_supervisor_id := v_user_id; END IF;
  IF NOT public.chat_pair_is_eligible(v_coordinator_id, v_supervisor_id) THEN
    RAISE EXCEPTION 'This conversation is archived or the participant is not eligible' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.chat_conversations(coordinator_user_id, supervisor_user_id)
    VALUES (v_coordinator_id, v_supervisor_id)
    ON CONFLICT (coordinator_user_id, supervisor_user_id) DO NOTHING;
  SELECT c.conversation_id INTO v_conversation_id FROM public.chat_conversations c
    WHERE c.coordinator_user_id = v_coordinator_id AND c.supervisor_user_id = v_supervisor_id;
  INSERT INTO public.chat_messages(conversation_id, sender_user_id, content)
    VALUES (v_conversation_id, v_user_id, v_text)
    RETURNING chat_messages.message_id, chat_messages.created_at INTO v_message_id, v_created_at;
  RETURN QUERY SELECT v_conversation_id, v_message_id, v_created_at;
END;
$$;
REVOKE ALL ON FUNCTION public.send_chat_message(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_chat_message(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_chat_read(p_conversation_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET row_security = off AS $$
DECLARE v_user_id uuid := auth.uid();
BEGIN
  IF NOT public.chat_can_read_conversation(p_conversation_id) THEN
    RAISE EXCEPTION 'Conversation unavailable' USING ERRCODE = '42501';
  END IF;
  UPDATE public.chat_conversations c SET
    coordinator_last_read_at = CASE WHEN c.coordinator_user_id = v_user_id THEN now() ELSE c.coordinator_last_read_at END,
    supervisor_last_read_at = CASE WHEN c.supervisor_user_id = v_user_id THEN now() ELSE c.supervisor_last_read_at END
  WHERE c.conversation_id = p_conversation_id;
  UPDATE public.notifications n SET status = 'read'
  WHERE n.receiver_user_id = v_user_id AND n.related_conversation_id = p_conversation_id AND n.status = 'unread';
END;
$$;
REVOKE ALL ON FUNCTION public.mark_chat_read(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_chat_read(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_chat_notification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET row_security = off AS $$
DECLARE v_receiver_id uuid; v_sender_name text;
BEGIN
  SELECT CASE WHEN c.coordinator_user_id = NEW.sender_user_id THEN c.supervisor_user_id ELSE c.coordinator_user_id END
    INTO v_receiver_id FROM public.chat_conversations c WHERE c.conversation_id = NEW.conversation_id;
  SELECT u.full_name INTO v_sender_name FROM public.users u WHERE u.user_id = NEW.sender_user_id;
  INSERT INTO public.notifications(sender_user_id, receiver_user_id, message, related_conversation_id)
    VALUES (NEW.sender_user_id, v_receiver_id, 'New chat message from ' || coalesce(v_sender_name, 'your counterpart'), NEW.conversation_id);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.create_chat_notification() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS chat_message_notification ON public.chat_messages;
CREATE TRIGGER chat_message_notification AFTER INSERT ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.create_chat_notification();

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'chat_messages') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'notifications') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END $$;

COMMIT;
