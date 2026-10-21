# OJT Role and Workflow Redesign

**Status:** Approved implementation complete locally; device behavior and production release gates remain
**Source of truth:** [ADR 0006](../adr/0006-explicit-ojt-account-roles-and-review-ownership.md)

## Account roles and clients

The user-facing roles are OJT Student, Supervisor, OJT Coordinator, and Super Admin. Students use the mobile app only. Supervisors, Coordinators, and Super Admins use the web portal or desktop wrapper. The database may keep compatible internal role strings, but UI, policies, tests, and onboarding must resolve to the four approved roles. OJT Staff and Program Head are not application roles.

OJT Coordinators have explicit ICS and/or IBE academic grants. They handle student registration approval, requirements and placement oversight, attendance exceptions, academic review, and final OJT grading within their grants. Supervisors see only assigned students, review attendance, approve or return daily accomplishment reports, and submit evaluations. Super Admins manage accounts and system configuration; they do not access routine academic records, student files, attendance, or chat content. Two individual Super Admin accounts use MFA; each can recover the other, with provider recovery if both are locked out.

## Account and data safety

- Student registration creates a pending account; email verification and Coordinator approval are both required before active use. Rejected students correct and resubmit through the same identity.
- Provisioned Coordinator and Supervisor accounts receive one-time email setup invitations and choose their own passwords. No shared, default, birthday-derived, or administrator-issued passwords.
- Recovery uses a rate-limited one-time link sent to the registered email. Student recovery remains in the mobile app, including the return from the link to the app.
- An email conflict fails without deleting or changing the existing Auth account, public profile, or linked OJT records. Bulk creation must report conflicts and leave those identities untouched.
- Accounts with OJT history are deactivated rather than hard-deleted.
- The requested production reset is data-only: remove existing Auth users/emails and linked OJT/company/demo records and stored files, while retaining schema and migration history. Do not execute it until the exact production project reference is confirmed, database and Storage-object backups are verified, and a restore has been rehearsed in an isolated project.
- Super Admin backup access is provider-side backup/restore guidance and audit metadata. The application must not export academic records to an administrator workstation. Supabase database backups do not contain Storage object bytes, so those require a separate backup.

## Student preparation and placement

The two required pre-deployment documents are the Pre-OJT Orientation Certificate and Endorsement Letter. Student ID front/back images support registration identity review; they are not additional gateway requirements. HTE verification may collect a Business Permit and/or MOA copy as evidence. The system does not create, send, or sign an MOA.

A student may select an existing Host Training Establishment or request that a new HTE be added. The Coordinator verifies the request and finalizes the company, approved branch, and Supervisor assignment. Companies may have multiple approved branches. Work-from-home or off-site work requires an explicit, time-limited approval. GPS is evidence for human review and does not automatically reject a record; do not collect Wi-Fi SSIDs.

## Attendance and review ownership

A mobile attendance action records device-captured event time separately from the server receipt time for each event. When an offline event syncs, it remains pending and earns no credited hours until a human reviews its evidence. Supervisors review assigned students' routine attendance. Coordinators may adjudicate a specific exception when needed, with a required reason and audit entry committed in the same database transaction as the decision. The department-scoped Coordinator attendance screen shows captured and server-received times plus photo evidence. There is no automatic approval and no approval by timeout. Offline events have no maximum sync delay; a closed assignment does not block an event whose captured date falls within that assignment's placement dates.

Verified attendance alone contributes credited hours. The existing approved schedule lunch interval is excluded from the credited total. Event time is not silently replaced by the sync time; supervisors can see both timestamps when reviewing delayed syncs.

The mobile attendance screen uses `@rbayuokt/expo-face-vision` to detect exactly one face in the live camera preview and keeps the shutter disabled until the face meets the configured guide. The Android arm64 debug APK compiles and includes the native package under Expo 57, but camera behavior has not been exercised on a physical device. The package's published peer range is broad, while its development app targets Expo 55; hardware behavior still needs validation. Face presence does not identify the student or prove liveness. The current mobile environment points at production, so use a staging project for app testing and avoid test records in production.

## Reports, evaluation, and support

Supervisors approve or return daily accomplishment reports and provide feedback. Coordinators oversee academic requirements and exceptions and assign the final OJT grade on the institutional 1.00–5.00 scale after both Supervisor evaluation stages pass and no appeal is pending. Grades 1.00–3.00 pass and finalize the OJT record with a completion certificate; grades above 3.00 remain recorded but do not complete OJT. Finalization locks attendance, reports, evaluations, appeals, progress, schedules, and assignments. The grade is available to the student and authorized Coordinators, not on public certificate lookup. Do not make the same daily report pass through two routine approval queues. Student incident reports are visible to the Coordinator and hidden from Supervisors, companies, and other students. Evaluation appeals are supported while preserving the original evaluation history until OJT is finalized.

What-if analysis is read-only: a scenario may display projected effects but cannot mutate assignments, attendance, schedules, or grades. No scenario option automatically applies changes.

## Implementation sequence

1. Replace unsafe Auth collision behavior and role labels with forward-only, non-destructive migrations.
2. Finish invitation setup and mobile-only student recovery; remove administrator-issued passwords and direct academic exports.
3. Enforce four-role authorization and Coordinator department grants across server actions, APIs, RLS, route guards, and client navigation.
4. Separate device event time from server receipt time and keep every offline sync pending for human review.
5. Align the two-document checklist, HTE verification/branch placement, report review ownership, incidents, appeals, and read-only scenario analysis with the approved workflow.
6. Verify account-role boundaries, migration/write boundaries, offline retries after assignment closure, atomic attendance exceptions, report decisions, and local builds. These checks pass locally. Still exercise camera behavior on a physical Android device, build and exercise a physical iOS app, reconcile and rehearse production migrations against an isolated restore, and complete the approved production reset only after its recovery gate passes.

## Completion criteria

- Only the four approved user-facing roles are available, with students restricted to mobile and all other roles to web/desktop.
- Existing records cannot be deleted or reassigned by an email collision or account deactivation.
- Student activation requires both verified email and Coordinator approval.
- New Coordinator and Supervisor accounts use single-use setup invitations; passwords are chosen by account owners.
- Coordinators are limited to selected ICS/IBE grants and Supervisors to their active assignments.
- Offline attendance preserves event and server receipt times, syncs events within historical assignment dates after closure, requires human approval, and credits hours only when verified.
- A Coordinator attendance exception decision and its required reason/audit entry commit or roll back together.
- The live mobile camera preview detects exactly one face before enabling capture on an Expo 57 Android build and a physical iOS build; the check does not claim identity or liveness.
- The two gateway documents, HTE evidence, report decisions, incident privacy, evaluation appeals, and scenario simulations follow the approved ownership rules.
- The production reset remains data-only and is backed by a verified database plus Storage recovery set and successful isolated restore rehearsal.
