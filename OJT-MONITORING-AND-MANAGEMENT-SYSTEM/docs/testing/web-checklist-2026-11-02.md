y# Web checklist run, 2026-11-02

Written for: the project owner, who asked for the web-testable parts of the test checklist to be run before testing by hand.

Branch: loop/integration (working tree as of 2026-11-02). **Local stack only**: Supabase 127.0.0.1:57321 (container set cdm-ojt-test-local). Nothing was run against the linked CDM-OJT project, staging, or any remote. SMTP settings were blanked for the test web server, so no real email could be sent.
Method: Playwright (Chromium, 1366px) for UI flows, plus direct API / PostgREST / RPC calls with each role's own token for server-side guards. Throwaway accounts `qa-w-*@local.test` (password in the scratchpad only), company "QA-W Company". No source code was changed; no git commands were run.

## Read this first: the local web container is stale
`cdm-ojt-local-web-1` (http://localhost:3000) was built **2026-10-28 12:28**, but the web source files were last changed **2026-10-29 11:57**. The running container shows an older UI (for example the supervisor attendance page has no search box, and the coordinator attendance page is the old list rather than Timecard / Exceptions tabs). So the UI checks were run against a **fresh dev server started from the current source on port 3100** (same local Supabase, now stopped). The attendance API checks were run on both builds with the same result. **Rebuild the :3000 container before you test by hand**, or you will test old code.

## Result
129 checks run: **127 pass, 2 fail**, 0 skipped. Mobile-only and MFA items are listed at the end as "needs human" (not counted).

Failures:
1. **Attendance on a holiday is accepted.** A global non-working day (2026-10-29) was added, then a student timed in on it: HTTP 200, record pending. The attendance API has no non-working-day check, so a holiday punch reaches the supervisor and the coordinator's "Exceptions to review" list. Decide whether this should be refused or just flagged.
2. **The student is never notified of an attendance decision.** After a supervisor verified one record and disputed another, the student had 0 notifications. Your checklist item "attendance decision notification" does not work as written (the student would have to open the app to see the status).

## Retest of the five failures from 2026-10-23 (verify-coordinator-records.md)
| Check | Result | Evidence |
|---|---|---|
| #1 Coordinator direct PATCH of attendance (no reason, no audit) is blocked | **pass** | rows updated=0 err= row still pending; audit rows added=0 |
| #5 Unread count is updated when recipient opens thread | **pass** | ChatWorkspace still calls `mark_chat_read`; visible sender read receipts were removed as low-priority polish |
| #4 Coordinator has a page listing submitted supervisor evaluations | **pass** | page /coordinator/supervisor-evaluations shows STUF=true rows=3 |
| #3 Student can submit a final_report (clearance report type exists) | **pass** | http 200  [run on :3000 container build] |
| #2 Coordinator can not issue grade/certificate for a student who has not met clearance (direct API) | **pass** | grade rows=0 err=Student has not met all OJT clearance requirements; certificate rows=0 err=A passing final OJT grade (1.00–3.00) is required before completion [run on :3000 container build] |

All five are fixed in the current source. Note the `:3000` container was not retested for #4 and #5 because its UI is older.

## Results by checklist section
### 1 Accounts and sign-in (web UI)
| Check | Result | Evidence |
|---|---|---|
| Coordinator signs in and lands on /dashboard | **pass** | /dashboard |
| Supervisor signs in and lands on supervisor area | **pass** | /dashboard |
| Student account is not usable on the web dashboard | **pass** | /auth/sign-in?reason=mobile_only \| OFFICIAL PRACTICUM PORTAL Colegio de Montalban Institute of Computing Studies â€¢ Institute of Busines |
| Pending student sign-in does not reach the dashboard | **pass** | /auth/sign-in \| OFFICIAL PRACTICUM PORTAL Colegio de Montalban Institute of Computing Studies â€¢ Institute of Busines |
| Wrong password shows an error and stays on sign-in | **pass** | /auth/sign-in \| credentials to access your portal |
| Super Admin signs in and lands on /admin (after redirect settles) | **pass** | sign-in settles at /admin; dashboard hop is a redirect |
| Deactivated supervisor can not use the web app | **pass** | landed /auth/sign-in |
| Deactivated supervisor sees no attendance data through the API | **pass** | rows visible=0 |
| Super Admin signs in and lands on /admin | **pass** | /admin [run on :3000 container build] |

### 1/10 Role boundaries (web routes)
| Check | Result | Evidence |
|---|---|---|
| sup1 opening /coordinator/attendance is redirected or denied | **pass** | landed /dashboard \| Skip to main content Colegio de Montalban OJT PRACTICUM PORTAL My Students Atten |
| sup1 opening /admin is redirected or denied | **pass** | landed /dashboard?reason=unauthorized \| Skip to main content Colegio de Montalban OJT PRACTICUM PORTAL My Students Atten |
| coord-ics opening /supervisor/attendance is redirected or denied | **pass** | landed /dashboard?reason=unauthorized \| Skip to main content Colegio de Montalban OJT PRACTICUM PORTAL Dashboard STUDENT |
| coord-ics opening /admin is redirected or denied | **pass** | landed /dashboard?reason=unauthorized \| Skip to main content Colegio de Montalban OJT PRACTICUM PORTAL Dashboard STUDENT |
| admin opening /supervisor/students is redirected or denied | **pass** | landed /dashboard?reason=unauthorized \| Skip to main content Colegio de Montalban OJT PRACTICUM PORTAL Administration Us |
| Anonymous opening /dashboard is sent to sign-in | **pass** | /auth/sign-in |
| Anonymous opening /supervisor/attendance is sent to sign-in | **pass** | /auth/sign-in |
| Anonymous opening /coordinator/attendance is sent to sign-in | **pass** | /auth/sign-in |
| Anonymous opening /admin is sent to sign-in | **pass** | /auth/sign-in |
| admin opening /coordinator/attendance is redirected or denied | **pass** | chain: /coordinator/attendance -> /dashboard -> /admin |

### 2/3 Calendar
| Check | Result | Evidence |
|---|---|---|
| Coordinator adds a holiday on the Holidays & Days Off page | **pass** | [{"day_date":"2026-11-11","label":"QA-W holiday UI","scope":"department"}] |
| Time-in on a global non-working day (holiday) is refused/handled by the attendance API | **fail** | nwd insert=ok; http 200 {"attendance_id":"1e8db607-5ae9-4d17-9da7-61c21f2cec85"} [run on :3000 container build] |

### 3 Attendance (server API)
| Check | Result | Evidence |
|---|---|---|
| Time in inside geofence -> pending row, location verified, on_time | **pass** | http 200 "" status=pending loc=verified late=on_time dist=0 |
| Server receipt time recorded and differs from client time (clock can not be faked) | **pass** | time_in=2026-10-19T00:05:00+00:00 received=2026-11-02T08:49:31.039+00:00 |
| Duplicate time-in same day is refused | **pass** | http 409 You already have an attendance record for today. |
| Time in outside geofence is flagged (not silently verified) | **pass** | http 200 loc=flagged_out_of_bounds dist=1112 reason=Outside the designated workplace geofence. |
| Late time-in (08:40 PH, cutoff 08:15) marked late | **pass** | http 200 late=late |
| GPS unavailable -> location_unavailable flagged with reason | **pass** | http 200 loc=location_unavailable reason=GPS location unavailable. |
| Future-dated time-in refused | **pass** | http 400 Attendance cannot be recorded for a future date or time. |
| Weekend time-in refused | **pass** | http 400 Attendance is only recorded on weekdays. |
| Time-in before assignment start date refused | **pass** | http 403 No company assignment covers this attendance date. |
| Using another student's assignment_id refused | **pass** | http 403 No company assignment covers this attendance date. |
| Using another student's selfie path refused | **pass** | http 400 Time In details are invalid. |
| Time-out without a time-in is refused (404) | **pass** | http 404 Record Time In before Time Out. |
| Time-out earlier than time-in refused | **pass** | http 400 Time Out cannot be earlier than Time In. |
| Time-out recorded; row stays pending for supervisor | **pass** | http 200 time_out=2026-10-19T09:00:00+00:00 status=pending |
| Second time-out refused | **pass** | http 409 Time Out has already been recorded for today. |
| Attendance API rejects a pending student token | **pass** | http 403 |
| Attendance API rejects a supervisor token | **pass** | http 403 |
| Attendance API rejects a coordinator token | **pass** | http 403 |
| Attendance API rejects a admin token | **pass** | http 403 |
| Attendance API rejects a request with no token | **pass** | http 401 |

### 3 Attendance (supervisor UI)
| Check | Result | Evidence |
|---|---|---|
| Supervisor 1 list shows only own students (A, D, F), never B | **pass** | rows=10 |
| Search by name/number narrows the list | **pass** | rows=2 |
| Review modal loads selfie evidence images | **pass** | loaded images=3 |
| Supervisor verifies a record; DB shows verified + credited hours | **pass** | status=verified credited=8.916666666666666 |
| Supervisor disputes a record -> rejected (note: no reason is asked) | **pass** | status=rejected |
| Status filter "Rejected" lists disputed records | **pass** | rows=2 |
| Batch "Verify clean logs" verifies clean pending records | **pass** | stud 10-19=verified, stuf 10-19=verified, stuf 10-26=verified |
| Batch verify leaves flagged (out-of-geofence) record pending | **pass** | stua 10-20=pending |
| Supervisor 2 list shows only own student (B) | **pass** | rows=3 |
| Review modal shows selfie evidence images for time-in/out | **pass** | loaded images=3 [run on :3000 container build] |
| Supervisor verifies a record; DB shows verified with credited hours | **pass** | status=verified credited_hours=8.916666666666666 [run on :3000 container build] |

### 3 Attendance (coordinator UI)
| Check | Result | Evidence |
|---|---|---|
| Coordinator timecard lists ICS students (QA W STUA) and not IBE student (STUD) | **pass** | has STUA=true has STUD=false err= |
| Selecting a student offers a timecard CSV download | **pass** | download buttons=1 |

### 3/10 Access boundaries (RLS, direct API)
| Check | Result | Evidence |
|---|---|---|
| Supervisor 1 sees attendance of own students (A, D, F) and not Supervisor 2's student (B) | **pass** | visible students: stua,stud,stuf |
| Supervisor 2 sees only own student (B) | **pass** | rows=3 |
| Supervisor 2 can not verify Supervisor 1's student by direct API call | **pass** | rows updated=0 err= |
| Supervisor 1 can not verify Supervisor 2's student by direct API call | **pass** | rows updated=0 err= |
| Student can not self-verify own attendance by direct API call | **pass** | rows updated=0 err= |
| Student can not insert attendance rows directly (must use the API) | **pass** | inserted=0 err=Attendance date must match time-in in Asia/Manila |
| Student B can read only own attendance (not Student A's) | **pass** | rows=3 |
| Student B can not read other students' assignments | **pass** | rows=1 |
| ICS coordinator sees ICS students' attendance (A) and NOT IBE student D | **pass** | A=true D=false |
| IBE coordinator sees IBE student D and NOT ICS student A | **pass** | A=false D=true |
| IBE coordinator can not change an ICS student's attendance | **pass** | rows=0 err= |
| Super Admin has no routine read access to attendance | **pass** | visible rows=0 err= |
| Super Admin has no routine read access to students | **pass** | visible rows=0 err= |
| Super Admin has no routine read access to reports | **pass** | visible rows=0 err= |
| Super Admin has no routine read access to evaluations | **pass** | visible rows=0 err= |
| Super Admin has no routine read access to chat_messages | **pass** | visible rows=0 err= |

### 5 Documents and reports
| Check | Result | Evidence |
|---|---|---|
| Coordinator approves orientation + endorsement (API with coordinator token) | **pass** | approved 2/2  |
| Supervisor can not approve gateway documents (coordinator-only) | **pass** | rows=0 err= |
| Student submits final_report and coordinator approves it (clearance report path exists end-to-end) | **pass** | submit http 200 ; approve rows=1  |
| Student submits Pre-OJT Orientation Certificate (link) | **pass** | http 200  [run on :3000 container build] |
| Student submits Endorsement Letter (link) | **pass** | http 200  [run on :3000 container build] |
| Student submits Daily Journal (goes to supervisor review) | **pass** | http 200  [run on :3000 container build] |
| Unknown report type refused | **pass** | http 400 [run on :3000 container build] |
| Non-HTTPS link refused | **pass** | http 403 [run on :3000 container build] |
| Document path owned by someone else refused | **pass** | http 403 [run on :3000 container build] |
| Report API without token refused | **pass** | http 401 [run on :3000 container build] |
| Supervisor 1 (assigned) sees Student A's reports | **pass** | types=Daily Journal [run on :3000 container build] |
| Supervisor 2, Student B, IBE coordinator and Admin do NOT see Student A's reports | **pass** | sup2=0 stub=0 ibe=0 admin=0 [run on :3000 container build] |
| ICS coordinator sees Student A's reports | **pass** | types=Pre-OJT Orientation Certificate\|Daily Journal\|Endorsement Letter\|final_report [run on :3000 container build] |

### 6 Schedule
| Check | Result | Evidence |
|---|---|---|
| Student proposes a schedule once gateway documents are approved | **pass** | http 200  |
| Remote schedule with no end date is refused | **pass** | http 400 Remote and hybrid schedules need an end date for coordinator review. |
| Coordinator approves the schedule proposal | **pass** | rows=1 err= |
| Supervisor 2 can not see Student A's schedule | **pass** | rows=0 |
| Schedule proposal blocked until orientation + endorsement are approved | **pass** | http 400 Cannot propose practicum schedule: approved pre-deployment documents are required. Missing: Pre-OJT Orientation Certificate, Endorsement Letter. [run on :3000 container build] |

### 7 Evaluations
| Check | Result | Evidence |
|---|---|---|
| Supervisor submits midterm and final evaluations for an assigned student | **pass** | midterm=1 final=1 |
| Supervisor 2 can not evaluate a student assigned to Supervisor 1 | **pass** | rows=0 err=new row violates row-level security policy "supervisor_evaluation_boundary" for table "evaluations" |
| Coordinator can read submitted evaluations of in-scope student (data for Supervisor Evaluations page) | **pass** | rows=2 |
| Student can read own evaluation | **pass** | rows=2 |
| Student files an appeal on own evaluation | **pass** | rows=1 err= |
| Student A can not appeal Student B's evaluation | **pass** | rows=0 err=Evaluation does not belong to this student |
| Coordinator decides (upholds) the appeal | **pass** | rows=1 err= |

### 8 Notifications and incidents
| Check | Result | Evidence |
|---|---|---|
| Student is notified when a supervisor verifies/rejects attendance | **fail** | notifications for Student A after 1 verify + 1 reject = 0 |
| Coordinator (ICS) incident page lists the ICS student's incident | **pass** | has STUA=true |
| IBE coordinator does NOT see the ICS student's incident | **pass** | has STUA=false |
| Student files an incident report | **pass** | http 200  [run on :3000 container build] |
| Incident report validates category and length | **pass** | http 400 [run on :3000 container build] |
| Incident visibility: only the student and in-scope coordinator (supervisors, other dept, admin see none) | **pass** | {"stua":1,"stub":0,"sup1":0,"sup2":0,"coord-ics":1,"coord-ibe":0,"admin":0} [run on :3000 container build] |
| Student requests a new HTE/company (unassigned student) | **pass** | http 200  [run on :3000 container build] |
| Student with an active placement can not file a company request | **pass** | http 409 You already have an active placement. Ask your coordinator if you need to change it. (rate limiter answered 429 for the first attempt; 409 expected otherwise) [run on :3000 container build] |

### 8 Chat and notifications
| Check | Result | Evidence |
|---|---|---|
| Coordinator chat contacts include assigned supervisors (RPC list_chat_contacts) | **pass** | contacts=17 err= |
| Coordinator sends a message to a supervisor (RPC) | **pass** | ok |
| Supervisor receives a chat notification | **pass** | New chat message from QA W Coord ICS |
| Supervisor can read the message | **pass** | rows=1 |
| Supervisor 2 can not read the thread | **pass** | rows=0 |
| Supervisor 2 can not mark the thread read | **pass** | Conversation unavailable |
| Student can not use staff chat | **pass** | Invalid chat message or participant |
| Admin can not use staff chat | **pass** | Invalid chat message or participant |
| Coordinator can only chat with supervisors of their own department/students | **pass** | IBE coordinator -> Supervisor 1 (who also supervises IBE student D): allowed |
| Supervisor gets a chat notification | **pass** | chat notifications=2 |
| Supervisor 2 can not read the Coordinator<->Supervisor 1 thread | **pass** | visible messages for sup2=0 |
| Coordinator sends a chat message from the web UI | **pass** | message visible in thread=true; errs= |

### 9 Completion and read-only
| Check | Result | Evidence |
|---|---|---|
| Coordinator records final grade once hours + final report + evaluations are met | **pass** | hours=18/8 rows=1 err= |
| Certificate is issued after grade | **pass** | rows=1 err= |
| Public /verify-certificate/<code> shows authentic; bogus code is not found | **pass** | http 200 authentic=true |
| After completion the supervisor can not change attendance | **pass** | rows=0 err=Only pending attendance verification may be changed |
| After completion the student can not submit reports (read-only) | **pass** | http 409 Your OJT is completed. Academic records are read-only. |
| Finalized grade can not be changed | **pass** | rows=0 err=A finalized OJT grade cannot be changed |

### 10 Security negatives
| Check | Result | Evidence |
|---|---|---|
| Student token refused on POST /api/supervisor/pack | **pass** | http 403 [run on :3000 container build] |
| Anonymous refused on POST /api/supervisor/pack | **pass** | http 403 [run on :3000 container build] |

## Observations (not failures, but worth knowing before you test by hand)
- **Dispute has no reason.** "Mark Disputed" rejects the record immediately with no reason field, and the student is not told why (and, per failure 2, not told at all).
- **A day with no time-out can be verified.** The batch "Verify clean logs" verified two records that had a time-in but no time-out; both got `credited_hours = null` (no hours). Check this is what you want.
- **Credited hours.** A record from 08:05 to 17:00 credited 8.92 h for a schedule of 8 h/day with a 60-minute lunch (the test schedule had no lunch start time, so no lunch was deducted and the day was not capped).
- **Supervisors get no notification** when a student submits a Daily Journal or a time-in (the notify trigger deliberately skips journals; nothing exists for attendance). Coordinators are notified for gateway documents, final reports and incident reports.
- **Chat: pressing Enter does not send.** The Send button works. Unread counts update when a conversation is opened.
- **Rate limit looks per-IP.** A second student's request from the same machine got HTTP 429 on the company-request route after a first student's request. Fine for production; it can confuse repeated local testing.
- **Admin console asks for multi-factor verification** ("Super Admin multi-factor verification"), so admin actions were not exercised.
- The coordinator "Exceptions to review" list showed the holiday punch (see failure 1).

## What the user must test by hand (needs human)
Mobile app on a dev build (Expo Go will not work):
1. Face detection on the selfie: a photo with no face is rejected; a real face passes.
2. Real GPS: inside the geofence (30–50 m) verified, outside flagged. The server logic was tested with supplied coordinates only.
3. Offline: airplane mode, time in, reconnect; one row appears, no duplicate, the "queued" toast shows.
4. Auto time-out after forgetting to time out (the job runs server-side; I did not trigger it).
5. Student registration with ID card front/back photos, the pending screen, resubmission after rejection, and student password recovery link.
6. Student views in the app: status of verified / rejected attendance, progress hours, appeal screen, schedule proposal screen, push notifications.
Web items I could not drive:
7. Super Admin console (needs MFA): create a coordinator, activate or deactivate accounts, audit log.
8. Supervisor invite link: create, use once, reuse fails, expired fails (Coordinator > Supervisors > "Create link").
9. Email delivery: staff invite, password reset, and queued notification emails (check the local mailbox at http://localhost:57324). The test server had SMTP blanked.
10. Coordinator screens I only checked through data/API, not by clicking: document review feed (approve/reject documents), schedule proposals tab, final grade and certificate modal on Progress, and the HTE request decision.
11. Print/PDF output and the department report CSV contents.

## Data created in the local database
Accounts qa-w-admin, qa-w-coord-ics, qa-w-coord-ibe, qa-w-sup1, qa-w-sup2, qa-w-stua/stub/stuc/stud/stup/stuf (@local.test), company "QA-W Company" with one branch and work schedules, attendance rows on 2026-10-19 to 10-29, reports, one schedule, three evaluations and appeals, chat messages, two non-working days (2026-10-29 global, 2026-11-11 ICS), one incident report and one HTE request. Student F is **finalized** (grade 1.75, certificate CDM-OJT-2026-QAWF0001) and now read-only; student C received a certificate attempt that was refused. Nothing was deleted. Two files of ID-card images are in storage `private-documents/id-cards/`.
