# Coordinator and supervisor feedback: decisions

Status: agreed in a grilling session, 2026-10-28. Built on 2026-10-28: sections 1 to 8, including the invite link (ADR 0007: two uses, 7 days, revocable, department and company fixed). Section 4 turned out to be partly built already: coordinators could create supervisor accounts before this work. Section 9 produced a report only, in `navigation-audit.md`, and nothing was hidden.

Implementation notes:
- Migration `20261028000100_non_working_days_and_company_intake.sql` adds `non_working_days`, `companies.max_interns`, `companies.accepting_students`, the intake trigger and the supervisor RPC.
- `shared/expectedEnd.ts` computes the expected end date. `shared/whatIf.ts` is unchanged: it models a hypothetical weekly pace, which is a different question.
- The coordinator attendance page now has a read-only Timecard tab. The exception review (verify or reject with a reason) stays as a second tab, because removing it would drop an existing audited workflow.
- Coordinator departments are checked in the browser only for the theme; data access still comes from row security.

## Decisions

### 1. Coordinator attendance timecard
- Rework `coordinator/attendance` into a per-student timecard: date, time in, time out, daily hours, selfie and GPS status, late and absent flags.
- Read-only. Scoped to the coordinator's granted ICS or IBE departments.
- Filter by student, company and date range. Includes the same download as the Supervisor (see section 5).

### 2. Expected end date
- Computed as remaining hours divided by the student's daily schedule hours.
- Skips weekends, holidays and company days off.
- Recomputed automatically when attendance changes.
- One shared function used by web and mobile. It replaces the overlapping logic in `shared/whatIf.ts`.
- Rendered hours always count, including work on a holiday. Holidays only change the projected date. The existing hour-computation trigger stays untouched.

### 3. Holidays and days off
- New `non_working_days` table with a scope of global, department or company.
- Super Admin enters national (global) holidays once.
- Coordinators add department or company suspensions for their granted departments.

### 4. Account creation
- Students self-register and a coordinator approves them. Bulk import stays.
- Supervisor accounts can be created by both Super Admin and coordinators (coordinators for their own department's companies).
- This is a change from the current model and needs an ADR update. See the risks below.

### 5. Supervisor features (the HTE Supervisor in the notes is the existing Supervisor role)
- **Where deployed:** company, branch and address columns on `supervisor/students`, plus read-only placement history.
- **Graduated count:** Completed assignment with hours at or above the requirement. Shown as a stat per supervisor and per company, and as a filter.
- **Active and inactive:** two badges. One is the assignment status (ended or on hold). The other is a "no attendance in 7 days" flag.
- **Search:** name, student ID, course and status.
- **Download (replaces "print"):** the Supervisor can download a student's submitted reports and attendance records. Reports are the files students already uploaded, fetched through signed URLs. Attendance is exported as CSV (no new dependency), per student with a date range. No bulk download of all students for now. 


### 5a. Supervisor intake control (stop accepting new students)
- The Supervisor sets a maximum number of interns for their company or branch.
- The company closes automatically when active assignments reach that number.
- A manual "not accepting new students" switch closes it earlier.
- When closed: new assignments are blocked and the company is hidden in the assignment picker. Students already placed are not affected.
- The department's coordinators get an in-app notification when a company closes or reopens.
- There is no per-student approve or deny step. The control is at company level.
- The schema has no capacity field today. Migration 012 only has an index for capacity queries. The capacity and the switch need new columns, and the block must be enforced in the database (a trigger on assignment insert), not only in the UI.
- Capacity is per company, not per branch. Branches do not have their own limit.

### 6. Company invitation
- A coordinator generates an invite link with the department baked in.
- The company lands on Supervisor sign-up with ICS or IBE preset, so it reaches the right dashboard.
- No recruitment or MOA flow.

### 7. Strictly no multiple placement
- The database already enforces it: partial unique index `uq_active_student_assignment` (migration 012).
- New: the mobile company-request flow rejects a request when the student has an active placement.
- Not chosen for now: a friendlier UI error on assignment screens, and hiding placed students in the picker.

### 8. Department UI
- ICS is orange and IBE is blue, applied through CSS variables on the dashboard layout (sidebar accent, buttons, badges).
- A coordinator with both grants gets a department switcher, and the theme follows it.
- Super Admin and Supervisor use a neutral theme.

### 9. Clutter and unrelated features
- Audit first. For each page per role, compare it against the manuscript and recommend keep, hide or remove.
- Candidates: `what-if`, `map`, `branches`, `evaluations`, `supervisor-evaluations`, `incident-reports`.
- Nothing is deleted or hidden until the audit is approved.

## Risks and open items
- `AGENTS.md` bans features not in the capstone manuscript and excludes MOA and recruitment. Confirm that holidays, invite links and coordinator-created supervisor accounts are covered by the manuscript.
- Coordinator-created supervisor accounts conflict with ADR 0006 (Super Admin handles account provisioning). Needs a new ADR and RLS or authorization changes.
- The invite link needs an expiry and a single-use rule. Not decided yet.
- The "7 days" inactivity threshold is a default and is not configurable.
- I have not read the existing attendance page, `shared/whatIf.ts` or the per-role navigation. Check them before building.

## Suggested build order
1. `non_working_days` table and the shared expected-end-date function.
2. Coordinator attendance timecard.
3. Supervisor list: deployment, graduated, status badges, search, downloads.
3a. Supervisor intake control: capacity, pause switch, assignment block, notification.
4. Department theming and switcher.
5. Mobile placement guard.
6. Invite links and coordinator-created supervisors (needs the ADR first).
7. Navigation audit.
