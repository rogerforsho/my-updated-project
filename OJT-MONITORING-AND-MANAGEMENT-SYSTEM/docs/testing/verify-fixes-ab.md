# Verify: fix batches A and B (production build)

Run 2026-10-23. App `http://127.0.0.1:3100` (production build), local Supabase `127.0.0.1:57321`, DB container `supabase_db_cdm-ojt-test-local`, branch `loop/integration`. No source edits.
Scripts/screenshots: scratchpad `C:\Users\Ralph\AppData\Local\Temp\claude\C--Users-Ralph-capstone-project\b209662f-c8e7-4737-b1ea-72def4f98a9c\scratchpad` (`pw\v-ab*.cjs`, `ab-*.png`).

| # | Item | Result |
|---|---|---|
| 1 | Clearance enforced in DB | PASS |
| 2 | Admin aal1 blocked from users/audit_logs; aal2 allowed | PASS |
| 3 | Coordinator cannot PATCH attendance status; decide-exception RPC works | PASS |
| 4 | Login limit counts only failures | PASS |
| 5 | Coordinator invite / Supervisor creation | **FAIL** (self-signup bypass check: PASS) |
| 6 | Announcements publish/delete, Publish button at 390px | PASS for Admin; Coordinator UI not testable (none exists) |
| 7 | final_report submit + Coordinator approve | PASS |

## 1. Clearance in DB: PASS
In a transaction (rolled back, other guard triggers `guard_ojt_final_grade` / `guard_ojt_completion_certificate` disabled inside it so only `require_ojt_clearance` is exercised):
- Student 1523fbc3 (`student_clearance_met` = f): INSERT into `ojt_final_grades` and into `certificates` both fail with `Student has not met all OJT clearance requirements` (23514).
- Student 6bc3f016 (`student_clearance_met` = t): INSERT into both succeeds.
Without disabling the guards, the older guard triggers fire first ("Only the assigned OJT Coordinator may record this final grade"). Nothing was left in the DB.

## 2. Super Admin aal1 vs aal2: PASS
Admin JWT with the anon key:
- aal1: `users` rows other than own = 0, `audit_logs` rows = 0, own row = 1 (sign-in still works).
- After TOTP verify (aal2): other users = 15, `audit_logs` = 5 (limit 5).

## 3. Coordinator attendance PATCH: PASS
Coordinator token `PATCH attendance` set to `verified` and to `rejected`: 0 rows affected, status unchanged (`pending`). `rpc coordinator_decide_attendance_exception` (rejected, with reason) succeeded; row became `rejected` and an `ATTENDANCE_EXCEPTION_REJECTED` audit row exists.
Side effect: attendance ed7a8949 (QA student, 2026-10-13) is now `rejected`.

## 4. Login rate limit: PASS
Production UI, 11 consecutive successful logins for qa-supervisor: all 11 succeeded; its email bucket stayed at 0; a 12th login also succeeded. For a nonexistent email, 11 wrong-password attempts: the email bucket reached 11, and the next attempt shows "Too many attempts. Please wait before trying again." (`ab4-locked.png`). So failures count and successes do not. The per-IP bucket (limit 100) still counts both (22 here), which is within its limit.

## 5. Coordinator invite / Supervisor creation: FAIL
- Admin UI (aal2) "Invite OJT Coordinator" shows "Failed to send the setup invitation."; no `users`, `coordinators`, grant or audit row; Mailpit has 0 messages (`ab-5-invite.png`).
- GoTrue log: `POST /admin/users` -> `ERROR: Registration requires a fourth-year ICS or IBE student (SQLSTATE P0001)`.
- Reproduced directly: `POST /auth/v1/admin/users` with service key and `{"app_metadata":{"role":"Coordinator"}}` (and `"Supervisor"`) returns `{"code":"P0001","message":"Registration requires a fourth-year ICS or IBE student"}`; no auth user created.
- Cause: trigger `validate_new_student_registration` is BEFORE INSERT on `auth.users` and reads `NEW.raw_app_meta_data->>'role'`; GoTrue's createUser apparently inserts the row first and applies `app_metadata` afterwards, so the trigger sees no role. The same `createUser(app_metadata.role)` code is used in `supervisors.ts`, so Supervisor creation fails the same way (confirmed at the API level, not clicked through the Supervisor UI).
- Suggested fix: skip validation when the request is by the service role (e.g. a marker in `user_metadata`/`raw_user_meta_data` that only the service role path can set is NOT safe, since self-signup can set it), or create the user via a SECURITY DEFINER path/temporary setting, or do the check after the app_metadata update (AFTER INSERT/UPDATE).
- Self-signup bypass: PASS. `POST /auth/v1/signup` with metadata `role: Admin`, `role: Coordinator` + year 4/BSIT, student without ID paths, and fake ID paths all return 500 P0001 (4 different "Registration requires ..." messages); no `auth.users`/`public.users` rows created.

## 6. Announcements: PASS (Admin), Coordinator UI N/A
- Admin (aal2) UI: Publish succeeded ("Announcement published and dispatched ..."), row created, 9 notifications; Delete removed the row. No console/page errors or 4xx/5xx.
- Publish button at 390px: box x=131, width=201 (right edge 332 <= 390), `scrollWidth` 390, no clipping (`ab-6-annc-390.png`). At 1366px: x=1176, width 136, inside the viewport.
- Coordinator: the only announcement authoring UI is `/admin` (AdminClient); a Coordinator cannot open `/admin`, so there is no Coordinator UI to publish or delete. The `createAnnouncement` server action allows the Coordinator role, but that was not exercised (no UI to drive it). Mark as gap or decide that Coordinators should get a page.

## 7. final_report: PASS
Student token `POST /api/mobile/reports` with `report_type: final_report` returned 200; row created with status `submitted`. Coordinator in the UI (`/coordinator/submissions` > Document Review Feed, "Final Report" row, "Review gateway document" > "Approve & Sign Off") set it to `approved`; `REPORT_APPROVED` audit row exists. No console errors or 4xx/5xx (`ab-7-feed.png`, `ab-7-dialog.png`, `ab-7-after.png`).

## Data left behind (local)
- reports row ebb5c46f (QA student final_report, approved).
- attendance ed7a8949 now `rejected`; audit rows for that decision.
- Login rate-limit counters for qa-supervisor/qa-admin/qa-coordinator and `nobody-ab@local.test` (locked ~15 min).
- No coordinator/supervisor/self-signup users were created.

## Re-verify after migration 20261024000500 (2026-10-23)
Scripts/screenshots in scratchpad `pw\v-nc1.cjs`, `pw\v-nc2.cjs`, `nc-1.png`, `nc-2.png`, `nc-3dup.png`, `nc-3sup-dup.png`.

| # | Item | Result |
|---|---|---|
| 1 | Admin invites Coordinator new-coord-1@local.test | PASS. "Setup invitation sent", Mailpit "You've been invited", `users` = Coordinator/active (1 row, no Student/PENDING), `coordinators` row 1, `pending_staff_invites` = 0 afterwards. |
| 2 | Coordinator creates Supervisor new-sup-1@local.test via UI | PASS. Dialog closed, row listed, Mailpit invite present, `users` = Supervisor/active, `supervisors` row 1, `pending_staff_invites` = 0. No console/page errors or 4xx/5xx. |
| 3 | Duplicate email rollback | PASS. Admin: "Email address is already registered."; Coordinator: "Email already registered. No existing account was changed."; auth/public rows unchanged (1 each), no orphan, pending invites 0. |
| 4 | Public self-signup bypass | PASS for role metadata (Admin, Coordinator, Supervisor via data and app_metadata, student without IDs: all 500 P0001, 0 auth/public rows). **FAIL/RISK for same pending email**: `POST /auth/v1/signup` with the invited email new-coord-1@local.test (any password) returned 200 with a session (JWT app_metadata.role = Coordinator) and set `email_confirmed_at`/`last_sign_in_at` on the invited account; same for new-sup-1@local.test. No new user created, but an unauthenticated caller who knows a pending invitee's email obtains a staff session. Local config has `enable_confirmations = false` (supabase/config.toml line 226), which makes this immediate; with confirmations on it would probably only resend a mail, needs checking on staging config. Not a trigger bug: GoTrue treats signup on an invited-unconfirmed user as a re-signup. Possible fix: create staff users already confirmed (`email_confirm: true`) plus recovery/set-password link, or keep confirmations enabled. |
| 5 | Coordinator announcement path | N/A. No Coordinator UI reaches `createAnnouncement` (only `/admin`); not exercised. |

Local data left: auth/public users new-coord-1@local.test (Coordinator), new-sup-1@local.test (Supervisor, Local Test Company), Mailpit invites.

## Re-verify after 411df38 (2026-10-23)
Old accounts new-coord-1/new-sup-1 deleted via admin API first. Scripts in scratchpad `pw\r-*.cjs`; screenshots `r-1.png`, `r-2.png`, `r-3dup.png`, `r-3sup-dup.png`, `r-link.png`, `r-setpw.png`.

| # | Item | Result |
|---|---|---|
| 1 | Admin invites Coordinator new-coord-2; Coordinator creates Supervisor new-sup-2 | PASS. Both succeed ("Setup invitation sent"; supervisor dialog closes, row listed). Mailpit has "Reset your password" for each. `users` = Coordinator/active and Supervisor/active, 1 auth row each, coordinators=1 / supervisors=1, `pending_staff_invites` = 0. No console/page errors or 4xx/5xx. Both accounts are `email_confirmed_at` set, `last_sign_in_at` null. |
| 2 | Open emailed link, set password, log in | FAIL. Link: `http://127.0.0.1:57321/auth/v1/verify?token=...&type=recovery&redirect_to=http%3A%2F%2F127.0.0.1%3A3000%2Fauth%2Fcallback%3Fnext%3D%252Fauth%252Fset-password`. GoTrue verifies and 303s to `<redirect>/auth/callback?next=/auth/set-password#access_token=...&refresh_token=...&type=recovery` (implicit flow, tokens in URL fragment, no `?code=`). `app/auth/callback/route.ts` only handles `?code` (exchangeCodeForSession) and a fragment is invisible to the server, so it redirects to `/auth/sign-in?error=auth_callback_failed`; no session, never reaches /auth/set-password (`r-setpw.png`). Cause: `service.auth.resetPasswordForEmail` from the service client is not PKCE, unlike the cookie-based `createClient()` used by password-recovery.ts. Password login afterwards stays 400 (no password set). Also environmental: redirect host is `127.0.0.1:3000` (NEXT_PUBLIC_APP_URL / site_url) while the production build runs on 3100, so the raw link hits connection refused; I rewrote the host to 3100 to test the callback. Note I consumed the first mail tokens while diagnosing, then sent a fresh recovery to test. Fix suggestions: send the setup link via the PKCE server client, or generate `admin.generateLink` and a `token_hash` route using `verifyOtp`, or have the callback/set-password page read the fragment client-side. |
| 3 | Public signup with invited emails | PASS. Before any password set: `POST /auth/v1/signup` for new-coord-2 and new-sup-2 both returned 422 `user_already_exists` ("User already registered"), no session, no new rows, `last_sign_in_at` still null. |
| 4 | Duplicate email rollback | PASS. Admin: "Email address is already registered."; Coordinator: "Email already registered. No existing account was changed."; still 1 auth/public row each, pending_staff_invites 0. |

Local data left: new-coord-2 (Coordinator), new-sup-2 (Supervisor), no passwords set (coord-2 has had extra recovery mail sent).

## Re-verify after callback fix (2026-10-23)
Build on 127.0.0.1:3100. Scripts in scratchpad `pw\v-cb.cjs`, `pw\v-cb2.cjs`; screenshots `cb-*.png`. Setup mails were regenerated for new-coord-2 / new-sup-2 via GoTrue `/recover` (same implicit-flow link format as the invite mail); the redirect host 3000 was rewritten to 3100 (local quirk).

| # | Item | Result |
|---|---|---|
| 1 | Emailed link -> set password -> login | PASS (coordinator and supervisor). Link lands on `/auth/set-password` with a session; password saved, redirected to `/dashboard`; fresh-context password login works and shows the role dashboard (coordinator nav: Approvals/Students/Companies/...; supervisor nav: My Students/Attendance/Daily Reports/...). No page errors or 4xx/5xx. |
| 2 | Reuse same link | PASS. GoTrue redirects with `#error=access_denied&error_code=otp_expired`; finish page sends to `/auth/sign-in?error=auth_callback_failed`; 0 auth cookies, no crash. Minor gap: the sign-in page does not render the `error` query param, so no error message is shown to the user (silent redirect). |
| 3 | Forged `/auth/callback?next=//evil.com#access_token=bad...` | PASS. Goes to `/auth/callback/finish?next=%2Fdashboard` (unsafe next replaced), bad tokens rejected, ends on `/auth/sign-in?error=auth_callback_failed`; never left 127.0.0.1:3100. Same minor gap: no visible error text. |
| 4 | PKCE forgot-password (qa-supervisor) | PASS. UI shows generic confirmation; mail link redirects with `?code=...&next=/auth/set-password`; browser ends on `/auth/set-password` with password fields. |

Local data left: new-coord-2 and new-sup-2 now have password `NewPassw0rd!2026x` (local test only); qa-supervisor has a pending recovery session in a closed browser.
