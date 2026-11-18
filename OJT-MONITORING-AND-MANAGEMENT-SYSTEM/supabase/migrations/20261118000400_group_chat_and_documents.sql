-- Department group chat (Coordinators + Students of one department) and Coordinator documents
-- sent to students. Writes only happen through service_role RPCs after the web/BFF layer has
-- authenticated the caller; RLS only lets members read.
BEGIN;
SET LOCAL lock_timeout = '5s';

-- ---------------------------------------------------------------- membership
CREATE OR REPLACE FUNCTION public.group_chat_has_member(p_user_id uuid, p_department text)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public SET row_security = off AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    JOIN public.staff_capability_grants g ON g.user_id = u.user_id
    WHERE u.user_id = p_user_id AND u.role = 'Coordinator' AND u.account_status = 'active'
      AND g.capability = 'academic_workflows' AND g.revoked_at IS NULL
      AND g.department_scope = upper(trim(p_department))
  ) OR EXISTS (
    SELECT 1 FROM public.users u
    JOIN public.students s ON s.user_id = u.user_id
    WHERE u.user_id = p_user_id AND u.role = 'Student' AND u.account_status = 'active'
      AND public.course_department(s.course) = upper(trim(p_department))
  );
$$;
REVOKE ALL ON FUNCTION public.group_chat_has_member(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.group_chat_has_member(uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.group_chat_can_read(p_department text)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public SET row_security = off AS $$
  SELECT public.group_chat_has_member(auth.uid(), p_department);
$$;
REVOKE ALL ON FUNCTION public.group_chat_can_read(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.group_chat_can_read(text) TO authenticated, service_role;

-- The mobile BFF asks the database which group a student belongs to, so the course-to-department
-- rule stays in one place (course_department).
CREATE OR REPLACE FUNCTION public.student_group_chat_department(p_user_id uuid)
RETURNS text LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public SET row_security = off AS $$
  SELECT public.course_department(s.course) FROM public.students s WHERE s.user_id = p_user_id;
$$;
REVOKE ALL ON FUNCTION public.student_group_chat_department(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.student_group_chat_department(uuid) TO service_role;

-- ---------------------------------------------------------------- group chat
CREATE TABLE IF NOT EXISTS public.group_chat_messages (
  message_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department text NOT NULL CONSTRAINT group_chat_messages_department_valid CHECK (department IN ('ICS', 'IBE')),
  sender_user_id uuid NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  sender_name text NOT NULL,
  sender_role text NOT NULL,
  content text NOT NULL CONSTRAINT group_chat_messages_content_valid
    CHECK (char_length(content) BETWEEN 1 AND 4000 AND content ~ '[^[:space:]]'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS group_chat_messages_dept_created_idx
  ON public.group_chat_messages(department, created_at, message_id);

ALTER TABLE public.group_chat_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS group_chat_member_read ON public.group_chat_messages;
CREATE POLICY group_chat_member_read ON public.group_chat_messages
  FOR SELECT TO authenticated USING (public.group_chat_can_read(department));
REVOKE ALL ON public.group_chat_messages FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.group_chat_messages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.group_chat_messages TO service_role;

CREATE OR REPLACE FUNCTION public.post_group_chat_message(p_sender uuid, p_department text, p_content text)
RETURNS TABLE(message_id uuid, created_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET row_security = off AS $$
DECLARE
  v_dept text := upper(trim(coalesce(p_department, '')));
  v_text text := regexp_replace(coalesce(p_content, ''), '^[[:space:]]+|[[:space:]]+$', '', 'g');
  v_name text; v_role text;
BEGIN
  IF v_dept NOT IN ('ICS', 'IBE') OR v_text = '' OR char_length(v_text) > 4000 THEN
    RAISE EXCEPTION 'Invalid group chat message' USING ERRCODE = '22023';
  END IF;
  IF NOT public.group_chat_has_member(p_sender, v_dept) THEN
    RAISE EXCEPTION 'Not a member of this group chat' USING ERRCODE = '42501';
  END IF;
  SELECT u.full_name, u.role INTO v_name, v_role FROM public.users u WHERE u.user_id = p_sender;
  RETURN QUERY
    INSERT INTO public.group_chat_messages(department, sender_user_id, sender_name, sender_role, content)
    VALUES (v_dept, p_sender, coalesce(v_name, 'Unknown'), v_role, v_text)
    RETURNING group_chat_messages.message_id, group_chat_messages.created_at;
END;
$$;
REVOKE ALL ON FUNCTION public.post_group_chat_message(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.post_group_chat_message(uuid, text, text) TO service_role;

-- ---------------------------------------------------------------- documents
CREATE TABLE IF NOT EXISTS public.coordinator_documents (
  document_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department text NOT NULL CONSTRAINT coordinator_documents_department_valid CHECK (department IN ('ICS', 'IBE')),
  title text NOT NULL CONSTRAINT coordinator_documents_title_valid CHECK (char_length(trim(title)) BETWEEN 1 AND 200),
  file_path text NOT NULL CONSTRAINT coordinator_documents_path_valid CHECK (file_path LIKE 'chat/%'),
  file_name text NOT NULL CHECK (char_length(file_name) BETWEEN 1 AND 255 AND file_name !~ '[/\\]'),
  sent_by uuid NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.coordinator_document_recipients (
  document_id uuid NOT NULL REFERENCES public.coordinator_documents(document_id) ON DELETE CASCADE,
  student_user_id uuid NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  PRIMARY KEY (document_id, student_user_id)
);
CREATE INDEX IF NOT EXISTS coordinator_document_recipients_student_idx
  ON public.coordinator_document_recipients(student_user_id);

-- Helpers avoid RLS recursion between the two tables.
CREATE OR REPLACE FUNCTION public.document_can_read(p_document_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public SET row_security = off AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.coordinator_documents d
    WHERE d.document_id = p_document_id AND (
      EXISTS (SELECT 1 FROM public.users u WHERE u.user_id = auth.uid() AND u.role = 'Coordinator')
        AND public.group_chat_has_member(auth.uid(), d.department)
      OR EXISTS (SELECT 1 FROM public.coordinator_document_recipients r
                 WHERE r.document_id = d.document_id AND r.student_user_id = auth.uid())
    )
  );
$$;
REVOKE ALL ON FUNCTION public.document_can_read(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.document_can_read(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.document_staff_can_read(p_document_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public SET row_security = off AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.coordinator_documents d
    JOIN public.users u ON u.user_id = auth.uid() AND u.role = 'Coordinator'
    WHERE d.document_id = p_document_id AND public.group_chat_has_member(u.user_id, d.department)
  );
$$;
REVOKE ALL ON FUNCTION public.document_staff_can_read(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.document_staff_can_read(uuid) TO authenticated, service_role;

ALTER TABLE public.coordinator_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coordinator_document_recipients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS coordinator_documents_read ON public.coordinator_documents;
CREATE POLICY coordinator_documents_read ON public.coordinator_documents
  FOR SELECT TO authenticated USING (public.document_can_read(document_id));
DROP POLICY IF EXISTS coordinator_document_recipients_read ON public.coordinator_document_recipients;
CREATE POLICY coordinator_document_recipients_read ON public.coordinator_document_recipients
  FOR SELECT TO authenticated USING (student_user_id = auth.uid() OR public.document_staff_can_read(document_id));

REVOKE ALL ON public.coordinator_documents, public.coordinator_document_recipients FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.coordinator_documents, public.coordinator_document_recipients TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.coordinator_documents, public.coordinator_document_recipients TO service_role;

-- p_student_user_ids NULL = every active student of the department.
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

-- ---------------------------------------------------------------- rate limit
-- Same function as 20261024000800 with one more allowed action, 'group_chat_post'.
CREATE OR REPLACE FUNCTION public.claim_auth_rate_limit(
  p_action text, p_subject_hash text, p_max_attempts integer, p_window_seconds integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '' SET row_security = off AS $$
DECLARE
  v_window_start timestamptz;
  v_attempts integer;
BEGIN
  IF p_action IS NULL
     OR p_action NOT IN (
       'login', 'register', 'password_reset_request', 'password_reset_verify', 'id_card_upload',
       'report_upload', 'report_submit', 'attendance_submit', 'selfie_upload',
       'password_reset_admin', 'student_import', 'group_chat_post'
     )
     OR p_subject_hash IS NULL OR p_subject_hash !~ '^[0-9a-f]{64}$'
     OR p_max_attempts IS NULL OR p_max_attempts < 1 OR p_max_attempts > 100
     OR p_window_seconds IS NULL OR p_window_seconds < 60 OR p_window_seconds > 86400 THEN
    RAISE EXCEPTION 'Invalid rate limit parameters';
  END IF;

  v_window_start := to_timestamp(floor(extract(epoch FROM clock_timestamp()) / p_window_seconds) * p_window_seconds);

  INSERT INTO public.auth_rate_limits AS limits (action, subject_hash, window_start, attempts)
  VALUES (p_action, p_subject_hash, v_window_start, 1)
  ON CONFLICT (action, subject_hash, window_start)
  DO UPDATE SET attempts = limits.attempts + 1
  RETURNING attempts INTO v_attempts;

  IF v_attempts = p_max_attempts + 1 THEN
    INSERT INTO public.audit_logs (actor_user_id, action, entity_type, details)
    VALUES (NULL, 'RATE_LIMIT_BLOCKED', 'auth', jsonb_build_object('action', p_action));
  END IF;

  IF random() < 0.01 THEN
    DELETE FROM public.auth_rate_limits WHERE window_start < now() - interval '7 days';
  END IF;

  RETURN v_attempts <= p_max_attempts;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_auth_rate_limit(text, text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_auth_rate_limit(text, text, integer, integer) TO service_role;

-- ---------------------------------------------------------------- realtime
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime'
                     AND schemaname = 'public' AND tablename = 'group_chat_messages') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.group_chat_messages;
  END IF;
END $$;

COMMIT;
