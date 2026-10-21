# Physical-device acceptance checklist — 2026-10-22

Run these checks only against the isolated QA/staging environment, using synthetic accounts and records. Never use production to test attendance, uploads, approvals, notifications, or destructive actions. A simulator/emulator can help debug but does not count as a physical-device pass.

## Test accounts

The staging QA seeder defines these synthetic logins:

| Role | Login |
| --- | --- |
| Super Admin | `qa-admin-20261010@example.com` |
| ICS Coordinator | `qa-coordinator-ics-20261010@example.com` |
| IBE Coordinator | `qa-coordinator-ibe-20261010@example.com` |
| Unscoped Coordinator | `qa-coordinator-20261010@example.com` |
| Supervisor | `qa-supervisor-20261010@example.com` |
| ICS Student | `qa-student-ics-20261010@example.com` |
| IBE Student | `qa-student-ibe-20261010@example.com` |

Use a Student login for mobile attendance tests. The Super Admin is a web/desktop-only role and must not be used to test student attendance. Exercise staff role boundaries from their intended client as a separate web/desktop acceptance pass.

The seeder generates random passwords; there is no shared default password. Do not put passwords in this checklist, source control, chat, or screenshots. When created, credentials are written to `%TEMP%\cdm-ojt-staging-qa-accounts-<timestamp>.txt`. The seeder requires `SUPABASE_URL` (or `NEXT_PUBLIC_SUPABASE_URL`) and `SUPABASE_SERVICE_ROLE_KEY`; provisioning additionally requires `--apply` and refuses account collisions. Use only the approved staging URL and its server-only key. Do not rerun provisioning to recover an existing password; if the original credentials file is unavailable, have the staging owner securely reset the synthetic account password.

## Before each device run

- [ ] Record tester, date/time/time zone, device manufacturer/model, OS version, app build identifier, and network type.
- [ ] Confirm the app's Supabase project is the isolated staging project (`xlkvjuwzcviicerpzdjz`), not production.
- [ ] Confirm the signed-in account is synthetic and its role matches the test.
- [ ] Use assigned test placement, HTE working hours, schedule, department, and required-hour target; do not substitute real student data.
- [ ] Confirm backend/Storage access and test email delivery are pointed at staging.
- [ ] Capture evidence with synthetic data only. Redact access tokens, passwords, student personal data, and location coordinates before sharing.
- [ ] Install the native development/preview build required for the camera module; Expo Go is not an acceptance build.

## Android physical-device checks

Run the complete list on at least one supported physical Android device and repeat on each additional Android form factor/OS version the institution intends to support.

### Install, launch, and account boundary

- [ ] Install a clean staging build and launch it without a crash or unresolved native-module error.
- [ ] Sign in as the ICS Student; confirm the student dashboard and correct role are shown.
- [ ] Sign out, sign in as the IBE Student, and confirm the account's own department/data is shown.
- [ ] Confirm a Student cannot open staff/Admin screens or another student's records through app navigation or a stale deep link.
- [ ] Reject invalid credentials with a clear message; do not leave a prior user's session or cached private data visible.
- [ ] Deny camera/location permission once, confirm the app explains why it is needed and offers a safe recovery path, then grant permission and retry.
- [ ] Confirm session restoration after app background/foreground and device restart; sign-out must remove the visible authenticated session.

### Attendance, camera, and location

- [ ] Start Time In during the assigned HTE's approved regular working hours; confirm the app captures one attendance attempt and shows its actual review/sync status.
- [ ] Start Time Out only after a valid Time In; confirm timestamps, direction, student, and assigned placement are correct.
- [ ] Tap Time In/Out repeatedly or submit twice; confirm duplicates/conflicts are surfaced and do not earn duplicate hours.
- [ ] Capture with the native front camera; confirm exactly one face is accepted when required, no-face/multiple-face cases are handled visibly, and no camera failure is reported as success.
- [ ] Check captured selfie preview and evidence upload; confirm the stored evidence is private and available only to authorized reviewers.
- [ ] Grant precise location; confirm one location sample and capture/receipt timestamps are associated with the attendance attempt.
- [ ] Grant approximate location or disable location services; confirm accuracy/availability is shown for human review and does not silently fabricate precise coordinates.
- [ ] Try an off-site capture; confirm it is flagged for review according to policy and is not automatically credited/rejected solely by GPS.
- [ ] Change location/camera permission in OS settings while the app is backgrounded; confirm the app recovers without a crash or stale permission assumption.
- [ ] Deny an attempted attendance action when the required connectivity is absent. No offline attendance record may be created; after reconnect, the user can retry deliberately without a duplicate.
- [ ] Change network during selfie upload; confirm the app reports pending/failure accurately and that retry does not create duplicate attendance or lose the evidence silently.
- [ ] Verify hours remain uncredited until the required supervisor review/approval is complete.

### Student tasks and notifications

- [ ] Open progress and confirm credited/remaining hours match approved staging records and the student's program target.
- [ ] Submit a staging report/document and confirm status, remarks, and upload result are visible.
- [ ] Open notifications from a valid link; confirm the link targets the student's authorized screen and the read/unread state persists.
- [ ] Confirm a Student cannot access another student's report, attendance, uploaded document, or notification by changing an identifier or reusing a URL.
- [ ] Switch Android app text/display size and use TalkBack on sign-in, attendance, error, and confirmation states; controls remain labeled and usable.

## iOS physical-device checks

Run the equivalent install, role, attendance, camera, GPS, network, task, and accessibility checks above on a physical supported iPhone/iOS version when an iOS development build and test device are available. In addition:

- [ ] Verify the iOS build installs, opens, and loads the native camera module (not Expo Go).
- [ ] Verify iOS camera and location permission prompts name the attendance purpose and respect denied/restricted states.
- [ ] Verify background/foreground, app termination/relaunch, Face ID/passcode lock, and network handoff do not expose another session or lose a pending operation silently.
- [ ] Confirm the displayed GPS accuracy matches the OS-reported precision and the captured/received timestamps are retained.
- [ ] Repeat screen-reader, text enlargement, contrast, and touch-target checks with VoiceOver and iOS accessibility settings.

## Policy acceptance checks using staging records

These are workflow acceptance checks from the physical-device session where possible; complete staff decisions from the authorized web/desktop client.

- [ ] A proposed schedule outside the HTE's stated regular working hours is not approved as a normal schedule.
- [ ] A hazardous night schedule is rejected unless the specialized curriculum's requirement and authorized approval are recorded.
- [ ] A schedule longer than five months in one semester is rejected.
- [ ] The student's exact program-specific required-hour target is used; do not enforce 600 or 1,200 as a universal limit.
- [ ] Concurrent academic overload is no more than six units, with the required verification recorded.
- [ ] The attendance/DTR record identifies the assigned student, date, time, placement, and immediate HTE supervisor's review/sign-off.
- [ ] Final-grade records expose the 60% HTE, 30% CDM, and 10% attendance/seminar components without inventing missing subweights or a 4-point-to-final-grade conversion.
- [ ] Terminal-report scoring captures each approved criterion separately on the four-point scale: student-outcome attainment, specialization alignment, reflection depth, and formatting/mechanics/timeliness.
- [ ] The HTE-issued COC due date is 14 calendar days after the final OJT hour.
- [ ] A COC is accepted only after checking the legal HTE name/address, student full name and program, assigned department, start/end dates, total hours, authorized printed signatory, and company seal/logo.
- [ ] A COC upload is tracked as HTE-issued evidence and is not confused with or replaced by the CDM platform certificate.

## Pass criteria and evidence

Mark a case **Pass** only when the expected result is reproduced on a physical device, the role boundary is checked, and a screenshot/log or staging record ID supports it. Mark it **Fail** when an action silently succeeds, creates duplicate/unapproved credit, leaks data across roles, invents a successful submission, or exposes private evidence. Mark it **Blocked** when a required device, OS build, staging account, email sandbox, or institution-approved grading rule is unavailable; record the owner and dependency instead of treating it as a pass.

For each failed or blocked item, record:

- checklist item and outcome (`Pass`, `Fail`, or `Blocked`)
- device/build/environment and test-account role (never its password)
- exact steps and expected/actual result
- synthetic record identifier and redacted evidence location
- assigned owner and retest result

Physical-device acceptance is complete only after all required Android and available iOS cases pass, all failures are fixed and retested, all blocked institutional decisions have an approved resolution, and the evidence is attached to the release candidate.
