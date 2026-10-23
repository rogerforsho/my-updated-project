# OJT Monitoring System: Features by User Role

This lists what the code actually contains. Sources: `docs/system-overview.md`, `docs/testing/feature-matrix.md`, `AGENTS.md`, `apps/`, and `supabase/migrations/`. It is based on static reading plus the loop's browser checks; items the matrix still marks "partial" are called out. The earlier version of this file was a wish list; what it promised but the code lacks is in the last section.

Clients: Expo mobile app (students only), Next.js web portal (staff), a desktop wrapper that reuses the portal, and Supabase (Postgres, Auth, private Storage, RLS). Scope is 4th-year ICS and IBE students of Colegio de Montalban.

There are four roles: OJT Student, Supervisor, OJT Coordinator, Super Admin. There is no Program Head or OJT Staff role (older `program-head` routes and migrations are historical).

## 1. Super Admin (web)

- Admin console: user/account management, OJT Coordinator invitations (one or more department scopes), announcements, audit-log viewer.
- Coordinator accounts are created by email invite (`inviteUserByEmail`), not a temp password; a failed setup rolls the invited user back.
- Admin actions require an active Admin account and MFA level `aal2` (`AdminMfaGate`); MFA enrollment is explicit and resumable.
- No access to chat content or routine academic records (matches `AGENTS.md`; chat RLS allows only the two participants).

## 2. OJT Coordinator (web, limited to granted ICS/IBE departments)

- **Registrations:** review, approve, or reject student self-registrations (including resubmissions and ID-card images).
- **Student accounts:** bulk import from CSV with a per-row error preview (all-or-nothing); one-click password reset to the student number, with a forced change at the next mobile sign-in.
- **Companies (HTEs):** create companies and multiple branches with a map pin and geofence radius (30–50 m); decide student-submitted company requests with evidence view; create Supervisor accounts.
- **Placement:** assign students to company, branch, supervisor, and dates; review student schedule proposals; reassign students; set status (verified for DROPPED/INC/TERMINATED-type changes).
- **Monitoring:** department progress summary, attendance list, map view, submissions, and a "what-if" planning page.
- **Attendance exceptions:** adjudicate or override attendance with an audited reason (atomic).
- **Reports and evaluation:** review reports; view Supervisor evaluations; decide evaluation appeals as final arbiter; record the final OJT grade; clearance check (credited hours, approved final report, passing final evaluation); completion freezes attendance; issue certificates with public verification (`/verify-certificate`).
- **Messages:** chat with Supervisors (read receipts), file attachments (PDF, DOCX, DOC, JPG, PNG, 10 MB) and tags for students of the shared placement; notifications.
- **Incident reports:** receive confidential student concern reports, acknowledge them, and close them with a response the student can read.
- Departmental reports page with export code (PDF/Excel output not fully verified).

## 3. Student (mobile app only)

- Registers with program details, privacy consent, and front/back ID images; waits for Coordinator approval; can resubmit; password recovery through the server.
- Selects an existing company or requests a new one (modal); proposes a schedule.
- **Attendance:** time-in/time-out with GPS and a selfie (native face detection, needs an Expo development build); out-of-bounds entries are flagged; a note can be added; offline queue with auto-sync, and synced items are marked pending verification; server receipt time is stored separately from device time; future-dated and out-of-assignment credit is blocked; lunch overlap handling; forgotten time-out is closed server-side and held for review.
- **Reports:** daily accomplishment reports with uploads (PDF, JPG, PNG, DOCX, 10 MB, validated); supervisor feedback.
- **Report a concern:** confidential incident report readable only by the department OJT Coordinator (not anonymous).
- Progress and hours, evaluation results, appeals of evaluations (submission path not fully traced), notifications and announcements, profile/settings.
- Certificate view on the web side after clearance.

## 4. Supervisor (web)

- Dashboard of assigned students.
- Attendance review: Verify or mark Disputed (stored as Rejected).
- Daily reports: approve or return with required feedback.
- Midterm and final evaluations on a 1–5 scale; a comment is required for scores below 3 (verified).
- Text chat with the Coordinator, notifications.
- Off-site/schedule dates are finite (migration `finite_offsite_schedule_dates`); the approval UI is only partly traced.

## System-wide

- Row Level Security on all data, trusted-actor checks, server-mediated student writes, rate limits on auth and submissions, explicit API privileges.
- Audit logs written and viewable by Super Admin.
- Transactional email queue processed by an internal route.
- Private storage with signed URLs; reports and selfies are not public.
- Offline mode is limited to mobile attendance (per `AGENTS.md`).
- Health and readiness endpoints.

## Described earlier but NOT in the system

Confirmed absent by code search, so do not present these as features:

- Excel (.xlsx) student import (CSV import exists).
- Auto-created student accounts with Student-ID usernames (imports use the student's email to sign in).
- Mock-location detection, WiFi SSID fallback, "OUTSIDE – INVALID" label, Emergency/Early Out, WFH mode, 5 km off-site expansion.
- Errand auto-approval, Supervisor geofence-adjustment request, Supervisor PIN (chat or offline approval).
- Auto-approval after 48 h, escalation reminders, SMS notifications or fallback, push-notification code.
- Primary/secondary geofences, 100–500 m radius rule (code allows 50–5,000 m).
- Chat extras: quick actions, templates, pins, search, broadcast, response-time red flags, mute/report, 5-minute recall, unassigned-student warning, tamper-proofing.
- Weekly auto-compiled reports, LATE flag, report revision requests, DRAFT watermark, version history and edit locking.
- Anonymous incident reports (reports are confidential but identify the student to the Coordinator).
- Seeded primary/backup Super Admin, in-app backups, soft delete with 30-day recovery (backups are done in the Supabase project).
- Multiple coordinators with auto-assigned backup; multi-supervisor score averaging is unverified.
- Super Admin chat viewing or flagged-chat review (deliberately dropped).
