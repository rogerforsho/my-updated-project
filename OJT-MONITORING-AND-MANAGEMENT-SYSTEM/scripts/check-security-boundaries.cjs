// Isolated PostgreSQL test. Never loads .env or contacts Supabase.
// NODE_PATH must include @electric-sql/pglite (same as check-department-rls.cjs).
const {PGlite}=require('@electric-sql/pglite');
const fs=require('node:fs'); const path=require('node:path'); const assert=require('node:assert/strict');
async function main(){
 const db=new PGlite(); let checks=0;
 const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
 await db.exec(`
 CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
 CREATE SCHEMA auth; CREATE SCHEMA storage; CREATE SCHEMA extensions;
 CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb DEFAULT '{}',raw_app_meta_data jsonb DEFAULT '{}');
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
 CREATE FUNCTION extensions.uuid_generate_v4() RETURNS uuid LANGUAGE sql AS $$ SELECT gen_random_uuid() $$;
 CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 CREATE TABLE storage.objects(id uuid DEFAULT gen_random_uuid(),bucket_id text,name text,owner uuid);
 CREATE FUNCTION storage.foldername(text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT (string_to_array($1,'/'))[1:array_length(string_to_array($1,'/'),1)-1] $$;
 ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
 GRANT USAGE ON SCHEMA public,auth,storage TO anon,authenticated,service_role;

 GRANT ALL ON ALL TABLES IN SCHEMA storage TO anon,authenticated,service_role;
 `);
 const dir=path.join(__dirname,'../database/migrations');
 const migrationByPrefix=prefix=>{
   const name=fs.readdirSync(dir).find(file=>prefix==='035_'
     ? file.endsWith('_program_head_announcement_scope.sql')
     : file.startsWith(prefix));
   if(!name) throw new Error('Missing migration '+prefix);
   return fs.readFileSync(path.join(dir,name),'utf8');
 };
 for(const file of fs.readdirSync(dir).filter(f=>/^\d{3}_.*\.sql$/.test(f)||f.endsWith('_program_head_announcement_scope.sql')).sort()){
   // PGlite has gen_random_uuid; only uuid-ossp extension loading is substituted.
   const sql=fs.readFileSync(path.join(dir,file),'utf8').replace(/^\uFEFF/,'').replace(/create extension if not exists "uuid-ossp";/i,'');
   try {await db.exec(sql);} catch(error){console.error(error);throw new Error(file+': '+error.message);}
 }
 const revision=(await db.query('SELECT public.ojt_security_revision() AS revision')).rows[0].revision;
 assert.equal(Number(revision),34,'migration 035 must advance readiness revision to 34');checks++;
 const idCardMigration=fs.readFileSync(path.join(dir,'20261012191944_student_registration_front_back_id_cards.sql'),'utf8');
 assert.equal(fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261012191944_student_registration_front_back_id_cards.sql'),'utf8'),idCardMigration);
 await db.exec('CREATE OR REPLACE FUNCTION public.ojt_security_revision() RETURNS integer LANGUAGE sql STABLE AS $$ SELECT 36 $$');
 await db.exec(idCardMigration);
 assert.equal(Number((await db.query('SELECT public.ojt_security_revision() AS revision')).rows[0].revision),36,
   'the student ID migration must not lower a newer security revision');checks++;
 await db.exec(fs.readFileSync(path.join(dir,'035_coordinator_supervisor_chat.sql'),'utf8'));
 await db.exec(fs.readFileSync(path.join(__dirname,'../database/verification/launch_security_checks.sql'),'utf8'));
 checks++;
 // Reapplying the new migrations must be safe.
 for(const prefix of ['030_','031_','032_','033_','034_','035_']) await db.exec(migrationByPrefix(prefix));
 // This deployment's attendance table is missing an optional legacy QR column.
 // Re-run both migrations after removing that field to simulate the reported schema.
 await db.exec('ALTER TABLE public.attendance DROP COLUMN qr_validation_status');
 for(const prefix of ['030_','031_','032_','033_','034_','035_']) await db.exec(migrationByPrefix(prefix));
 checks++;
 // This isolated harness applies the numbered base migrations and stubs the
 // authorization helpers that the later production migrations install.
 await db.exec(`CREATE SCHEMA IF NOT EXISTS private;
 CREATE TABLE IF NOT EXISTS public.staff_capability_grants(user_id uuid,capability text,department_scope text,revoked_at timestamptz);
 CREATE TABLE IF NOT EXISTS public.evaluation_appeals(appeal_id uuid DEFAULT gen_random_uuid(),student_id uuid);
 GRANT USAGE ON SCHEMA private TO authenticated,service_role;
 CREATE FUNCTION private.get_my_role() RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public SET row_security=off AS $$ SELECT role FROM public.users WHERE user_id=auth.uid() $$;
 CREATE FUNCTION private.get_my_student_id() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public SET row_security=off AS $$ SELECT student_id FROM public.students WHERE user_id=auth.uid() $$;
 CREATE FUNCTION private.staff_has_student(p_student_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public SET row_security=off AS $$
   SELECT EXISTS (SELECT 1 FROM public.students s JOIN public.users u ON u.user_id=auth.uid()
     JOIN public.staff_capability_grants g ON g.user_id=u.user_id
     WHERE s.student_id=p_student_id AND u.role='Coordinator' AND u.account_status='active'
       AND g.capability='academic_workflows' AND g.department_scope=public.course_department(s.course) AND g.revoked_at IS NULL)
 $$;`);
 // Exercise the next migration against its declared revision-40 prerequisite.
 await db.exec('CREATE OR REPLACE FUNCTION public.ojt_security_revision() RETURNS integer LANGUAGE sql IMMUTABLE AS $$ SELECT 40 $$');
 const timeoutReviewMigration=fs.readFileSync(path.join(dir,'20261021000000_enforce_attendance_timeout_review.sql'),'utf8');
 assert.equal(fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261021000000_enforce_attendance_timeout_review.sql'),'utf8'),timeoutReviewMigration);
 await db.exec(timeoutReviewMigration);
 await db.exec(timeoutReviewMigration);
 assert.equal(Number((await db.query('SELECT public.ojt_security_revision() AS revision')).rows[0].revision),41);checks++;
 const completionMigration=fs.readFileSync(path.join(dir,'20261021000100_coordinator_final_grade_and_completion_freeze.sql'),'utf8');
 assert.equal(fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261021000100_coordinator_final_grade_and_completion_freeze.sql'),'utf8'),completionMigration);
 await db.exec(completionMigration);
 await db.exec(completionMigration);
 assert.equal(Number((await db.query('SELECT public.ojt_security_revision() AS revision')).rows[0].revision),42);checks++;
 const atomicAttendanceMigration=fs.readFileSync(path.join(dir,'20261021000200_atomic_coordinator_attendance_exception.sql'),'utf8');
 assert.equal(fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261021000200_atomic_coordinator_attendance_exception.sql'),'utf8'),atomicAttendanceMigration);
 await db.exec(atomicAttendanceMigration);
 await db.exec(atomicAttendanceMigration);
 assert.equal(Number((await db.query('SELECT public.ojt_security_revision() AS revision')).rows[0].revision),43);checks++;
 await db.exec(`
 INSERT INTO users(user_id,full_name,email,role,account_status) VALUES
 ('${id(1)}','Student A','a@example.invalid','Student','active'),
 ('${id(2)}','Student B','b@example.invalid','Student','active'),
 ('${id(3)}','Supervisor','s@example.invalid','Supervisor','active'),
 ('${id(4)}','Coordinator','c@example.invalid','Coordinator','active'),
 ('${id(5)}','Head','h@example.invalid','ProgramHead','active');
 INSERT INTO students(student_id,user_id,student_number,course,year_level,required_hours) VALUES
 ('${id(11)}','${id(1)}','TEST-A','BSIT',4,486), ('${id(12)}','${id(2)}','TEST-B','BSBA',4,486);
 INSERT INTO companies(company_id,company_name,address,contact_person,contact_email,contact_number) VALUES ('${id(20)}','Synthetic','Test','Test','test@example.invalid','0');
 INSERT INTO supervisors(supervisor_id,user_id,company_id,position) VALUES ('${id(13)}','${id(3)}','${id(20)}','Test');
 INSERT INTO coordinators(coordinator_id,user_id,department) VALUES ('${id(14)}','${id(4)}','ICS');
 INSERT INTO staff_capability_grants(user_id,capability,department_scope) VALUES ('${id(4)}','academic_workflows','ICS');
 INSERT INTO program_heads(user_id,department_or_program) VALUES ('${id(5)}','ICS');
 INSERT INTO announcements(announcement_id,author_user_id,title,content,target_role,target_department) VALUES
 ('${id(50)}','${id(4)}','ICS Notice','ICS only','All','ICS'),
 ('${id(51)}','${id(4)}','IBE Notice','IBE only','All','IBE'),
 ('${id(52)}','${id(4)}','Campus Notice','All departments','All','All');
 INSERT INTO student_assignments(assignment_id,student_id,company_id,supervisor_id,start_date) VALUES ('${id(30)}','${id(11)}','${id(20)}','${id(13)}','2026-10-01');
 INSERT INTO practicum_schedules(student_id,time_in,time_out,lunch_break_minutes,lunch_break_start,start_date,status,reviewed_by,reviewed_at) VALUES ('${id(11)}','08:00','17:00',60,'12:00','2026-10-01','approved','${id(4)}',now());
 `);
 async function asUser(n,sql){await db.exec(`RESET ROLE; SET ROLE authenticated; SET request.jwt.claim.sub='${id(n)}'`);return (await db.query(sql)).rows;}
 async function denied(n,sql){await assert.rejects(()=>asUser(n,sql),undefined,sql);checks++;}
 const coordinatorContacts=await asUser(4,'SELECT counterpart_user_id, is_eligible FROM public.list_chat_contacts()');
 assert.deepEqual(coordinatorContacts,[{counterpart_user_id:id(3),is_eligible:true}]);checks++;
 const firstChatMessage=await asUser(4,`SELECT * FROM public.send_chat_message('${id(3)}','Placement check-in')`);
 const chatConversationId=firstChatMessage[0].conversation_id;
 assert.equal((await asUser(4,`SELECT content FROM public.chat_messages WHERE conversation_id='${chatConversationId}'`))[0].content,'Placement check-in');checks++;
 assert.equal((await asUser(3,`SELECT count(*)::int AS n FROM public.chat_messages WHERE conversation_id='${chatConversationId}'`))[0].n,1);checks++;
 assert.equal((await asUser(2,`SELECT count(*)::int AS n FROM public.chat_messages WHERE conversation_id='${chatConversationId}'`))[0].n,0);checks++;
 const chatNotification=(await asUser(3,`SELECT message,status,related_conversation_id FROM public.notifications WHERE receiver_user_id='${id(3)}'`))[0];
 assert.equal(chatNotification.message,'New chat message from Coordinator');assert.equal(chatNotification.status,'unread');assert.equal(chatNotification.related_conversation_id,chatConversationId);checks++;
 await denied(4,`UPDATE public.chat_messages SET content='changed' WHERE conversation_id='${chatConversationId}'`);
 await denied(4,`INSERT INTO public.chat_messages(conversation_id,sender_user_id,content) VALUES ('${chatConversationId}','${id(4)}','Bypass send function')`);
 await denied(4,`SELECT * FROM public.send_chat_message('${id(3)}','   ')`);
 await denied(4,`SELECT * FROM public.send_chat_message('${id(3)}','${'x'.repeat(4001)}')`);
 await denied(5,`INSERT INTO public.chat_messages(conversation_id,sender_user_id,content) VALUES ('${chatConversationId}','${id(5)}','Program Head cannot write')`);
 assert.equal((await asUser(5,`SELECT count(*)::int AS n FROM public.chat_messages WHERE conversation_id='${chatConversationId}'`))[0].n,0);checks++;
 await denied(5,`SELECT * FROM public.send_chat_message('${id(3)}','Program Head cannot chat')`);
 await asUser(3,`SELECT public.mark_chat_read('${chatConversationId}')`);
 assert.equal((await asUser(3,`SELECT status FROM public.notifications WHERE related_conversation_id='${chatConversationId}'`))[0].status,'read');checks++;
 await db.exec(`RESET ROLE; UPDATE student_assignments SET assignment_status='reassigned' WHERE assignment_id='${id(30)}'`);
 assert.equal((await asUser(4,`SELECT count(*)::int AS n FROM public.chat_messages WHERE conversation_id='${chatConversationId}'`))[0].n,1);checks++;
 await denied(4,`SELECT * FROM public.send_chat_message('${id(3)}','Archived thread')`);
 await db.exec(`RESET ROLE; UPDATE student_assignments SET assignment_status='active' WHERE assignment_id='${id(30)}'`);
 await asUser(3,`SELECT * FROM public.send_chat_message('${id(4)}','Placement resumed')`);checks++;
 assert.equal((await asUser(4,`SELECT count(*)::int AS n FROM public.chat_messages WHERE conversation_id='${chatConversationId}'`))[0].n,2);checks++;
 await db.exec(`RESET ROLE; UPDATE users SET account_status='inactive' WHERE user_id='${id(4)}'`);
 assert.equal((await asUser(4,`SELECT count(*)::int AS n FROM public.chat_messages WHERE conversation_id='${chatConversationId}'`))[0].n,0);checks++;
 await denied(4,`SELECT * FROM public.send_chat_message('${id(3)}','Inactive coordinator')`);
 await db.exec(`RESET ROLE; UPDATE users SET account_status='active' WHERE user_id='${id(4)}'`);
 await db.query(`INSERT INTO attendance(attendance_id,student_id,assignment_id,attendance_date,time_in,time_out,verification_status,time_in_selfie_path,time_out_selfie_path) VALUES ('${id(70)}','${id(11)}','${id(30)}','2026-10-07','2026-10-07 08:00+08','2026-10-07 08:00+08','pending','${id(11)}/coordinator-exception.jpg','${id(11)}/coordinator-exception-out.jpg')`);
 await db.exec(`
   CREATE FUNCTION public.fail_test_attendance_exception_audit() RETURNS trigger
   LANGUAGE plpgsql AS $$ BEGIN
     IF NEW.action = 'ATTENDANCE_EXCEPTION_VERIFIED' THEN RAISE EXCEPTION 'synthetic audit failure'; END IF;
     RETURN NEW;
   END $$;
   CREATE TRIGGER fail_test_attendance_exception_audit BEFORE INSERT ON public.audit_logs
   FOR EACH ROW EXECUTE FUNCTION public.fail_test_attendance_exception_audit();
 `);
 await assert.rejects(() => asUser(4,`SELECT public.coordinator_decide_attendance_exception('${id(70)}','verified','Supervisor unavailable; evidence reviewed.')`),/synthetic audit failure/);checks++;
 await db.exec('RESET ROLE; DROP TRIGGER fail_test_attendance_exception_audit ON public.audit_logs; DROP FUNCTION public.fail_test_attendance_exception_audit()');
 assert.equal((await db.query(`SELECT verification_status FROM attendance WHERE attendance_date='2026-10-07'`)).rows[0].verification_status,'pending');checks++;
 await asUser(4,`SELECT public.coordinator_decide_attendance_exception('${id(70)}','verified','Supervisor unavailable; evidence reviewed.')`);checks++;
 const exceptionAudit=(await db.query(`SELECT actor_user_id, action, entity_id, details->>'override_reason' AS reason FROM audit_logs WHERE entity_id='${id(70)}'`)).rows[0];
 assert.deepEqual(exceptionAudit,{actor_user_id:id(4),action:'ATTENDANCE_EXCEPTION_VERIFIED',entity_id:id(70),reason:'Supervisor unavailable; evidence reviewed.'});checks++;
 assert.equal((await db.query(`SELECT verification_status FROM attendance WHERE attendance_date='2026-10-07'`)).rows[0].verification_status,'verified');checks++;
 await db.exec('RESET ROLE');
 await db.query(`DELETE FROM attendance WHERE attendance_id='${id(70)}'`);
 const icsAnnouncements=await asUser(5,"SELECT title FROM announcements ORDER BY title");
 assert.deepEqual(icsAnnouncements.map(row=>row.title),['Campus Notice','ICS Notice']);checks++;
 const att=status=>`INSERT INTO attendance(student_id,assignment_id,attendance_date,time_in,verification_status,time_in_selfie_path) VALUES ('${id(11)}','${id(30)}','2026-10-08','2026-10-08 08:00+08','${status}','${id(11)}/time-in.jpg')`;
 await denied(4,`UPDATE users SET role='Admin' WHERE user_id='${id(4)}'`);
 await denied(4,`UPDATE users SET account_status='active' WHERE user_id='${id(1)}'`);
 await denied(1,att('verified'));
 await asUser(1,att('pending'));checks++;
 await asUser(1,`UPDATE attendance SET time_out='2026-10-08 17:00+08',time_out_selfie_path='${id(11)}/out.jpg',time_out_lat=14.1,synced_at=now() WHERE student_id='${id(11)}'`);checks++;
 await denied(1,`UPDATE attendance SET time_in='2026-10-08 06:00+08' WHERE student_id='${id(11)}'`);
 await denied(1,`UPDATE attendance SET time_out='2026-10-08 19:00+08' WHERE student_id='${id(11)}'`);
 await asUser(3,`UPDATE attendance SET verification_status='verified' WHERE student_id='${id(11)}'`);checks++;
 await db.exec('RESET ROLE');
 const firstCredit=(await db.query("SELECT credited_hours FROM attendance WHERE attendance_date='2026-10-08'")).rows[0];
 assert.equal(Number(firstCredit.credited_hours),8);
 await db.exec('RESET ROLE');
 assert.equal(Number((await db.query("SELECT completed_hours FROM internship_progress WHERE student_id='"+id(11)+"'")).rows[0].completed_hours),8);checks++;
 await asUser(1,`INSERT INTO attendance(student_id,assignment_id,attendance_date,time_in,verification_status,time_in_selfie_path) VALUES ('${id(11)}','${id(30)}','2026-10-09','2026-10-09 12:30+08','pending','${id(11)}/partial.jpg')`);
 await asUser(1,`UPDATE attendance SET time_out='2026-10-09 13:30+08',time_out_selfie_path='${id(11)}/partial-out.jpg' WHERE attendance_date='2026-10-09'`);
 await asUser(3,`UPDATE attendance SET verification_status='verified' WHERE attendance_date='2026-10-09'`);
 await db.exec('RESET ROLE');
 assert.equal(Number((await db.query("SELECT credited_hours FROM attendance WHERE attendance_date='2026-10-09'")).rows[0].credited_hours),0.5);
 await asUser(1,`INSERT INTO attendance(student_id,assignment_id,attendance_date,time_in,verification_status,time_in_selfie_path) VALUES ('${id(11)}','${id(30)}','2026-10-12','2026-10-12 08:00+08','pending','${id(11)}/no-lunch.jpg')`);
 await asUser(1,`UPDATE attendance SET time_out='2026-10-12 11:00+08',time_out_selfie_path='${id(11)}/no-lunch-out.jpg' WHERE attendance_date='2026-10-12'`);
 await asUser(3,`UPDATE attendance SET verification_status='verified' WHERE attendance_date='2026-10-12'`);
 await db.exec('RESET ROLE');
 assert.equal(Number((await db.query("SELECT credited_hours FROM attendance WHERE attendance_date='2026-10-12'")).rows[0].credited_hours),3);
 await db.exec('RESET ROLE');
 assert.equal(Number((await db.query("SELECT completed_hours FROM internship_progress WHERE student_id='"+id(11)+"'")).rows[0].completed_hours),11.5);checks++;
  // Time Out invalidates an earlier decision because its evidence was not
  // available when the Supervisor first verified the record.
  await asUser(1,`INSERT INTO attendance(student_id,assignment_id,attendance_date,time_in,verification_status,time_in_selfie_path) VALUES ('${id(11)}','${id(30)}','2026-10-13','2026-10-13 08:00+08','pending','${id(11)}/early-verify.jpg')`);
  await asUser(3,`UPDATE attendance SET verification_status='verified' WHERE attendance_date='2026-10-13'`);
  await db.exec('RESET ROLE');
  assert.equal((await db.query("SELECT credited_hours FROM attendance WHERE attendance_date='2026-10-13'")).rows[0].credited_hours,null);
  await asUser(1,`UPDATE attendance SET time_out='2026-10-13 17:00+08',time_out_selfie_path='${id(11)}/late-timeout.jpg' WHERE attendance_date='2026-10-13'`);
  await db.exec('RESET ROLE');
  assert.equal((await db.query("SELECT verification_status FROM attendance WHERE attendance_date='2026-10-13'")).rows[0].verification_status,'pending');
  assert.equal((await db.query("SELECT credited_hours FROM attendance WHERE attendance_date='2026-10-13'")).rows[0].credited_hours,null);
  assert.equal(Number((await db.query("SELECT completed_hours FROM internship_progress WHERE student_id='"+id(11)+"'")).rows[0].completed_hours),11.5);
  await asUser(3,`UPDATE attendance SET verification_status='verified' WHERE attendance_date='2026-10-13'`);
  await db.exec('RESET ROLE');
  assert.equal(Number((await db.query("SELECT credited_hours FROM attendance WHERE attendance_date='2026-10-13'")).rows[0].credited_hours),8);
  assert.equal(Number((await db.query("SELECT completed_hours FROM internship_progress WHERE student_id='"+id(11)+"'")).rows[0].completed_hours),19.5);checks++;
 await denied(1,`INSERT INTO reports(student_id,report_type,file_path,status) VALUES ('${id(11)}','weekly_report','a.pdf','approved')`);
 await asUser(1,`INSERT INTO reports(student_id,report_type,file_path) VALUES ('${id(11)}','weekly_report','a.pdf')`);checks++;
 await asUser(1,`UPDATE reports SET status='approved' WHERE student_id='${id(11)}'`);
 const protectedReport=(await asUser(1,`SELECT status,remarks FROM reports WHERE student_id='${id(11)}'`))[0];
 assert.equal(protectedReport.status,'submitted');assert.equal(protectedReport.remarks,null);checks++;
 await asUser(1,`UPDATE reports SET remarks='self-approved' WHERE student_id='${id(11)}'`);
 const stillProtected=(await asUser(1,`SELECT status,remarks FROM reports WHERE student_id='${id(11)}'`))[0];
 assert.equal(stillProtected.status,'submitted');assert.equal(stillProtected.remarks,null);checks++;
 await denied(3,`UPDATE reports SET status='approved' WHERE student_id='${id(11)}'`);
 await asUser(3,`UPDATE reports SET supervisor_feedback='Reviewed',supervisor_endorsed_at=now() WHERE student_id='${id(11)}'`);checks++;
 await asUser(5,`UPDATE reports SET status='approved' WHERE student_id='${id(11)}'`);checks++;
 await denied(1,`INSERT INTO practicum_schedules(student_id,start_date,status) VALUES ('${id(11)}','2026-10-01','approved')`);
 await assert.rejects(()=>asUser(1,`INSERT INTO practicum_schedules(student_id,start_date) VALUES ('${id(11)}','2026-10-01')`));checks++;
 await asUser(1,`INSERT INTO practicum_schedules(student_id,start_date,lunch_break_start) VALUES ('${id(11)}','2026-10-01','12:00')`);checks++;
 await denied(1,`UPDATE practicum_schedules SET reviewed_by='${id(4)}' WHERE student_id='${id(11)}'`);
 await asUser(5,`UPDATE practicum_schedules SET status='approved',reviewed_by='${id(5)}' WHERE student_id='${id(11)}'`);checks++;
 const evaluation=(student,score)=>`INSERT INTO evaluations(student_id,supervisor_id,performance_score,feedback,evaluation_date) VALUES ('${id(student)}','${id(13)}',${score},'Synthetic','2026-10-08')`;
 await denied(3,evaluation(12,90));await denied(3,evaluation(11,101));
 await asUser(3,evaluation(11,90));checks++;
 await denied(3,`UPDATE evaluations SET student_id='${id(12)}' WHERE student_id='${id(11)}'`);
 await db.exec(`RESET ROLE; UPDATE users SET account_status='inactive' WHERE user_id='${id(1)}'`);
 await denied(1,`INSERT INTO reports(student_id,report_type,file_path) VALUES ('${id(11)}','weekly_report','b.pdf')`);
 await db.exec('RESET ROLE; SET ROLE anon');
 await assert.rejects(()=>db.exec("INSERT INTO storage.objects(bucket_id,name) VALUES ('private-documents','id-cards/test.jpg')"));checks++;
 await db.exec('RESET ROLE');
 await assert.rejects(()=>db.exec(`INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES ('${id(40)}','invalid@example.invalid','{"year_level":1,"course":"BSIT"}')`));checks++;
 await db.exec(`INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES ('${id(41)}','valid@example.invalid','{"year_level":4,"course":"BSIT","student_number":"VALID-TEST"}')`);checks++;
 await db.exec(`SET ROLE service_role; UPDATE users SET account_status='active' WHERE user_id='${id(41)}'`);checks++;
 await db.exec('RESET ROLE');
 await asUser(4,`INSERT INTO public.ojt_final_grades(student_id,final_grade,recorded_by_user_id) VALUES ('${id(11)}',4.00,'${id(4)}')`);checks++;
 assert.equal(Number((await db.query(`SELECT final_grade FROM public.ojt_final_grades WHERE student_id='${id(11)}'`)).rows[0].final_grade),4.00);checks++;
 await assert.rejects(()=>asUser(4,`INSERT INTO public.certificates(student_id,verification_code,hours_rendered,host_company_name,academic_year,issued_by_user_id) VALUES ('${id(11)}','TEST-COMPLETION-FAIL',486,'Synthetic HTE','2026-2027','${id(4)}')`),undefined,'failing-grade certificate insertion');checks++;
 await asUser(4,`UPDATE public.ojt_final_grades SET final_grade=3.00 WHERE student_id='${id(11)}'`);checks++;
 await asUser(4,`INSERT INTO public.certificates(student_id,verification_code,hours_rendered,host_company_name,academic_year,issued_by_user_id) VALUES ('${id(11)}','TEST-COMPLETION-1',486,'Synthetic HTE','2026-2027','${id(4)}')`);checks++;
 assert.equal(Number((await db.query(`SELECT final_grade FROM public.ojt_final_grades WHERE student_id='${id(11)}'`)).rows[0].final_grade),3.00);checks++;
 await assert.rejects(()=>asUser(4,`INSERT INTO public.ojt_final_grades(student_id,final_grade,recorded_by_user_id) VALUES ('${id(11)}',5.01,'${id(4)}')`),undefined,'grade range check');checks++;
 await assert.rejects(()=>asUser(4,`INSERT INTO public.certificates(student_id,verification_code,hours_rendered,host_company_name,academic_year,issued_by_user_id) VALUES ('${id(11)}','TEST-COMPLETION-DUPLICATE',486,'Synthetic HTE','2026-2027','${id(4)}')`),undefined,'duplicate certificate prevention');checks++;
 assert.equal((await asUser(1,`SELECT count(*)::int AS n FROM public.ojt_final_grades WHERE student_id='${id(11)}'`))[0].n,1);checks++;
 assert.equal((await asUser(2,`SELECT count(*)::int AS n FROM public.ojt_final_grades WHERE student_id='${id(11)}'`))[0].n,0);checks++;
 assert.equal((await asUser(3,`SELECT count(*)::int AS n FROM public.ojt_final_grades`))[0].n,0);checks++;
 await db.exec('RESET ROLE');
 for (const sql of [
   `UPDATE public.attendance SET updated_at=now() WHERE student_id='${id(11)}'`,
   `UPDATE public.reports SET remarks='changed' WHERE student_id='${id(11)}'`,
   `UPDATE public.evaluations SET feedback='changed' WHERE student_id='${id(11)}'`,
   `UPDATE public.internship_progress SET completed_hours=completed_hours WHERE student_id='${id(11)}'`,
   `UPDATE public.practicum_schedules SET coordinator_feedback='changed' WHERE student_id='${id(11)}'`,
   `UPDATE public.student_assignments SET assignment_status=assignment_status WHERE student_id='${id(11)}'`,
   `INSERT INTO public.evaluation_appeals(student_id) VALUES ('${id(11)}')`,
   `UPDATE public.ojt_final_grades SET final_grade=2.00 WHERE student_id='${id(11)}'`,
 ]) { await assert.rejects(()=>db.query(sql),undefined,sql); checks++; }
 await denied(4,`DELETE FROM public.certificates WHERE student_id='${id(11)}'`);
 await db.exec('RESET ROLE');
 await db.query(`UPDATE public.certificates SET status='revoked',revocation_reason='Synthetic test' WHERE student_id='${id(11)}'`);
 await db.exec('RESET ROLE');
 await assert.rejects(()=>db.query(`UPDATE public.reports SET remarks='still locked' WHERE student_id='${id(11)}'`));checks++;
 await asUser(2,`INSERT INTO reports(student_id,report_type,file_path) VALUES ('${id(12)}','weekly_report','unfinalized.pdf')`);checks++;
 console.log('PASS: final grades are constrained to 1.00–5.00; only 1.00–3.00 can finalize, and completion locks academic records.');
 console.log('PASS: '+checks+' migration/write-boundary checks using the repository migration chain and synthetic Auth/Storage. No remote database.');
 await db.close();
}
main().catch(error=>{console.error(error.message);process.exitCode=1});
