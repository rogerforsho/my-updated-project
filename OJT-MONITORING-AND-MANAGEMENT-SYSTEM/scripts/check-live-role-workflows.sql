-- Run only on local or isolated staging. Every test write rolls back.
DO $audit$
DECLARE
  v_admin uuid; v_coordinator uuid; v_supervisor uuid; v_student uuid;
  v_student_id uuid; v_incident uuid; v_message uuid; v_count integer;
BEGIN
  SELECT user_id INTO STRICT v_admin FROM public.users
    WHERE role = 'Admin' AND account_status = 'active' LIMIT 1;
  SELECT u.user_id, s.student_id INTO STRICT v_student, v_student_id
    FROM public.users u JOIN public.students s USING (user_id)
    JOIN public.student_assignments sa USING (student_id)
    JOIN public.supervisors sp USING (supervisor_id)
    JOIN public.users su ON su.user_id = sp.user_id
    WHERE u.role = 'Student' AND u.account_status = 'active'
      AND public.course_department(s.course) = 'ICS' AND sa.assignment_status = 'active'
      AND su.role = 'Supervisor' AND su.account_status = 'active' LIMIT 1;
  SELECT u.user_id INTO STRICT v_coordinator FROM public.users u
    JOIN public.staff_capability_grants g USING (user_id)
    WHERE u.role = 'Coordinator' AND u.account_status = 'active'
      AND g.capability = 'academic_workflows' AND g.department_scope = 'ICS' AND g.revoked_at IS NULL LIMIT 1;
  SELECT u.user_id INTO STRICT v_supervisor FROM public.users u
    JOIN public.supervisors sp USING (user_id) JOIN public.student_assignments sa USING (supervisor_id)
    WHERE u.role = 'Supervisor' AND u.account_status = 'active'
      AND sa.student_id = v_student_id AND sa.assignment_status = 'active' LIMIT 1;

  BEGIN
    PERFORM set_config('request.jwt.claim.sub', v_admin::text, true);
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub',v_admin,'role','authenticated','aal','aal1')::text, true);
    SET LOCAL ROLE authenticated;
    SELECT count(*) INTO v_count FROM public.users;
    ASSERT v_count = 1, 'Admin without MFA must see only their own profile';
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub',v_admin,'role','authenticated','aal','aal2')::text, true);
    SELECT count(*) INTO v_count FROM public.users;
    ASSERT v_count > 1, 'Admin with MFA must read account inventory';
    SELECT count(*) INTO v_count FROM public.students;
    ASSERT v_count = 0, 'Admin must not read academic profiles';

    RESET ROLE;
    PERFORM set_config('request.jwt.claim.sub', v_student::text, true);
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub',v_student,'role','authenticated','aal','aal1')::text, true);
    SET LOCAL ROLE authenticated;
    SELECT count(*) INTO v_count FROM public.users WHERE user_id = v_student AND must_change_password IS NOT NULL;
    ASSERT v_count = 1, 'Student profile/password flag must load';
    SELECT count(*) INTO v_count FROM public.students;
    ASSERT v_count = 1, 'Student must see only their own academic profile';
    INSERT INTO public.incident_reports(student_id,submitted_by,category,description)
      VALUES(v_student_id,v_student,'other','Synthetic rollback-only backend workflow check.') RETURNING incident_id INTO v_incident;

    RESET ROLE;
    PERFORM set_config('request.jwt.claim.sub', v_coordinator::text, true);
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub',v_coordinator,'role','authenticated','aal','aal1')::text, true);
    SET LOCAL ROLE authenticated;
    UPDATE public.incident_reports SET status='acknowledged', reviewed_by=v_coordinator WHERE incident_id=v_incident;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    ASSERT v_count = 1, 'Department Coordinator must acknowledge incident';
    UPDATE public.incident_reports SET status='closed', coordinator_response='Synthetic test response.', reviewed_by=v_coordinator WHERE incident_id=v_incident;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    ASSERT v_count = 1, 'Department Coordinator must close incident';
    SELECT message_id INTO STRICT v_message FROM public.send_chat_message(
      v_supervisor,'Synthetic rollback-only chat check.',NULL,NULL,v_student_id);

    RESET ROLE;
    PERFORM set_config('request.jwt.claim.sub', v_supervisor::text, true);
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub',v_supervisor,'role','authenticated','aal','aal1')::text, true);
    SET LOCAL ROLE authenticated;
    SELECT count(*) INTO v_count FROM public.students WHERE student_id=v_student_id;
    ASSERT v_count = 1, 'Assigned Supervisor must read student';
    SELECT count(*) INTO v_count FROM public.incident_reports WHERE incident_id=v_incident;
    ASSERT v_count = 0, 'Supervisor must not read confidential incident';
    SELECT count(*) INTO v_count FROM public.chat_messages WHERE message_id=v_message AND tagged_student_id=v_student_id;
    ASSERT v_count = 1, 'Supervisor must receive current chat format';

    RESET ROLE;
    PERFORM set_config('request.jwt.claim.sub', v_student::text, true);
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub',v_student,'role','authenticated','aal','aal1')::text, true);
    SET LOCAL ROLE authenticated;
    SELECT count(*) INTO v_count FROM public.incident_reports WHERE incident_id=v_incident AND status='closed';
    ASSERT v_count = 1, 'Student must read Coordinator response';
    RESET ROLE;
    RAISE EXCEPTION 'Rollback successful workflow checks' USING ERRCODE='PZ001';
  EXCEPTION WHEN SQLSTATE 'PZ001' THEN
    RAISE NOTICE 'PASS four-role database workflows; all test writes rolled back';
  END;
END
$audit$;
