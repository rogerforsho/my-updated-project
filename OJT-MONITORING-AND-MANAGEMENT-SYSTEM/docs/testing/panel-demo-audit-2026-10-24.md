# Panel demonstration audit

Date: 24 October 2026, Asia/Singapore

**Follow-up:** All seven findings were subsequently addressed locally. See [fixes and verification](panel-demo-fixes-2026-10-24.md). The findings and counts below preserve the original before-fix audit.

What this repo does: The system supports student OJT attendance and reporting, Supervisor review, and department Coordinator monitoring. Super Admin manages account access and settings. This audit assumes a single local panel presentation, using the existing Super Admin and the five prepared demo identities.

**Verdict: Fix mobile attendance and the demo evidence before presenting.** Account access, MFA, role boundaries, ordinary report review, attendance verification, and completion protection passed the checks described below. A valid mobile time-in did not reach persistence.

This is a workflow audit against the panel guide, not a certification or a complete repository security review. Security-related features were evaluated. No application fixes or database permission changes were applied.

## Results at a glance

| Check group | Result | What this means |
| --- | --- | --- |
| Live local HTTP and database assertions | 88 passed and 8 failed across 96 checks | Eight failures represent six distinct live defects, including fixture defects |
| Existing Node test suite | 130 passed and 1 failed across 131 tests | Preview configuration contradicts its environment safety test |
| Additional repository check scripts | All 15 passed | Run individually because the main test command stops after its first failing stage |
| Web TypeScript | Passed | No reported type errors |
| Mobile TypeScript | Passed | No reported type errors |
| Web ESLint | Passed with 38 warnings | Zero errors; warnings were not counted as functional bugs |
| Browser interaction and appearance | Not tested | No browser surface was available; opening the in-app browser returned “Browser is not available” |
| Physical phone behavior | Not tested | Camera, face detection, GPS hardware, permissions, mirroring and offline sync need a device rehearsal |

The live checks used the running application at `http://127.0.0.1:3000` and the local backend at `http://127.0.0.1:57321`. Server actions were invoked over HTTP using identifiers from the JavaScript actually served by the running application. An HTTP render check proves the route responds; it does not prove its buttons or layout work in a browser.

The source tree contains existing uncommitted changes. Source pointers below identify related current code; this audit did not establish that every working-tree edit is in the running build. Initial test-harness discovery and argument mistakes were corrected and excluded from the final failure count.

## Must fix before the demonstration

### 1 Valid mobile attendance fails because the backend cannot read branches

**Priority:** P1. **Type:** Application and local database integration. **Evidence:** `ATTENDANCE-VALID-IN`, `SERVICE-BRANCH-READ`, `ATTENDANCE-POLICY-REPRO`, `CO-BRANCH-CONTROL`.

**What this is:** The attendance endpoint loads the assigned branch to determine the workplace location policy.

**Problem:** Student A has an active placement covering 22 October 2026, an approved schedule, valid coordinates and a successfully uploaded JPEG. Time-in returns HTTP 403 with “No company assignment covers this attendance date.” Independently, the same backend client receives PostgreSQL error `42501`, “permission denied for table company_branches.” The Coordinator can read the same branch.

**Reproduce:** Sign in as Student A; request a selfie upload slot, upload a valid JPEG, then POST a time-in to `/api/mobile/attendance` for `2026-10-22T08:00:00+08:00` using Student A's prepared assignment and coordinates `14.7315, 121.1394`. A direct service-account SELECT on the assignment's branch reproduces the underlying permission error without the upload flow.

**Source:** `apps/web/app/api/mobile/attendance/route.ts:55` reads `company_branches` using the service client. Line 58 treats a database error as no policy; line 186 reports no matching assignment. `supabase/migrations/20261020230000_hte_branches_and_requests.sql:160` grants branch reads to `authenticated`, but does not grant the read needed by this service-account path.

**Fix:** Add the narrowly required `service_role` SELECT grant in a forward migration, retaining RLS and the endpoint's ownership checks. Return a service error for a failed policy query and reserve “no assignment” for an actual missing placement. Check for the same table privilege gap in other backend branch consumers.

**Verify the fix:** The identical request must create one pending attendance record. Repeat it to confirm duplicate prevention. Then test time-out, Supervisor verification, credited hours, outside-location evidence, and offline replay through the real endpoint. Keep an integration test that uses the deployed role privileges, not only mocked query results.

**If we skip it:** The central mobile attendance demonstration fails even with correct location and placement data. Successful mocked tests and direct fixture inserts do not catch it.

### 2 Prepared report attachments cannot be opened

**Priority:** P1 for demo readiness. **Type:** Demo fixture defect introduced during account preparation. **Evidence:** `CO-FIXTURE-DOCUMENT`, `SV-FIXTURE-DOCUMENT`.

**What this is:** The prepared gateway documents and Daily Journal have stored attachments intended for staff review.

**Problem:** The fixture uses `documents/<student_id>/panel-demo-evidence.docx`. The application's document ownership rule accepts paths beginning with that student's user ID or student ID. Both the Coordinator and Supervisor receive `FORBIDDEN` with “Document path does not belong to this student.” A fresh upload through the normal mobile endpoint was successfully submitted and approved, so this failure is specific to the prepared evidence.

**Reproduce:** As Coordinator, open Student A's Endorsement Letter attachment. As Supervisor, open Student A's prepared Daily Journal attachment.

**Source:** `artifacts/create-panel-local.cjs:58` constructs the incompatible fixture path. `apps/web/src/services/storage.ts:94` enforces the ownership prefix.

**Fix:** Make the fixture use the same upload and ownership path convention as ordinary submissions. Correct Student A's disposable fixtures and rebuild the completed example with valid paths before finalization. Do not relax document ownership checks or disable completion locks to accommodate bad test data.

**Verify the fix:** Open the actual approved gateway documents and daily report through their normal staff actions and download each signed attachment. Include a fixture self-check using `getSignedDocumentUrl`, not just a Storage existence check.

**If we skip it:** The panel sees approved reports whose evidence cannot be opened. The earlier guide's fixture readiness claims were too broad.

### 3 Prepared attendance photos are in the wrong Storage bucket

**Priority:** P1 for demo readiness. **Type:** Demo fixture defect introduced during account preparation. **Evidence:** `SV-FIXTURE-SELFIE`.

**What this is:** Supervisors need to open the photo evidence on a prepared attendance entry.

**Problem:** The seeded attendance points at the demo ID image paths. Those objects exist in `private-documents`, while the attendance viewer signs them from `attendance-selfies`. The viewer returns “Failed to retrieve selfie.”

**Reproduce:** As Supervisor, open the photo on Student A's prepared historical attendance entry.

**Source:** `artifacts/create-panel-local.cjs:68` reuses `a.front` and `a.back` as attendance photo paths. `apps/web/src/services/attendance.ts:220` correctly uses the attendance selfie bucket.

**Fix:** Store clearly labeled synthetic attendance images in `attendance-selfies` at the paths referenced by the demo records. Keep student ID evidence separate. Prefer normal student-owned attendance upload paths when rebuilding fixtures.

**Verify the fix:** Invoke `getSelfieUrl` as the assigned Supervisor, then fetch the signed URL and confirm it returns an image. Repeat for time-in and time-out.

**If we skip it:** Historical hours can be displayed, but the evidence review part of the attendance demonstration fails.

## Should fix

### 4 Student B has no stored back ID path

**Priority:** P2. **Type:** Demo fixture defect introduced during account preparation. **Evidence:** `CO-ID-BOTH`.

**What this is:** Coordinator registration review is supposed to display both sides of the submitted student ID.

**Problem:** Both synthetic files were uploaded, but Student B's public student row has no `id_card_back_path`. The real pending-student action returns a front preview and a null back preview. Supplying the paths in Auth metadata did not establish all public student fields in this local environment.

**Reproduce:** Open Student B in Coordinator approvals. Inspect the two preview fields and the public student row.

**Source:** `artifacts/create-panel-local.cjs:31` supplies metadata; line 39 updates the public student fields without explicitly persisting front and back paths. `apps/web/src/services/auth/account-review.ts:55` reads those public fields for the previews.

**Fix:** Explicitly persist and verify both ID paths when preparing the local fixture. This result alone does not prove ordinary registration is broken; a fresh real registration was not performed.

**Verify the fix:** The pending-student action must return two working signed image links before the student is approved.

**If we skip it:** The panel can question why the identity review is missing half of the submitted evidence.

### 5 Mobile schedule proposals bypass the gateway check used by the web service

**Priority:** P2. **Type:** Application workflow inconsistency. **Evidence:** `MOBILE-GATEWAY-POLICY`.

**What this is:** Approved pre-deployment documents are required before proposing a practicum schedule in the web service.

**Problem:** With Student B temporarily active and zero submitted gateway reports, the mobile schedule endpoint returned HTTP 200 and persisted a pending proposal. The web service would reject that student. The temporary proposal was removed and Student B was restored to pending after this test.

**Reproduce:** Use an active student with no approved Orientation Certificate or Endorsement Letter. POST a valid weekday schedule to `/api/mobile/schedule-proposals`. It saves a pending proposal instead of returning the gateway explanation.

**Source:** `apps/web/src/services/schedule.ts:57` calls `checkStudentGatewayStatus`. `apps/web/app/api/mobile/schedule-proposals/route.ts:61` checks the active role, then reaches persistence at line 93 without the corresponding gateway requirement.

**Fix:** Apply the same prerequisite at the mobile entry point using shared existing policy. Keep the Coordinator's independent placement and approval guards. If early proposals are intended, first make an explicit product decision and align both paths and the guide.

**Verify the fix:** Zero or one approved gateway document must produce the same actionable rejection as the web service; both approved documents must allow a valid proposal. This test did not show unauthorized deployment or approval.

**If we skip it:** A mobile student can enter a workflow the web service says is unavailable, and Coordinators receive premature proposals.

### 6 Completed students receive a retryable server error for a permanently closed record

**Priority:** P2. **Type:** Application error handling. **Evidence:** `COMPLETE-API-REPORT`, with `COMPLETE-IMMUTABLE` and `COMPLETE-RECORD-WRITE` passing.

**What this is:** Completion correctly makes academic records read-only.

**Problem:** Student C can still reach report submission at the API level. A well-formed new report link is rejected by the database completion protection, but the endpoint returns HTTP 503 `SERVER_FAILURE`, “Failed to submit report document.” The actual cause is a closed record, not a temporary outage. No completed report was changed.

**Reproduce:** As Student C, POST `Daily Journal` with a valid HTTPS link to `/api/mobile/reports`.

**Source:** `apps/web/app/api/mobile/reports/route.ts:79` maps an unsuccessful insert to a generic 503. Completion protection is implemented in `supabase/migrations/20261021000100_coordinator_final_grade_and_completion_freeze.sql`.

**Fix:** Return an explicit completed-record error such as 403 or 409, with an explanation that new academic submissions are closed. Retain the database guard. Disable the corresponding submission control in the mobile UI where appropriate.

**Verify the fix:** Repeating the submission returns a stable completed-record explanation and creates no report. Confirm no upload or existing evidence is accidentally removed during the rejected attempt.

**If we skip it:** Students may keep retrying an operation that can never succeed, and the panel may interpret a correct completion lock as an outage.

### 7 Preview mobile builds are tied to one private network address

**Priority:** P2. **Type:** Build configuration and failed regression test.

**What this is:** The preview APK is a likely artifact for the presentation phone.

**Problem:** `eas.json` hardcodes both the portal and backend to `192.168.1.9`. The existing safety test expects the preview environment to supply the backend URL, so `npm test` exits with one failed test. That private address will not be reachable from an arbitrary phone network or a hosted iOS simulator. Reachability from the actual presentation phone was not tested.

**Reproduce:** Run `node --test scripts/mobile-target-safety.test.cjs`. The preview configuration test fails because `EXPO_PUBLIC_SUPABASE_URL` is `http://192.168.1.9:57321` instead of being absent from the inline profile.

**Source:** `apps/mobile/eas.json:22` and line 23; `scripts/mobile-target-safety.test.cjs:79`. `appetize-ios` inherits this preview profile.

**Fix:** Supply the backend and portal through the appropriate preview environment, keeping local LAN rehearsal configuration separate from a shareable preview build. Confirm that both URLs point to the same environment. Do not remove the safety assertion merely to obtain a passing test.

**Verify the fix:** The target safety test passes. Install the actual presentation build on the actual phone and verify sign-in, data loading, upload and attendance from the panel's network.

**If we skip it:** The APK may work only on the developer's current LAN and fail during the panel or hosted simulator session.

## Role by role coverage

| Role or identity | Passed live checks | Failures or remaining limits |
| --- | --- | --- |
| Existing Super Admin | Password sign-in; actual user-supplied MFA challenge; console access; user list; audit list; self-deactivation refused; active Coordinator deactivation refused; invalid Coordinator creation rejected; no academic attendance or chat access | No new account invitation, password change, MFA enrollment change, account removal, or external email delivery test |
| ICS Coordinator | Main routes render; active and pending student lists; attendance list; company and branch lists; assignments; schedule list; submitted evaluations; progress and report server renders; student approval and duplicate refusal; CSV preview errors; gateway deployment refusal; confidential incident review and closure; chat contact eligibility; IBE read isolation | Prepared attachments and back ID preview fail. New HTE creation, branch creation and a full new placement were not completed |
| Assigned Supervisor | Main routes render; attendance, daily report and evaluation lists; pending attendance verification adds eight hours; repeat verification refused; newly uploaded report approval; assigned chat contact; unrelated student and confidential incident access denied | Prepared report attachments and attendance photo fail. New evaluation submission and return-for-correction were not exercised live |
| Student A active | Auth sign-in; web portal blocked; malformed report, foreign path, executable and oversized upload rejected; future attendance and invalid coordinates rejected; real signed document upload; report submission; schedule submission; incident submission; isolation from Student C records | Valid time-in fails at branch policy lookup; native phone capture, time-out and offline sync remain untested |
| Student B applicant | Auth identifies the account but active-student API access is refused; appears in approvals; Coordinator can approve it once; other students' records denied | Back ID path absent. Temporarily activated only for the gateway consistency probe, then restored to pending |
| Student C completed | 61 synthetic historical attendance rows total exactly 486 credited hours; public certificate verification renders the demo student; owner report edits blocked; Coordinator assignment edits blocked; record state remains completed | New report submission gives misleading HTTP 503. Prepared evidence paths need correction through a valid local fixture rebuilding procedure |
| Anonymous caller | Dashboard redirects to sign-in; protected mobile API returns 401; public demo certificate verification works | No browser appearance or accessibility inspection |

## Test records and cleanup

- Student B was restored to `pending` after approval and gateway testing.
- Student A's tested pending attendance was restored to `pending`; original progress remains eight verified hours. The additional temporary proposal, uploaded report and its upload object, and attendance upload probe were removed.
- Student A retains its original three report rows. Student C's completed records were not changed by rejected write attempts.
- One clearly labeled synthetic incident was submitted, reviewed and closed. It remains as audit evidence, with its normal notifications and audit trail. Approval and review probes also generated their normal notification, email-queue and audit side effects. Counters and audit history were not reset or erased. No delivery to a real inbox was tested.
- The Super Admin credential and MFA configuration were not changed. No Super Admin was created. No hosted staging or production records were intentionally written.
- The existing test suite performs a read-only portal reachability check against its configured hosted URL. This is separate from the local application checks and is not production workflow coverage.
- Passwords, authenticator codes, session cookies and signed download tokens are excluded from this report and the retained result JSON.

## Fix order and acceptance checklist

1. Repair the branch read privilege and error mapping. Complete real API time-in and time-out tests before relying on the live attendance segment.
2. Repair the demo document paths, photo bucket contents and ID back paths. Open every piece of evidence using the intended role.
3. Align mobile gateway policy and completed-record errors with the rest of the application.
4. Restore preview environment safety and rerun the failing build-target test.
5. Run the entire test chain again, then rehearse the guide on the physical phone and the intended presentation network.

For the first rehearsal after fixes, verify that the phone build and web portal use this same local backend, the company pin is the actual approved venue, and the attendance date is an allowed weekday. A 50 metre geofence is configured in this demo. A local backend on the computer is not reachable from the phone through the phone's own `localhost` address.

## Evidence and commands

Retained machine-readable results: `artifacts/panel-audit/results.json` at the workspace root. It contains all 96 final assertion results. Lint output: `artifacts/panel-audit/web-lint.log`.

The harness files under workspace `artifacts/` document the HTTP and database probes. They are audit scratch tools, not a new production test framework. The full multi-stage harness used temporary authenticated session state and a one-time MFA code, so it is not a single unattended replay of every user journey.

Run from `OJT-MONITORING-AND-MANAGEMENT-SYSTEM`:

```powershell
npm test
node --test scripts/mobile-target-safety.test.cjs
npm run lint --workspace web
```

Web type check, from `apps/web`:

```powershell
node ../../node_modules/typescript/bin/tsc --noEmit --pretty false
```

Mobile type check, from `apps/mobile`:

```powershell
node node_modules/typescript/bin/tsc --noEmit --pretty false
```

The 15 individual checks run were account collision, attendance credit range, chat attachments, course department, department RLS, evaluation appeals, HTE branches, incident reports, pending staff invites, practicum review, registration resubmission, security boundaries, student bulk import, Supervisor report boundary and workflow safety. Their isolated database or mocked checks do not replace live API testing against actual table grants.

**Not checked:** Full visual browser interaction, keyboard and screen reader behavior, actual email delivery and fresh registration, new Coordinator or Supervisor invitations, credential reset and recovery, full fresh deployment, live new evaluation and appeal decisions, native camera and face detection, physical GPS, real offline capture and reconnect, desktop packaging, fresh production build, concurrency and load. A fresh build was not run against the active local server's output directory. No fixes were applied.
