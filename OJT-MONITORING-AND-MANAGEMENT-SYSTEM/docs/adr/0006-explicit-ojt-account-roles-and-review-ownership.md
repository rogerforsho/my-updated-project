# ADR 0006: Explicit OJT Roles and Review Ownership

**Status:** Accepted, 2026-10-20

## Decision

The system presents four account roles: OJT Student, Supervisor, OJT Coordinator, and Super Admin. Students use the mobile app only; Supervisors, OJT Coordinators, and Super Admins use the web portal or desktop wrapper. Existing internal role strings may remain for compatibility, but OJT Staff and Program Head are not user-facing application roles.

OJT Coordinators perform academic OJT work within explicit ICS and/or IBE grants. Supervisors work only with assigned students. They review attendance and approve or return daily accomplishment reports. Coordinators oversee requirements and exceptions and assign the final OJT grade. Super Admins manage account access and system settings without routine access to academic records or chat content. Two individual Super Admin accounts use MFA and recover each other; provider recovery is the fallback if both are locked out.

## Account lifecycle and reset safety

Students must verify their email and receive Coordinator approval before the account becomes active. Rejected students resubmit corrections through the same account. Coordinators and Supervisors receive single-use email setup invitations and choose private passwords. Password recovery uses a rate-limited one-time link to the verified email; student recovery stays within the mobile app.

An email collision must fail without deleting or changing the existing Auth identity or any linked records. Accounts with OJT history are deactivated rather than hard-deleted. The requested production purge is a separate, data-only operation that retains the schema and migration history; it may proceed only after production target confirmation, verified database and Storage backups, and an isolated restore rehearsal.

## Attendance and academic review

Attendance stores the device-captured event timestamp separately from server receipt timestamps. Offline events remain pending until a human reviews them; only verified events contribute credited hours. There is no maximum sync delay: a closed assignment does not block an event whose captured date falls within its placement dates. A Supervisor handles routine review for assigned students. A Coordinator may independently adjudicate a specific exception with a required reason and audit entry. There is no automatic approval or timeout approval.

The required pre-deployment gateway documents are the Pre-OJT Orientation Certificate and Endorsement Letter. Student ID front/back images are registration evidence, not gateway requirements. HTE verification may collect a Business Permit and/or MOA copy, but the app does not create or sign MOAs. Students may request an existing or new HTE; the Coordinator verifies and finalizes the company, branch, and Supervisor. Multiple approved branches and explicitly time-limited WFH/off-site approvals are supported. GPS is review evidence and does not automatically reject an event; Wi-Fi SSIDs are not collected.

Supervisors approve or return daily accomplishment reports. Coordinators oversee academic requirements and exceptions and assign final grades, without duplicating routine report approvals. Incident reports are Coordinator-only. Evaluation appeals preserve the original evaluation history. What-if scenarios are read-only and never apply speculative changes.

## Consequences

Authorization must be enforced in server actions, APIs, route guards, and database policies. A Coordinator attendance decision and its required audit entry commit in one database transaction. Role labels, onboarding, attendance state, and document checklists must be consistent across web, mobile, desktop, SQL migrations, and tests. Historical migrations remain immutable; corrections are forward-only. A production data reset must not use `supabase db reset --linked` and must preserve a separately verified copy of Storage objects as well as the database.

Supersedes the proposed OJT Staff consolidation in ADR 0005 and the role model in ADRs 0003 and 0004.
