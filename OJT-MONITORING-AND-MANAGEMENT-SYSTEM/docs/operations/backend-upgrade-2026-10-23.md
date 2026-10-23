# Backend reconciliation and production upgrade preparation

## Completed on 2026-10-23 (Asia/Singapore)

The failure was deployment drift: the app requested columns and RPC signatures absent
from the running databases. Revision 44 alone did not describe the current API contract.
Historical migration files were retained unchanged; no reset or production upgrade ran.

| Target | Result |
| --- | --- |
| App local API `127.0.0.1:57321`, Postgres `57322` | Applied 10 pending migrations through `20261024001100`; subsequent dry run reports up to date |
| Separate local Postgres `54322` | Initially upgraded this stack with 12 pending migrations, including the two October 21/22 migrations; it was not the API used by the app |
| Staging `xlkvjuwzcviicerpzdjz` | Applied 10 pending migrations through `20261024001100`; subsequent dry run reports up to date |
| Production `jhslfwczxkdhexjgssjr` | Read-only inspection/dry run only; revision 36 and divergent migration history |

The radius migration clamps existing company/branch geofences into 30–50 metres.
The app-local target is determined by the full URL including its port, not hostname alone.
Do not use the root workspace's local-stack configuration for the nested app by assumption.

## Verification

- `npm test`: 130 tests passed, followed by all policy/workflow regression scripts.
- Expanded `scripts/staging-preflight.cjs`: ten API checks passed on app-local and staging.
  It now checks password flags, staff import/invitation columns, incident reports,
  attachment columns, and the five-argument chat RPC in addition to revision/storage.
- `scripts/check-live-role-workflows.sql`: passed against both actual databases.
  It tests Admin AAL1/AAL2 visibility, student isolation and incident submission,
  department Coordinator acknowledgement/closure, tagged chat to the assigned
  Supervisor, Supervisor incident exclusion, and the student's final response view.
  All workflow writes execute inside a subtransaction that rolls back on success;
  assertion failures abort the statement. JWT claims are simulated here, not MFA enrollment.
- Staging real Supabase Auth sign-in and own-profile loading passed for seven existing
  synthetic accounts: Admin, three Coordinators, Supervisor, and two Students.
  The newer-by-modification-time saved credential file was stale; the other existing
  credential set worked. No passwords were printed or reset.
- Post-migration staging security advisors still report leaked-password protection
  disabled, a mutable search path on the revision function, and authenticated-callable
  SECURITY DEFINER functions. These are separate findings; intentional authenticated
  workflow RPCs require their internal authorization and must not be blindly revoked.

Repeat API checks without printing environment secrets:

```powershell
node --env-file=apps/web/.env.local scripts/staging-preflight.cjs
node --env-file=apps/web/.env.staging.local scripts/staging-preflight.cjs
```

Run the rollback-only SQL against local using `supabase db query --db-url` with the
confirmed local connection, or against staging using `--project-ref xlkvjuwzcviicerpzdjz`.
Read CLI help first. The SQL requires existing active ICS student placements and all
four roles; absent fixtures fail the check. Never use this workflow probe on production.

These checks do not verify browser screens, full invitation/email delivery, MFA device
enrollment, or physical-device GPS, camera, and offline synchronization.

## Production upgrade gate

The read-only production push dry run failed with `DbPushMissingLocalError`:

| Recorded production version | Similarly named repository version (not yet proven equivalent) |
| --- | --- |
| `20261016004614` | `20261016004509_architecture_security_and_async_email_queue` |
| `20261016035305` | `20261016035254_remediate_security_definer_api_findings` |
| `20261019073840` | `20261019073752_ojt_staff_account_category_and_capabilities` |
| `20261019073841` | `20261019073834_index_staff_capability_grant_actors` |

Production contains older objects without a complete repository migration history.
Do not run `migration repair --status reverted` merely because the CLI suggests it,
and do not run `db push --include-all`: either could replay historical migrations
against live data without proving compatibility.

Prepare the actual upgrade in this order:

1. Capture a fresh production schema, migration history including stored statements,
   Auth triggers, grants, policies, table counts, and separately verified Storage backup.
   Keep backup bytes/credentials outside Git. The earlier recovery evidence is in
   `production-data-reset.md`; that document's data-reset procedure is not this upgrade.
2. Restore that exact production snapshot to an isolated rehearsal database. Staging's
   clean repository history is not a substitute for production's historical schema.
3. Compare the four recorded migration bodies and resulting DDL to their candidate
   repository equivalents. Inventory every unrecorded base migration's effects.
   Only reconcile history where equivalence is demonstrated; write forward-only
   corrections for remaining DDL differences. Preserve existing rows and Auth identities.
4. Rehearse the reviewed reconciliation and ordered missing migrations on that restore.
   Check role conversion, department grants, assignment/branch backfills, historical
   attendance credits, certificate/finalization constraints, and geofence changes.
5. Require no pending migrations, the expanded API preflight, role/policy regression
   checks, real test-user sign-in, private Storage access, and email/invitation checks
   on the rehearsal. Record before/after counts and review security advisors.
6. Review the exact forward SQL and backup/restore procedure before scheduling the
   production upgrade. Use an explicit production reference for every command;
   coordinate application deployment with the schema change. A revision-only `/ready`
   response is insufficient release evidence.

Production is unchanged and is not upgrade-ready until this comparison/rehearsal is done.
