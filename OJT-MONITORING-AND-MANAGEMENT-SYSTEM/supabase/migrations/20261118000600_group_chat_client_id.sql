-- Group chat messages written offline are retried by the phone. A client-made id per message makes
-- a retry harmless: the same (sender, client_id) is stored once and the existing row is returned.
-- client_id stays optional so older app builds that send no id keep working.
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.group_chat_messages ADD COLUMN IF NOT EXISTS client_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS group_chat_messages_sender_client_uidx
  ON public.group_chat_messages(sender_user_id, client_id);

-- A 3-argument overload beside the new one would make a 3-argument call ambiguous, so replace it.
DROP FUNCTION IF EXISTS public.post_group_chat_message(uuid, text, text);
CREATE OR REPLACE FUNCTION public.post_group_chat_message(p_sender uuid, p_department text, p_content text, p_client_id uuid DEFAULT NULL)
RETURNS TABLE(message_id uuid, created_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET row_security = off AS $$
DECLARE
  v_dept text := upper(trim(coalesce(p_department, '')));
  v_text text := regexp_replace(coalesce(p_content, ''), '^[[:space:]]+|[[:space:]]+$', '', 'g');
  v_name text; v_role text; v_id uuid; v_at timestamptz;
BEGIN
  IF v_dept NOT IN ('ICS', 'IBE') OR v_text = '' OR char_length(v_text) > 4000 THEN
    RAISE EXCEPTION 'Invalid group chat message' USING ERRCODE = '22023';
  END IF;
  IF NOT public.group_chat_has_member(p_sender, v_dept) THEN
    RAISE EXCEPTION 'Not a member of this group chat' USING ERRCODE = '42501';
  END IF;
  SELECT u.full_name, u.role INTO v_name, v_role FROM public.users u WHERE u.user_id = p_sender;
  INSERT INTO public.group_chat_messages AS m(department, sender_user_id, sender_name, sender_role, content, client_id)
  VALUES (v_dept, p_sender, coalesce(v_name, 'Unknown'), v_role, v_text, p_client_id)
  ON CONFLICT (sender_user_id, client_id) DO NOTHING
  RETURNING m.message_id, m.created_at INTO v_id, v_at;
  IF v_id IS NULL THEN
    SELECT m.message_id, m.created_at INTO v_id, v_at FROM public.group_chat_messages m
    WHERE m.sender_user_id = p_sender AND m.client_id = p_client_id;
  END IF;
  RETURN QUERY SELECT v_id, v_at;
END;
$$;
REVOKE ALL ON FUNCTION public.post_group_chat_message(uuid, text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.post_group_chat_message(uuid, text, text, uuid) TO service_role;

COMMIT;
