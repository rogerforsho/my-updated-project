# Pre-launch deployment readiness audit

**Date:** 2026-10-11
**Decision:** **NO-GO** for production deployment
**Release scope reviewed:** Next.js web app and Expo Android app; production deployment was not attempted.

This report preserves the existing UI work. It records checks run from the current worktree and separates verified results from checks that need Docker, a browser/device, or production access.

## Verified checks

| Area | Result | Evidence |
|---|---|---|
| Clean dependency install | PASS | `npm ci` completed. npm warned that install scripts for `electron-winstaller` and `unrs-resolver` were not approved. |
| Automated regression/security suite | PASS | `npm test`: 66 tests passed, 0 failed; 35 migration/write-boundary checks passed; 44 isolated PostgreSQL policy checks passed. These checks did not use the remote database. |
| Staging backend preflight | PASS, limited | Four checks passed: security revision marker >= 33, private attendance-selfies bucket, atomic OTP function, and invalid rate-limit action rejection. The revision marker alone does **not** prove migration 034's policy exists. |
| Web production build | PASS | `npm run build:web` generated the application routes successfully. |
| Web lint | PASS with warnings | 0 errors, 36 warnings (mostly `any` typing and `<img>` optimization warnings). |
| Expo package compatibility | PASS | `npx expo install --check`: dependencies up to date; `expo-doctor`: 21/21 checks passed. |
| Mobile TypeScript | PASS | `npx tsc --noEmit` completed successfully. |
| Android JavaScript bundle | PASS, partial | `npx expo export --platform android` completed. This is not a signed APK/AAB or store/internal-track build. |
| Local web route smoke check | PASS, limited | Local built app: `/`, auth pages, certificate page, and `/ready` returned 200; `/dashboard` redirected unauthenticated users to `/auth/sign-in`; an unknown path returned 404. This was not the Docker staging build. |
| Compose configuration | PASS, parse only | `docker compose ... config --quiet` succeeded using the ignored staging env file. |
| Tracked-source secret scan | PASS, limited | No high-confidence service-key/JWT matches in tracked files. This did not inspect Git history or ignored local env files. |
| Payment feature | Not present in reviewed app/database source | No payment/checkout integration was found; this matches the stated application scope. |

## Launch blockers and unverified areas

### Dependency advisories — blocker

The refreshed registry scan reports **18 high and 8 moderate** advisories across the monorepo. `npm audit --omit=dev` reports **15 high** and no critical advisories. High findings include Expo/Metro/React Native build/runtime dependency paths, plus `braces`/`micromatch` and Next ESLint tooling. Current Expo SDK 57 and React Native 0.86.3 are the documented compatible major versions, and Expo reports the package set as aligned.

The current registry has no newer Expo 57 or React Native 0.86 patch release, and the reported `npm audit fix` suggestions downgrade to Expo 44 / React Native 0.72, which is not a safe remediation for this app. The current `node-forge` advisory affects versions through 1.4.0 and has no patched release listed; the current `braces` advisory likewise has no patched release listed. Do not force those suggested downgrades or suppress the CI audit gate. Reassess when upstream fixes are available and determine whether each affected package is present in a shipped artifact versus only in build tooling.

References: [node-forge GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv), [braces GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), [Expo SDK compatibility reference](https://docs.expo.dev/versions/latest/).

### Staging app and workflows — not verified

Docker Desktop was unreachable from this environment (`dockerDesktopLinuxEngine` pipe missing), and `http://127.0.0.1:3001/ready` was unreachable. Therefore the staging Compose container was not started here. The staging Supabase preflight passed, but the read-only SQL verification query for `student_complete_verified_attendance_timeout` was not run in this audit. The preflight script now says explicitly that this policy needs separate verification.

No complete role-by-role browser run is recorded for signup/email confirmation, login/reset, approvals, assignments, attendance, reports, evaluations, notifications, or document permissions. Mail delivery was configured previously, but successful delivery and links were not verified here. Mobile responsiveness, GPS behavior, and offline sync have automated coverage but still need physical-device confirmation.

### Resilience and production operations — not verified

Slow/interrupted-network browser testing and the selected 100-simultaneous-user load target were not run. Monitoring/alerting and backup restoration were not exercised. Production Supabase settings, RLS/grants, auth redirects, storage privacy, production secrets, host/domain, and recovery procedures remain unverified.

## Required follow-up before a GO decision

1. Start Docker Desktop and run the staging Compose stack. Confirm the web container is healthy and serving on `http://127.0.0.1:3001`.
2. Run `database/verification/launch_security_checks.sql` against staging. Inspect the 034 timeout policy expression and all expected privilege/RLS results; do not treat the revision marker alone as proof.
3. Use the seeded synthetic accounts to test each role’s key workflows. Verify signup confirmation, password reset, and notifications in the email sandbox. Do not share account passwords or service keys in chat.
4. Test the Android app on a physical device: login, location permission denial/grant, GPS attendance, offline time-in/time-out, reconnect/sync, invalid inputs, and interrupted network. Build an actual internal-test APK/AAB through the configured release workflow.
5. Run controlled staging network degradation and a 100-user load test; record latency/error results and the failure point. Avoid production load testing without a separate approved plan.
6. Obtain upstream fixes or a documented, reviewed risk disposition for high advisories before release. Keep the CI audit gate active.
7. Before production deployment, choose the Docker host/domain and verify a separate production Supabase project, production redirect allowlist, least-privilege database settings, secrets, monitoring, backup, and a successful restore drill.

Do not deploy while any high-severity dependency remains unresolved or while a critical workflow, authorization boundary, staging policy check, or production operational control remains unverified.
