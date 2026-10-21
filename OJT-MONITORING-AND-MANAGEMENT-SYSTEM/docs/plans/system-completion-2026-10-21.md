# System completion plan — 2026-10-21

## Definition of 100%

Every approved functional requirement in `systemrules/rules/docs/4. REQUIREMENTS.md` works for the intended role and client, its authorization and data effects have been checked, and the web, mobile, desktop, database, and release paths have passed the required real-environment checks. A screen, migration file, or passing isolated test alone does not close a requirement. The release decision stays **NO-GO** until the gates below pass.

This plan covers the **66 numbered functional requirements** in 16 groups, the nine increments in `AGENTS.md`, and the evaluation and release checks in `systemrules/rules/docs/13. TESTING.md` and `PRE-LAUNCH-AUDIT-2026-10-11.md`. The earlier ~70% estimate is provisional; this ledger does not turn it into a measured percentage.

## Current evidence

| Check | Result through 2026-10-22 | Limit |
| --- | --- | --- |
| `npm test` | Pass: 95 Node tests, 86 migration/write-boundary checks, 44 isolated PostgreSQL policy checks, and the remaining workflow scripts | No remote database or physical device |
| Web lint and TypeScript | Pass: 0 lint errors, 35 warnings; TypeScript passes | Does not prove user flows |
| Mobile TypeScript, Expo compatibility, Android JS export | Pass; `expo-doctor` 21/21 | No installed APK, iOS build, camera, or GPS test |
| Web production build and local HTTP smoke | Pass; local `/ready` is 200, protected `/dashboard` redirects, unknown path is 404 | Local recovery database is a production-data clone; avoid synthetic writes there |
| Windows desktop package | Builds installer and portable EXEs | EXEs are not Authenticode signed; installation and workflow not exercised |
| `npm audit --omit=dev --audit-level=high` | Fail: 15 high advisories, all in the Expo/Metro/React Native dependency chain | Registry currently offers `node-forge` 1.4.0, `braces` 3.0.3, and `micromatch` 4.0.8, which remain in the reported affected ranges; automatic fixes mostly downgrade Expo/React Native major versions. Classify by shipped artifact before an owner decides release risk |
| Local verification rerun (2026-10-22) | Pass: `npm test`, web lint/typecheck/build, mobile typecheck, Expo Doctor 21/21, Android JS export with CI-only placeholder configuration, and Windows desktop package build | Web lint has 35 warnings; Android export is not an installed APK; desktop signature and the dependency audit remain release blockers |
| Isolated cloud staging | New `CDM-OJT-Staging` project `xlkvjuwzcviicerpzdjz`; all 57 repository migrations applied, security revision 43, five preflight checks pass; staging web `/ready` and sign-in return 200 | The previous `qkxxiqozqmrsczawrtcp` configuration was replaced locally; a healthy endpoint does not prove complete workflows |
| Staging QA identities and role boundary | Seven synthetic accounts and two student placements seeded; all seven sign in, read their own profile, and see the expected 0/1/2 students by role and department | Only the profile and student SELECT boundaries were tested through Auth and PostgREST; full workflow and UI tests remain open |
| Staging signed-in web routes | Admin, Coordinator, and Supervisor dashboards and own-role pages return 200; tested cross-role pages redirect as unauthorized; Student web routes redirect to mobile-only | HTTP and session-cookie checks do not prove interactive browser behavior or Admin MFA |
| Staging launch security metadata | 19/19 required functions, 8/8 RLS tables, 15/15 restrictive policies, 2 private buckets, revision 43; expected grants and old-policy removal confirmed | Metadata checks do not prove each policy's runtime behavior |
| Connected production metadata (read-only) | Security revision 36; app requires 43. HTE branch/request tables absent; selfie and document buckets private. Only four migration-history entries returned. | This is not a full schema diff or authorization test |
| Worktree | 223 changed/untracked entries before this plan | Current local state is not a committed release candidate |

## Functional verification ledger

All groups have candidate UI/service/database code. “Open” below means the complete approved behavior has not yet been demonstrated in a suitable staging environment. Close each group only with a recorded role-by-role test and any indicated hardware or institutional evidence.

## Institution-provided policy clarifications — 2026-10-22

Use the institution-provided rules for schedule, evaluation, and HTE Certificates of Completion (COCs) as acceptance criteria. The physical-device procedure is recorded in [the device checklist](./physical-device-test-checklist-2026-10-22.md).

- OJT must be scheduled within the HTE's regular working hours. Do not impose a hazardous night shift unless the specialized curriculum specifically requires it. The schedule must not exceed five months in one semester. The exact hour target is program-specific; 600–1,200 hours is typical guidance, not a universal minimum/maximum. Concurrent academic overload during OJT must not exceed six units.
- Attendance must be recorded in the official DTR/attendance record and signed by the immediate HTE supervisor.
- Final grade components are HTE performance 60%, CDM institutional evaluation 30%, and attendance/seminar participation 10%. The CDM component covers weekly progress reports, bi-monthly journals, and the terminal report. The terminal report uses the four named criteria on a 4-point scale. Do not invent subweights or a conversion from that scale to the final-grade scale; keep scores separate until CDM approves the calculation rules.
- The HTE, not the CDM application, issues the COC within 14 calendar days of the student's final OJT hour. Track and verify the HTE-issued evidence separately from the CDM platform certificate. Check the legal company name/address, student's full name and program, assigned department, start/end dates, completed hours, authorized printed signatory, and company seal/logo.
- Offline attendance remains an explicit product-policy conflict in the repository. Until the approved requirement is changed, use `FR-ATT-008` as the acceptance source: attendance requires connectivity, and offline attempts must not create attendance records.

| Requirement group | Count | Remaining proof |
| --- | ---: | --- |
| `FR-AUTH-001–008` | 8 | Registration, confirmation email, Coordinator approval, account collision, password recovery, four-role routing, Admin MFA |
| `FR-APP-001–005` | 5 | Profile and exactly two gateway documents; Coordinator review; proposed and approved schedule against institution rules |
| `FR-COMP-001–006` | 6 | HTE request/evidence, branch verification, scoped placement, Supervisor assignment and reassignment |
| `FR-ATT-001–010` | 10 | Online/offline time in/out, duplicate/conflict handling, historical assignment dates, pending human review, credit only after approval |
| `FR-GPS-001–003` | 3 | Physical-device permission, accuracy, captured/received timestamps, off-site notes |
| `FR-SELFIE-001–005` | 5 | Native front camera, exactly one face, watermark, visual evidence, triage and batch review on real devices |
| `FR-PROG-001–006` | 6 | Live credited-hour calculation, remaining hours, completion/grade rules, read-only final records |
| `FR-REP-001–004` | 4 | Real private file upload, status/remarks, assigned Supervisor daily review, Coordinator exceptions |
| `FR-INC-001` | 1 | Department-scoped Coordinator access and Supervisor exclusion for incidents |
| `FR-EVAL-001–003` | 3 | Institutional rubric, midterm/final Supervisor decisions, preserved appeal and final grade |
| `FR-NOTIF-001` | 1 | Delivery, links, inbox state, and role-scoped alerts |
| `FR-ANNC-001` | 1 | Admin and department-scoped Coordinator broadcasts |
| `FR-CHAT-001–008` | 8 | Two-user live delivery, eligible pair, archived read-only history, unread state, generic notification, role boundaries |
| `FR-MON-001–002` | 2 | Live ICS/IBE scoped summaries against seeded cohort data |
| `FR-ADMIN-001–002` | 2 | Admin MFA, account/system actions, and denial of routine academic/chat access |
| `FR-SCENARIO-001` | 1 | Scenario results and proof that source records do not change |

## Agent work — local or once isolated staging is available

1. **Close the automated gates.** Keep the current passing tests, lint, TypeScript, web build, Expo compatibility/export, and desktop build repeatable. The deployment workflow now runs the existing high-severity audit and mobile typecheck; the general verification workflow also runs mobile typecheck. Verify these workflows in GitHub after the current worktree is reviewed and pushed.
2. **Reconcile database history safely.** Compare production DDL/policies and the four recorded migration entries with the repository's two identical migration directories. Build a forward-only upgrade, then run it against a fresh isolated restore and test data preservation and rollback. Do not apply migrations to production or replay `001–025` there.
3. **Finish staging verification.** The new isolated project, 57 migrations, five preflight checks, seven synthetic accounts, web readiness, and the launch security metadata checks are in place. Exercise data-changing flows only in this project, and inspect policy definitions and actual denied operations for each role. Keep the production CLI link and data untouched.
4. **Exercise every role flow on synthetic staging accounts.** Record the UI action, API/database effect, denied cross-role access, and response for the 16 requirement groups above. Test email confirmation/recovery and private document links using a mail sandbox.
5. **Verify mobile and desktop artifacts.** Build an internal Android APK and iOS build using the intended isolated environment; run attendance, camera, GPS, offline/reconnect, and denial cases on physical devices. Install and exercise the desktop wrapper against staging. Check packaging signatures if the desktop EXEs will be distributed outside controlled testing.
6. **Resolve release advisories.** Classify each of the 15 high production advisories by shipped artifact and affected path. Apply compatible patched versions where available, rerun Expo compatibility and builds, and leave any unpatched risk for an explicit release decision. Do not accept the suggested Expo 44 / React Native 0.72 downgrades without a compatible migration.
7. **Run resilience and quality checks.** Test the specified 100-simultaneous-user target on isolated staging, degraded/interrupted network behavior, desktop browsers, mobile form factors, accessibility, and role-based usability. Record results against the testing plan.
8. **Prepare release operations.** Verify host/domain, environment separation, auth redirect allowlist, monitoring/alerting, backup and Storage restore, secret handling, and production rollback. Rerun security advisors and the full staging acceptance suite before a GO review.

## Need your attention

1. **Independent protected recovery copy:** Save the encrypted production recovery archive and its key separately from this PC in an institution-approved location; confirm that the copy can be retrieved and decrypted. The existing local rehearsal does not provide an independent copy.
2. **Production data reset decision:** After a reconciled forward migration and recovery gate are documented, review the exact target, data-only deletion order, and final inventory. Explicitly authorize any deletion/reset; real Auth and student records exist.
3. **Institutional acceptance:** Confirm the approved schedule rules, evaluation form/rubric, grade and certificate wording, role workflows, and selected ICS/IBE evaluators. Record their task-completion and usability results.
4. **Physical devices and release identity:** Provide/authorize Android and iOS test devices or testers, Expo/EAS access where needed, and any desktop signing identity required for distribution. Confirm the mobile recovery deep link in the intended Supabase Auth redirect allowlist.
5. **Mail and hosting:** Supply a test mail service for confirmation/recovery delivery and confirm production host/domain, monitoring/backup owners, and who can accept or defer any high dependency advisory with evidence. A production release remains blocked while the audit gate fails or critical workflows are unverified.

## Exit criteria

- All 66 requirements have a dated pass, or a documented approved scope change, with evidence from the correct role and client.
- Staging runs the reconciled migrations and passes database/RLS, mail, private Storage, web/mobile/desktop, device, browser, load, and recovery checks.
- Production environment and protected recovery copy are verified; any destructive reset has separate explicit approval and post-action validation.
- High-severity dependency findings are fixed or receive a documented owner decision; the deployment gate and required CI checks pass on the release commit.
- The institution's evaluators accept the workflows and the release owner records a GO decision.
