# OJT Monitoring System: Feature Matrix

Source: `docs/system-features.md`. Audit by static file reading only (no app, test, npm, git, or database runs).

## Second pass

Scope: every row that was "partial" or whose notes said "not traced"/"not searched" was re-searched under `apps/web`, `apps/mobile/src`, `supabase/migrations`, `scripts`, and `shared` (where present). This pass is not complete: 47 rows remain partial (listed below) because they were not fully traced within this pass. No test was run.

### Counts

| Status | Before | After |
|---|---|---|
| implemented | 10 | 11 |
| partial | 56 | 47 |
| missing | 25 | 33 |
| needs-human | 9 | 9 |
| Total | 100 | 100 |

### Rows whose status changed (9)

- sa-audit-logs: partial -> implemented. `apps/web/app/(dashboard)/admin/AdminClient.tsx:115-192` loads `listAuditLogs(1, 10)` into an audit panel with error handling. The read service is `apps/web/src/services/audit.ts:25`.
- sa-view-all-chats: partial -> missing. `supabase/migrations/035_coordinator_supervisor_chat.sql:55-77` lets a conversation be read only by its Coordinator or Supervisor participant. No Super Admin policy exists in any migration, and no admin chat UI was found.
- sa-seeded-accounts: partial -> missing. Grep for `seed|super_?admin|backup` in `supabase/migrations` returned no matches. `scripts/seed-staging-qa.mjs` exists but is staging QA data and was not traced further.
- st-wifi-fallback: partial -> missing. Grep for `ssid|wifi|wi-fi` in `apps/mobile/src/services/attendance.ts` and `apps/mobile/src/screens/attendance/AttendanceScreen.tsx` returned no SSID check. The `LOW ACCURACY - WIFI VERIFIED` path does not exist.
- co-reset-password: partial -> missing. The only reset code is self-service email reset, `apps/web/src/services/auth/password-recovery.ts:36`. No bulk or coordinator-triggered default-password reset was found.
- co-bulk-import: partial -> missing. Grep for `bulk|import|csv|xlsx|excel|sheetjs` under `apps/web/src` returned no import code.
- co-import-transaction: partial -> missing. Same search as co-bulk-import. No transaction or rollback import path exists.
- co-incident-reports: partial -> missing. Grep for `incident|harass|concern|anonymous` under `apps` found only a gateway "Incident Report" document type (`apps/mobile/src/screens/reports/ReportsScreen.tsx:132`) and a label in `apps/web/app/(dashboard)/coordinator/submissions/page.tsx:672`. No confidential reporting channel exists.
- st-concern-report: partial -> missing. Same search as co-incident-reports. Not found.

### Rows checked and kept, with evidence

- sa-view-all-chats and co-chat-* rows: chat is text-only. `035_coordinator_supervisor_chat.sql:18-24` defines `chat_messages.content` as text only, with no attachment, tag, pin, template, mute, report, recall, or broadcast tables. `ChatWorkspace.tsx` has `role: 'Coordinator' | 'Supervisor'` only.
- co-flag-mock and st-mock-location-block: grep for `mock.?location|isMock` under `apps` found only a text line in `apps/web/src/components/layout/PublicFooter.tsx:279`. Missing.
- co-wfh-mode and st-weekly-auto-compile: no WFH or weekly compile code found.
- co-draft-watermark: no DRAFT watermark code found in `apps/web/src/services`.
- sys-backup and sa-backups: `apps/web/app/(dashboard)/admin/AdminClient.tsx:1006-1010` states database backups and restores are managed in the Supabase project, and the app does not export student records. In-app backup is missing.
- sa-soft-delete-30d and sys-soft-delete: grep for `deleted_at|soft.?delete|restore` under `supabase` returned no matches.
- co-hte geofence: radius validation is 50-5,000 m (`apps/web/src/services/companies.ts:36-37, 101-102`; `companyRequests.ts:37`), not the 100-500 m in the feature text. WiFi SSID is not in web services. Stays partial.
- co-geofence-primary-secondary: only one geofence per branch observed in `companies.ts:89-111`. Stays partial.

### Rows still unresolved (partial, not fully traced in this pass)

sa-create-coordinator (email send is third-party), sa-coord-first-login-2fa, sa-settings, sa-delete-blocked-active, co-student-autocreate, co-hte-permit-moa-gate, co-hte-geofence-fields, co-geofence-primary-secondary, co-dashboard, co-view-attendance-logs, co-flag-needs-justification, co-flag-errand, co-flag-low-accuracy, co-flag-offline-sync, co-report-approval, co-offsite-5km, co-drag-pin, co-manual-attendance, co-transfer-students, co-reassign-supervisors, co-student-status, co-multi-coordinators-backup, co-reports-dtr, co-chat-start-tag-attach, sv-dashboard, sv-verify-dispute, sv-errand-justification-approve, sv-offsite-authorize, sv-report-approve, sv-evaluation, sv-chat-reply, sv-multi-supervisor-average, st-recover-password, st-errand-outside-geofence, st-submit-justification, st-no-action-outside-invalid, st-forgotten-timeout, st-emergency-early-out, st-hours-overtime, st-future-dated-block, st-late-flag, st-edit-delete-revision, st-documents, st-notifications-announcements-results, st-appeal-reevaluation, sys-tamper-proof-chat, sys-privacy-notice. (47 rows, verified by grep of the table.)

Note: sys-privacy-notice has a privacy comment in `apps/web/src/services/storage.ts:53` and a retention section in `PublicFooter.tsx:216`, but the notice text itself was not traced.

## Known gaps

- Sidebar mojibake: `apps\web\src\components\layout\Sidebar.tsx:251` renders `RA 10173 â€¢ ISO/IEC`, a UTF-8 bullet and dash decoded as Windows-1252.
- Staff account creation failure through the Auth Admin API: not reproduced. The code path is `apps\web\src\services\admin.ts:108` (`inviteUserByEmail`) with rollback at lines 152-158. The rollback removes the invited user when setup fails, and logs a cleanup message if rollback itself fails.

## Summary

Total features: 100

| Status | Count |
|---|---|
| implemented | 11 |
| partial | 47 |
| missing | 33 |
| needs-human | 9 |

Caveats:
- "partial" is also used for rows that were not fully traced in this pass. Each such row says so in its notes.
- Test column: "none" means no test file was found that targets the feature. Where a check script name matches the feature, it is listed as "name match only, not run".
- Known conflict: AGENTS.md:20 says Super Admin has no routine access to chat content, while the feature list says Super Admin can view all chats (row sa-view-all-chats). The code (migration 035 RLS) follows AGENTS.md: Super Admin has no chat read path, so sa-view-all-chats is now missing.

## Matrix

| slug | role | feature | status | implementation (file:line) | test | notes |
|---|---|---|---|---|---|---|
| sa-create-coordinator | Super Admin | Create Coordinator account (name, employee ID, email, department, temp password) | partial | apps/web/src/services/admin.ts:86 createSystemUser | name match only: scripts/check-account-collision.cjs | Uses an invite link (admin.ts:108), not a temp password. Email send is real third-party. |
| sa-coord-first-login-2fa | Super Admin | Coordinator must change password and set up 2FA on first login | partial | apps/web/app/auth/set-password/page.tsx; apps/web/src/services/auth/session.ts:154 | none | Coordinator 2FA enrollment not traced. Admin MFA exists (apps/web/app/(dashboard)/admin/AdminMfaGate.tsx). |
| sa-settings | Super Admin | Manage system settings | partial | apps/web/app/(dashboard)/settings/page.tsx | none | Scope of settings not traced. |
| sa-backups | Super Admin | Manage backups | missing | AdminClient.tsx:1006-1010 (provider-side note only) | none | Backups are managed in the Supabase project. No in-app backup code. |
| sa-audit-logs | Super Admin | View audit logs | implemented | apps/web/app/(dashboard)/admin/AdminClient.tsx:115-192; apps/web/src/services/audit.ts:25 listAuditLogs | none | Changed from partial: admin UI loads listAuditLogs(1, 10). |
| sa-flagged-chats | Super Admin | Review flagged chat messages | dropped | none found | none | Decision 2026-10-23: removed from system-features.md. Super Admin has no chat access (AGENTS.md:20). Do not build. |
| sa-view-all-chats | Super Admin | View all chats for investigations | dropped | supabase/migrations/035_coordinator_supervisor_chat.sql:55-77 (participant-only read) | none | Decision 2026-10-23: removed from system-features.md. Current participant-only RLS is correct. Do not build. |
| sa-seeded-accounts | Super Admin | Two seeded Super Admin accounts (primary and backup) | missing | none in supabase/migrations | none | Changed from partial: grep for seed/super_admin/backup in migrations found nothing. scripts/seed-staging-qa.mjs is staging data, not traced. |
| sa-email-verify-before-activate | Super Admin | Email verification before Coordinator activation | needs-human | apps/web/src/services/admin.ts:108 | none | Depends on a real invite email. |
| sa-delete-blocked-active | Super Admin | Deletion blocked if Coordinator has active students | verified | apps/web/src/services/companies.ts:273 deleteCompany (companies only) | none | Verified 2026-10-23 (loop/sa-delete-blocked-active 3241576). See loop-state.md. |
| sa-soft-delete-30d | Super Admin | Soft delete with 30-day recovery | missing | none | none | Grep for deleted_at, soft delete, restore under supabase returned no matches. |
| co-bulk-import | OJT Coordinator | Bulk import students via Excel/CSV with error preview | verified | apps/web/src/services/studentImport.ts previewStudentImport; apps/web/app/(dashboard)/coordinator/import/page.tsx; apps/web/src/lib/csv.ts | scripts/security.test.cjs (import preview/commit); scripts/check-student-bulk-import.cjs | CSV only (no .xlsx). Imported students start active with the student number as password and must change it. Verified 2026-10-24 in Chromium against local Supabase (scripts in session scratchpad vf/). Bad row blocks import; clean CSV imported 2 active students with forced change; imported student signs in with the default; re-import flagged as duplicates. |
| co-import-transaction | OJT Coordinator | Transaction-based import (rolls back on failure) | implemented | apps/web/src/services/studentImport.ts commitStudentImport | scripts/security.test.cjs (rollback on row failure) | All-or-nothing by validating every row first and deleting every created Auth user if a later row fails (Auth cannot join a DB transaction). Rollback path covered by unit test only (cannot force a mid-run Auth failure in the browser). |
| co-verify-self-registration | OJT Coordinator | Verify student self-registrations | implemented | apps/web/src/services/auth/account-review.ts:127 updateStudentAccountStatus; apps/web/app/(dashboard)/coordinator/approvals/page.tsx | none | |
| co-student-autocreate | OJT Coordinator | Auto-create student accounts (username = Student ID, INACTIVE) and send email | partial | apps/web/src/services/auth/registration.ts:50 | none | INACTIVE status and email send not verified; email is needs-human. |
| co-hte-verify-add | OJT Coordinator | Verify or manually add HTEs | implemented | apps/web/src/services/companies.ts:117 createCompany; apps/web/src/services/companyRequests.ts:28 decideCompanyRequest; apps/web/app/(dashboard)/coordinator/companies/page.tsx | name match only: scripts/check-hte-branches.cjs | |
| co-hte-permit-moa-gate | OJT Coordinator | Business Permit or MOA required before approval | partial | apps/web/src/services/companyRequests.ts:49 getCompanyRequestEvidenceUrl | none | Enforcement point (block without document) not traced. |
| co-hte-geofence-fields | OJT Coordinator | HTE map pin, 100-500m radius, WiFi SSID fallback | partial | apps/web/src/components/companies/LocationPickerMap.tsx; apps/web/src/services/companies.ts:36-37 | none | Radius validation is 50-5,000 m, not 100-500 m. SSID fields not in web services. Decision 2026-10-23: radius is 100-500 m, default 150. Change both checks in companies.ts (lines 36 and 101) and docs/7. DATABASE_SPEC.md. The DB CHECK (50..5000) needs a new migration that first clamps existing rows into 100..500; write the migration file but do not apply it (human step). |
| co-hte-branches | OJT Coordinator | Multiple HTE branches | implemented | apps/web/src/services/companies.ts:95 createCompanyBranch; apps/web/app/(dashboard)/coordinator/branches/page.tsx; supabase/migrations/20261020230000_hte_branches_and_requests.sql | name match only: scripts/check-hte-branches.cjs | |
| co-supervisor-create | OJT Coordinator | Create HTE Supervisor accounts | implemented | apps/web/src/services/supervisors.ts:101 createSupervisor | none | |
| co-supervisor-credentials-email | OJT Coordinator | Supervisor credentials sent automatically by email | needs-human | apps/web/src/services/supervisors.ts:101 | none | Real email send. |
| co-geofence-primary-secondary | OJT Coordinator | Set primary and secondary geofences | partial | apps/web/src/services/companies.ts:89-111 (one geofence per branch) | none | Only one geofence set observed. |
| co-dashboard | OJT Coordinator | Real-time dashboard (totals, deployed, pending, completed, late, flagged) | partial | apps/web/app/(dashboard)/coordinator/progress/page.tsx; apps/web/src/services/progress.ts:155 getDepartmentSummary | none | Real-time behavior and late/flag counts not verified. |
| co-view-attendance-logs | OJT Coordinator | View attendance logs (GPS map, timestamp, photo, accuracy, status) | partial | apps/web/src/services/attendance.ts:226 listAttendanceForCoordinator | none | GPS map and accuracy display not traced. |
| co-flag-needs-justification | OJT Coordinator | Needs Justification: approve or reject | partial | apps/web/src/services/attendance.ts:172 coordinatorOverrideVerifyAttendance | none | Flag-specific path not traced. |
| co-flag-errand | OJT Coordinator | Errand: auto-approve if Supervisor pre-approved | partial | none specific found (mobile AttendanceScreen.tsx:997-1002 is a free-text note only) | none | No auto-approve logic found. |
| co-flag-mock | OJT Coordinator | Mock Detected: record violation and require meeting | missing | none | none | Mock detection absent (see st-mock-location-block). |
| co-flag-low-accuracy | OJT Coordinator | Low Accuracy: verify against company WiFi | partial | none specific found | none | No WiFi verification path found. |
| co-flag-offline-sync | OJT Coordinator | Offline Sync: wait for auto-sync | partial | none specific found | none | |
| co-report-approval | OJT Coordinator | Approve or reject daily and weekly reports | partial | apps/web/src/services/reports.ts:139 reviewReport | none | Daily review found; weekly path not traced. |
| co-offsite-5km | OJT Coordinator | Authorize off-site work (geofence expands to 5km) | partial | supabase/migrations/20261020210000_finite_offsite_schedule_dates.sql | none | 5km expansion not verified. |
| co-wfh-mode | OJT Coordinator | Enable WFH mode (geofence off, task-proof on) | missing | none | none | No WFH mode found. |
| co-drag-pin | OJT Coordinator | Drag geofence pin to edit it | partial | apps/web/src/components/companies/LocationPickerMap.tsx | none | Drag handling not traced. |
| co-manual-attendance | OJT Coordinator | Manually log attendance for students without phones | partial | apps/web/src/services/attendance.ts:172; supabase/migrations/20261021000200_atomic_coordinator_attendance_exception.sql | none | |
| co-reset-password | OJT Coordinator | Reset student passwords to default in one click | verified | apps/web/src/services/auth/account-review.ts resetStudentPasswordToDefault; apps/web/app/(dashboard)/coordinator/students/page.tsx; apps/mobile/src/screens/auth/ForcePasswordChangeScreen.tsx; supabase/migrations/20261024000800_student_must_change_password.sql | scripts/security.test.cjs (reset); scripts/check-student-bulk-import.cjs | Default = student number ("cdm-" prefix if under 8 chars); forced change at next mobile sign-in. Verified 2026-10-24 in Chromium against local Supabase (scripts in session scratchpad vf/). Reset from Trainee Roster, flag set, audit has no password, skip attempt refused (400), flag cleared after a real change. Mobile change screen itself not run on a device. |
| co-transfer-students | OJT Coordinator | Transfer students between HTEs (old hours retained) | partial | apps/web/src/services/assignments.ts:211 reassignStudent | none | Hours retention not verified. |
| co-reassign-supervisors | OJT Coordinator | Reassign supervisors | partial | apps/web/src/services/assignments.ts:211 | none | Only student reassignment observed. |
| co-student-status | OJT Coordinator | Set student status to DROPPED, INC, or TERMINATED | verified | apps/web/src/services/assignments.ts:182 updateStudentStatus | none | Verified 2026-10-23 (loop/co-student-status 12be757). See loop-state.md. |
| co-incident-reports | OJT Coordinator | Receive confidential incident or harassment reports | verified | supabase/migrations/20261024001100_confidential_incident_reports.sql; apps/web/src/services/incidentReports.ts; apps/web/app/(dashboard)/coordinator/incident-reports/page.tsx | scripts/check-incident-reports.cjs; scripts/security.test.cjs | Readable only by the student and the department Coordinator (no Supervisor/Admin policy). Verified 2026-10-24 in Chromium against local Supabase (scripts in session scratchpad vf/). Student endpoint 200 (400/401/403 for bad input, no token, Supervisor token); Coordinator acknowledged then closed with response; Supervisor and Admin see 0 rows; notifications and audit carry no details. |
| co-multi-coordinators-backup | OJT Coordinator | Multiple coordinators with auto-assigned backup | partial | apps/web/src/services/assignments.ts | none | Backup auto-assignment not found in searched code; assignments.ts not fully traced. |
| co-reports-dtr | OJT Coordinator | Generate DTR, compliance, hours, errand reports (PDF/Excel) | partial | apps/web/src/services/reports.ts:334 getGatewayComplianceSummary; apps/web/app/(dashboard)/coordinator/reports/page.tsx | none | PDF/Excel export not verified. |
| co-draft-watermark | OJT Coordinator | Reports watermarked DRAFT while pending sync | missing | none | none | No DRAFT or watermark code in dashboard pages or services. |
| co-eval-final-grade-complete | OJT Coordinator | View evaluations, enter final grade, mark COMPLETED (locks attendance) | implemented | apps/web/src/services/certificates.ts:159 recordFinalOjtGrade; supabase/migrations/20261021000100_coordinator_final_grade_and_completion_freeze.sql | none | |
| co-eval-appeals | OJT Coordinator | Handle evaluation appeals as final arbiter | implemented | apps/web/src/services/evaluations.ts:289 listEvaluationAppeals, :300 decideEvaluationAppeal; apps/web/app/(dashboard)/coordinator/evaluations/page.tsx; supabase/migrations/20261020220000_evaluation_appeals.sql | name match only: scripts/check-evaluation-appeals.cjs | |
| co-chat-start-tag-attach | OJT Coordinator | Start conversations, tag students, attach files (PDF, JPG, PNG, DOCX, 10MB) | verified | apps/web/src/components/chat/ChatWorkspace.tsx; apps/web/src/services/chatAttachments.ts; supabase/migrations/20261024001000_chat_attachments_and_student_tags.sql | scripts/check-chat-attachments.cjs; scripts/security.test.cjs | Tags limited to students of the pair's shared placement; files validated server-side and served by 60-second signed URLs. Verified 2026-10-24 in Chromium against local Supabase (scripts in session scratchpad vf/). Tagged PDF sent and rendered; fake PDF refused and cleaned up; Supervisor downloaded identical bytes via signed URL; student cannot read the message. Rechecked in the Docker app after the auth cookie name fix. |
| co-chat-quick-actions | OJT Coordinator | Quick-action buttons and live student context cards | missing | none in ChatWorkspace.tsx | none | |
| co-chat-templates-pin-search | OJT Coordinator | Official message templates, pin messages, search and filter chats | missing | none in ChatWorkspace.tsx (only a URL search param) | none | |
| co-chat-broadcast | OJT Coordinator | Broadcast to many supervisors, each as individual thread | missing | none | none | |
| co-chat-response-red-flags | OJT Coordinator | Track supervisor response times; red flag after 48h | missing | none | none | |
| co-chat-auto-approve-24h | OJT Coordinator | Approve errands on Supervisor's behalf after 24h | missing | none | none | |
| co-chat-report-mute | OJT Coordinator | Report or mute abusive messages | missing | none | none | |
| co-chat-recall-5min | OJT Coordinator | Recall a message within 5 minutes | missing | none | none | |
| co-chat-warn-unassigned-student | OJT Coordinator | Warned before sharing about a student not under that Supervisor | missing | none | none | |
| sv-dashboard | Supervisor | Dashboard of assigned interns | partial | apps/web/app/(dashboard)/supervisor/students/page.tsx | none | |
| sv-verify-dispute | Supervisor | Mark attendance entries VERIFIED or DISPUTED | verified | apps/web/src/services/attendance.ts:67 verifyAttendance; app/(dashboard)/supervisor/attendance/page.tsx | scripts/security.test.cjs (assignment guard) | Verified 2026-10-23 after attempt 3 (loop/sv-verify-dispute 76408cc): button "Mark Disputed", stored status shown as "Rejected" on Supervisor and Coordinator pages. See loop-state.md. |
| sv-errand-justification-approve | Supervisor | Approve errands and justifications | partial | none specific found | none | |
| sv-offsite-authorize | Supervisor | Authorize temporary off-site work | partial | supabase/migrations/20261020210000_finite_offsite_schedule_dates.sql | none | |
| sv-geofence-adjust-request | Supervisor | Request geofence adjustment if pin is wrong | missing | none | none | |
| sv-report-approve | Supervisor | Approve report with comment or request revision | verified | apps/web/src/services/reports.ts:223 endorseReportBySupervisor | none | Verified 2026-10-23 (loop/sv-report-approve 7798835). Mobile does not show the comment text yet. See loop-state.md. |
| sv-evaluation | Supervisor | Mid-term and final evaluation (5-point), comment required below 3 | verified | apps/web/src/services/evaluations.ts:68 createEvaluation | scripts/security.test.cjs | 2026-10-23 browser check on loop/sv-evaluation bcfe5aa: 1-5 dropdowns default to 4 (80%); midterm with empty comment saved at 80; final with Attendance=2 turns red, comment required, 72%; empty comment blocked ("A comment is required when any rating is below 3."), nothing saved in DB; saved at 72 with a comment; second midterm rejected as "already submitted". No console errors or 4xx/5xx; no overflow at 390px. Screenshots: scratchpad pw/sveval-*.png. Coordinator /coordinator/evaluations only lists appeals, so there is no coordinator view of evaluations. |
| sv-chat-reply | Supervisor | Reply to Coordinator, view tagged records, attach files, quick actions | partial | apps/web/src/components/chat/ChatWorkspace.tsx; supabase/migrations/20261024001000_chat_attachments_and_student_tags.sql | scripts/check-chat-attachments.cjs | Text reply, student tags and attachments exist (2026-10-24). Quick actions still missing. |
| sv-chat-pin | Supervisor | 4-digit PIN for sensitive messages, device and IP logged | missing | none in ChatWorkspace.tsx | none | |
| sv-notifications-email-sms | Supervisor | Email and SMS notifications | needs-human | supabase/migrations/20261016004509_architecture_security_and_async_email_queue.sql; apps/web/app/api/internal/process-transactional-email/route.ts | none | Real email send. No SMS code found. |
| sv-auto-approve-48h | Supervisor | Auto-approval after 48h without action (Coordinator override) | missing | none | none | |
| sv-escalation-reminders | Supervisor | Escalation reminders at 1, 24, 48 hours | missing | none | none | |
| sv-sms-fallback | Supervisor | SMS fallback for urgent messages when offline over 24h | missing | none | none | |
| sv-offline-pin-approve | Supervisor | Supervisor PIN on student phone to approve attendance without internet | missing | none | none | |
| sv-multi-supervisor-average | Supervisor | Multiple supervisors per HTE, separate thread and evaluation, scores averaged | partial | apps/web/src/services/evaluations.ts:158 getStudentEvaluationSummary | none | Averaging not verified. |
| st-onboarding-password-profile | OJT Student | Log in with Student ID and default password; change password; complete profile | needs-human | apps/web/app/(dashboard)/settings/SettingsClient.tsx:252; apps/mobile/src/screens/auth/SignInScreen.tsx | none | Mobile flow. |
| st-select-or-add-hte | OJT Student | Select or add HTE (PENDING); approval sets DEPLOYED and activates geofence | needs-human | apps/mobile/src/components/CompanyRequestModal.tsx; apps/web/src/services/companyRequests.ts | none | Mobile UI. |
| st-recover-password | OJT Student | Recover forgotten password via Student ID, birthday, Coordinator approval | partial | apps/web/src/services/auth/password-recovery.ts:9; apps/web/app/api/mobile/auth/password-recovery/route.ts | none | Birthday and approval steps not traced. |
| st-web-login-borrowed-phone | OJT Student | Web login or borrowed phone when phone is lost | needs-human | apps/mobile/src/screens/auth/SignInScreen.tsx | none | Device flow. |
| st-timein-timeout-geofence | OJT Student | Time-In/Time-Out inside geofence recorded with GPS and selfie as VALID | needs-human | apps/web/app/api/mobile/attendance/route.ts:105-109; apps/mobile/src/screens/attendance/AttendanceScreen.tsx; apps/mobile/src/services/attendance.ts:89 recordTimeIn | none | Requires GPS and camera hardware. |
| st-mock-location-block | OJT Student | Mock location detection (blocked) | missing | none in apps/mobile/src | none | Grep for mock.?location/isMock found no code (only a text line in PublicFooter.tsx:279). |
| st-offline-autosync | OJT Student | Offline saving with auto-sync (PENDING SYNC) | needs-human | apps/mobile/src/lib/offlineQueue.ts; apps/mobile/src/lib/syncEngine.ts | none | Device and network. |
| st-wifi-fallback | OJT Student | WiFi SSID fallback for weak GPS (LOW ACCURACY - WIFI VERIFIED) | missing | none | none | Changed from partial: grep for ssid/wifi in mobile attendance service and screen found nothing. |
| st-server-timestamp | OJT Student | Server timestamp only (device time ignored) | implemented | supabase/migrations/20261020150000_attendance_server_receipt_times.sql | none | |
| st-errand-outside-geofence | OJT Student | Outside geofence: "I'm on Errand" with reason and photo, pending approval | partial | apps/mobile/src/services/attendance.ts:34 (locationStatus flagged_out_of_bounds) | none | Flag exists. Errand submission with photo not found as a distinct flow. |
| st-submit-justification | OJT Student | Outside geofence: "Submit Justification" with note and photo | partial | apps/mobile/src/screens/attendance/AttendanceScreen.tsx:997-1002 (free-text note) | none | Note field present. Photo and submit path not traced. |
| st-no-action-outside-invalid | OJT Student | No action taken: flagged OUTSIDE - INVALID (not auto-absent) | partial | apps/mobile/src/services/attendance.ts:34 | none | OUTSIDE - INVALID label not found. |
| st-forgotten-timeout | OJT Student | Forgotten time-out: 5PM reminder, auto time-out after 10 hours, pending verification | partial | supabase/migrations/20261021000000_enforce_attendance_timeout_review.sql; supabase/migrations/034_verified_attendance_timeout_completion.sql | none | Server auto time-out verified 2026-10-23 (loop/st-forgotten-timeout 7f1df05). 5PM reminder missing in mobile app (needs-human). Cron must be scheduled by a human. See loop-state.md. |
| st-emergency-early-out | OJT Student | Emergency / Early Out (sick, family emergency, disaster, brownout), no GPS penalty, instant notification | partial | none specific found | none | Grep for emergency/early_out found no code. |
| st-hours-overtime | OJT Student | Hours auto-calculated; overtime marked for recognition | partial | supabase/migrations/032_overlapping_lunch_attendance_credit.sql; supabase/migrations/20261019070000_attendance_assignment_date_credit_guard.sql | name match only: scripts/check-attendance-credit-range.cjs | Overtime marking not verified. |
| st-future-dated-block | OJT Student | Future-dated attendance blocked | verified | supabase/migrations/20261019070000_attendance_assignment_date_credit_guard.sql | none | Verified 2026-10-23 via API (loop/st-future-dated-block dd67bdd). See loop-state.md. |
| st-daily-report | OJT Student | Daily accomplishment reports (tasks, learnings, photo proof) | implemented | apps/web/src/services/reports.ts:53 submitReport; apps/web/app/api/mobile/reports/route.ts; apps/mobile/src/screens/reports/ReportsScreen.tsx | none | |
| st-weekly-auto-compile | OJT Student | Weekly reports auto-compiled | missing | none | none | Grep for weekly compile found no code. |
| st-late-flag | OJT Student | Late submissions flagged LATE but still accepted | partial | not traced | none | |
| st-edit-delete-revision | OJT Student | Edit or delete while PENDING; Revision Request when APPROVED | partial | apps/web/src/services/reports.ts | none | Revision Request path not found. |
| st-upload-types | OJT Student | Uploads limited to PDF, JPG, PNG, DOCX (max 10MB, executables blocked) | implemented | apps/web/src/lib/uploadValidation.ts; apps/web/src/services/storage.ts:18 createPrivateDocumentUploadUrl | none | |
| st-documents | OJT Student | Upload MOA, endorsement letter, resume, medical documents | partial | apps/web/src/services/storage.ts:18 | none | Document-type mapping not traced. |
| st-notifications-announcements-results | OJT Student | View notifications, announcements, evaluation results | partial | apps/web/src/services/announcements.ts:23; apps/web/app/(dashboard)/student/notifications/page.tsx; apps/web/app/(dashboard)/student/evaluation-summary/page.tsx | none | |
| st-concern-report | OJT Student | Confidential or anonymous "Report Concern / Incident Report" | needs-human | apps/mobile/src/components/IncidentReportModal.tsx; apps/web/app/api/mobile/incident-reports/route.ts | scripts/check-incident-reports.cjs | Confidential, not anonymous: the Coordinator sees who reported. Server endpoint verified 2026-10-24; the mobile modal needs a check on a device with the Expo development build. |
| st-appeal-reevaluation | OJT Student | File an "Appeal for Re-Evaluation" | partial | supabase/migrations/20261020220000_evaluation_appeals.sql | name match only: scripts/check-evaluation-appeals.cjs | Student submission path not traced. |
| sys-offline-mode | System | Offline mode with auto-sync if server goes down | needs-human | apps/mobile/src/lib/syncEngine.ts; apps/mobile/src/lib/offlineQueue.ts | none | Device and network. |
| sys-soft-delete | System | Soft delete | missing | none | none | Grep for deleted_at/soft delete under supabase returned no matches. |
| sys-audit-logs | System | Audit logs | implemented | apps/web/src/lib/audit.ts; apps/web/src/services/audit.ts:25 listAuditLogs; apps/web/src/services/admin.ts:160 (write example) | none | |
| sys-daily-backup | System | Daily auto-backup, restorable for 30 days | missing | AdminClient.tsx:1006-1010 (provider-side note only) | none | Backups are managed in Supabase, not by app code. |
| sys-version-history-edit-lock | System | Version history and edit locking when Coordinator opens a report | missing | none | none | |
| sys-tamper-proof-chat | System | Permanent, tamper-proof chat logs with read receipts | partial | supabase/migrations/035_coordinator_supervisor_chat.sql:11-12, :163-164 | none | Read receipts found; tamper-proofing not found. |
| sys-privacy-notice | System | Data Privacy Act notice | partial | apps/web/src/services/storage.ts:53 (code comment only); apps/web/src/components/layout/PublicFooter.tsx:216 | none | Notice text not traced. |
