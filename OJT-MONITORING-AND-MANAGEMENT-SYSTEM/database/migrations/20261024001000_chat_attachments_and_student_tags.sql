BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$ BEGIN
  IF to_regprocedure('public.ojt_security_revision()') IS NULL
     OR public.ojt_security_revision() < 44
     OR to_regclass('public.chat_messages') IS NULL THEN
    RAISE EXCEPTION 'Apply and verify migrations through 20261024000900 first';
  END IF;
END $$;

-- Attachments live in private-documents under chat/<sender user id>/<uuid>.<ext>. Only the
-- server writes there (after validating the bytes), and files are served through
-- short-lived signed URLs issued after a participant check, so no storage policy changes.
ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS attachment_path text,
  ADD COLUMN IF NOT EXISTS attachment_name text,
  ADD COLUMN IF NOT EXISTS tagged_student_id uuid REFERENCES public.students(student_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tagged_student_label text;

ALTER TABLE public.chat_messages DROP CONSTRAINT IF EXISTS chat_messages_content_valid;
ALTER TABLE public.chat_messages ADD CONSTRAINT chat_messages_content_valid CHECK (
  char_length(content) <= 4000 AND (content ~ '[^[:space:]]' OR attachment_path IS NOT NULL));
ALTER TABLE public.chat_messages ADD CONSTRAINT chat_messages_attachment_valid CHECK (
  (attachment_path IS NULL) = (attachment_name IS NULL)
  AND (attachment_path IS NULL OR (char_length(attachment_path) <= 512 AND char_length(attachment_name) BETWEEN 1 AND 255)));

-- Same placement join as chat_pair_is_eligible, narrowed to one student.
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
  );
$$;
REVOKE ALL ON FUNCTION public.chat_student_is_taggable(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.chat_student_is_taggable(uuid, uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.list_chat_taggable_students(p_counterpart_user_id uuid)
RETURNS TABLE(tag_student_id uuid, tag_student_name text, tag_student_number text)
LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path = public SET row_security = off AS $$
DECLARE v_user_id uuid := auth.uid(); v_role text; v_coordinator_id uuid; v_supervisor_id uuid;
BEGIN
  SELECT u.role INTO v_role FROM public.users u
  WHERE u.user_id = v_user_id AND u.account_status = 'active' AND u.role IN ('Coordinator','Supervisor');
  IF v_role IS NULL OR p_counterpart_user_id IS NULL THEN RETURN; END IF;
  IF v_role = 'Coordinator' THEN v_coordinator_id := v_user_id; v_supervisor_id := p_counterpart_user_id;
  ELSE v_coordinator_id := p_counterpart_user_id; v_supervisor_id := v_user_id; END IF;
  IF NOT public.chat_pair_is_eligible(v_coordinator_id, v_supervisor_id) THEN RETURN; END IF;
  RETURN QUERY
    SELECT s.student_id, su.full_name, s.student_number
    FROM public.students s
    JOIN public.users su ON su.user_id = s.user_id
    WHERE EXISTS (
      SELECT 1 FROM public.student_assignments sa
      JOIN public.supervisors sp ON sp.supervisor_id = sa.supervisor_id
      WHERE sa.student_id = s.student_id AND sa.assignment_status = 'active' AND sp.user_id = v_supervisor_id)
      AND public.chat_student_is_taggable(v_coordinator_id, v_supervisor_id, s.student_id)
    ORDER BY su.full_name;
END;
$$;
REVOKE ALL ON FUNCTION public.list_chat_taggable_students(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_chat_taggable_students(uuid) TO authenticated;

DROP FUNCTION IF EXISTS public.send_chat_message(uuid, text);
CREATE OR REPLACE FUNCTION public.send_chat_message(
  p_counterpart_user_id uuid,
  p_content text,
  p_attachment_path text DEFAULT NULL,
  p_attachment_name text DEFAULT NULL,
  p_tagged_student_id uuid DEFAULT NULL
)
RETURNS TABLE(conversation_id uuid, message_id uuid, created_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET row_security = off AS $$
DECLARE v_user_id uuid := auth.uid(); v_role text; v_coordinator_id uuid; v_supervisor_id uuid;
  v_conversation_id uuid; v_message_id uuid; v_created_at timestamptz; v_label text;
  v_text text := regexp_replace(coalesce(p_content, ''), '^[[:space:]]+|[[:space:]]+$', '', 'g');
  v_attachment_name text := nullif(btrim(coalesce(p_attachment_name, '')), '');
BEGIN
  SELECT u.role INTO v_role FROM public.users u
  WHERE u.user_id = v_user_id AND u.account_status = 'active' AND u.role IN ('Coordinator','Supervisor');
  IF v_role IS NULL OR p_counterpart_user_id IS NULL OR char_length(v_text) > 4000
     OR (v_text = '' AND p_attachment_path IS NULL) THEN
    RAISE EXCEPTION 'Invalid chat message or participant' USING ERRCODE = '22023';
  END IF;
  IF v_role = 'Coordinator' THEN v_coordinator_id := v_user_id; v_supervisor_id := p_counterpart_user_id;
  ELSE v_coordinator_id := p_counterpart_user_id; v_supervisor_id := v_user_id; END IF;
  IF NOT public.chat_pair_is_eligible(v_coordinator_id, v_supervisor_id) THEN
    RAISE EXCEPTION 'This conversation is archived or the participant is not eligible' USING ERRCODE = '42501';
  END IF;

  IF p_attachment_path IS NOT NULL THEN
    IF p_attachment_path !~ ('^chat/' || v_user_id::text || '/[0-9a-f-]{36}\.(pdf|docx|doc|jpg|jpeg|png)$')
       OR v_attachment_name IS NULL OR char_length(v_attachment_name) > 255 OR v_attachment_name ~ '[/\\]'
       OR NOT EXISTS (SELECT 1 FROM storage.objects o
         WHERE o.bucket_id = 'private-documents' AND o.name = p_attachment_path) THEN
      RAISE EXCEPTION 'Invalid chat attachment' USING ERRCODE = '22023';
    END IF;
  ELSIF p_attachment_name IS NOT NULL THEN
    RAISE EXCEPTION 'Invalid chat attachment' USING ERRCODE = '22023';
  END IF;

  IF p_tagged_student_id IS NOT NULL THEN
    IF NOT public.chat_student_is_taggable(v_coordinator_id, v_supervisor_id, p_tagged_student_id) THEN
      RAISE EXCEPTION 'This student cannot be tagged in this conversation' USING ERRCODE = '42501';
    END IF;
    SELECT su.full_name || ' (' || s.student_number || ')' INTO v_label
    FROM public.students s JOIN public.users su ON su.user_id = s.user_id
    WHERE s.student_id = p_tagged_student_id;
  END IF;

  INSERT INTO public.chat_conversations(coordinator_user_id, supervisor_user_id)
    VALUES (v_coordinator_id, v_supervisor_id)
    ON CONFLICT (coordinator_user_id, supervisor_user_id) DO NOTHING;
  SELECT c.conversation_id INTO v_conversation_id FROM public.chat_conversations c
    WHERE c.coordinator_user_id = v_coordinator_id AND c.supervisor_user_id = v_supervisor_id;
  INSERT INTO public.chat_messages(conversation_id, sender_user_id, content,
      attachment_path, attachment_name, tagged_student_id, tagged_student_label)
    VALUES (v_conversation_id, v_user_id, v_text,
      p_attachment_path, v_attachment_name, p_tagged_student_id, v_label)
    RETURNING chat_messages.message_id, chat_messages.created_at INTO v_message_id, v_created_at;
  RETURN QUERY SELECT v_conversation_id, v_message_id, v_created_at;
END;
$$;
REVOKE ALL ON FUNCTION public.send_chat_message(uuid, text, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_chat_message(uuid, text, text, text, uuid) TO authenticated;

COMMIT;
