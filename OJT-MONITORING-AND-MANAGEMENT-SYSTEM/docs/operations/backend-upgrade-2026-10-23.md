# Backend reconciliation and production upgrade preparation

## Read-only recheck on 2026-10-24 (Asia/Singapore)

CDM-OJT (`jhslfwczxkdhexjgssjr`) remains at security revision 36 with the same four
recorded migrations listed below. It has 25 public base tables, 17 Auth users, 13
application users, and 16 Storage object records. Of the current app tables checked,
only `staff_capability_grants` exists; `company_branches`, `company_requests`,
`pending_staff_invites`, `student_import_batches`, `incident_reports`,
`chat_attachments`, and `student_tags` are absent. CDM-OJT-Staging is at revision 44
with 30 public base tables and 68 recorded migrations. This confirms that the
production database is not aligned with the current app; it does not establish a
complete schema diff or prove a safe upgrade path.

The existing production recovery archive and manifest are dated 2026-10-21 and
remain on the same PC as their recovery key. They are not a fresh, independently
protected backup for this upgrade. No production migration was applied during this
check.

A fresh database export was made on the user's encrypted external `D:` drive under
`CDM-OJT-backup-2026-10-24`. The five SQL files are nonempty, the export's linked
project reference is `jhslfwczxkdhexjgssjr`, and its data COPY blocks contain 17
Auth users, 13 application users, and 16 Storage object metadata rows, matching the
live read-only counts. Its migration history contains the four live versions. This
does not prove the SQL can be restored; that check remains open before any production
change.

Storage object bytes were downloaded to `storage/` in the same folder (plus
`auth_schema.sql` and `storage_schema.sql`). Verified 2026-10-24: 16 files totalling
2,691,589 bytes, equal to the sum of `metadata.size` over the 16 `storage.objects` rows
in `data.sql`, with every object name present. One object
(`88888888-.../time_in_1787277747548.jpg`, 25 bytes) is a placeholder text file, not
an image; it matches production's metadata, so it is not a copy error. The backup is
still on one encrypted drive; an independent second copy has not been confirmed.

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
  credential set worked. No passwords were printety advisors still report leaked-password protection
  disabled, a mutable search path on the revision function, and authenticated-callable
  SECURITY DEFINER functions. These are separate findings; intentional authenticated
  workflow RPCs require their internal authorization and must not be blindly revoked.

Repeat API checks without printing environment secrets:

```powershell
node --env-file=apps/web/.envd or reset.
- Post-migration staging securi.local scripts/staging-preflight.cjs
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

| Recorded production version | Repository version with matching SQL body |
| --- | --- |
| `20261016004614` | `20261016004509_architecture_security_and_async_email_queue` |
| `20261016035305` | `20261016035254_remediate_security_definer_api_findings` |
| `20261019073840` | `20261019073752_ojt_staff_account_category_and_capabilities` |
| `20261019073841` | `20261019073834_index_staff_capability_grant_actors` |

Production contains older objects without a complete repository migration history.
On 2026-10-24, each production `supabase_migrations.schema_migrations.statements[1]`
was compared with its repository file plus the CLI's final CRLF. All four lengths and
MD5 hashes matched exactly. The SQL bodies are equivalent despite their different
timestamps; this does not prove the earlier unrecorded baseline or later migrations
are safe to replay. Preserve the four production history entries and reconcile their
version identifiers only in the isolated restore before any production history repair.
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

## Restore rehearsal results (2026-10-24, local Docker only)

The `D:` backup was restored into a throwaway `supabase/postgres:17.6.1.147` container
(`cdm-rehearsal`, port 57400): roles, auth/storage/app schemas, migration history, then
data with `session_replication_role=replica`. Counts match production: 17 Auth users,
13 app users, 16 storage objects, 4 migrations, 25 public tables. `db push --dry-run`
against the restore reproduces production's `DbPushMissingLocalError`. Gap: the
`pgmq.*transactional_emails` queue tables are not in the dumps, so queued-email rows were
not restored (the schema dump creates only the extension).

Renaming the four recorded versions to their repo versions (restore only) moves the error
to `DbPushMissingRemoteError`: 41 earlier repo migrations (001-035 plus five dated
20261012-20261019) have no history rows. They must not be replayed or marked applied
blindly. A clean database built from all 45 repo migrations up to
`20261019073834` (`cdm-clean`, port 57401) was diffed against the restored production
`public`/`private` schemas:

- Missing in production (28 objects): chat tables/functions/policies/trigger
  (`chat_conversations`, `chat_messages`, `send_chat_message`, ...), `qr_tokens`,
  `resubmit_student_registration`, the attendance assignment-date credit guard, server
  write-boundary policies on attendance/reports, and several announcement/QR policies
  and indexes.
- Present only in production (20 objects): legacy `locations`, `location_types`,
  `location_location_types`, `enable_rls_policies_version`, `public.set_updated_at`, and
  older policies (`programhead_read_*`, `read_own_*`, `student_insert_reports`, ...).

Conclusion: production's base schema is genuinely divergent, not merely behind. A
hand-reviewed forward-only reconciliation script is required (create the missing objects,
decide the fate of the legacy ones, then the 27 migrations after `20261019073834`).
This list is by object name only; column, constraint, grant and function-body
differences were not yet compared. Production is unchanged and not upgrade-ready.
The throwaway containers hold production data; remove them with
`docker rm -f cdm-rehearsal cdm-clean cdm-up` when finished.

### Rebuild rehearsal (2026-10-24) - PASSED locally, not yet run on production

Production data is test/demo data, so instead of reconciling in place, the rehearsal
rebuilt the schema from the repo and reloaded the data (container `cdm-up`, port 57401):
seed prod `auth`/`storage` base schemas, apply the 45 repo migrations through
`20261019073834`, load `data.sql` with `session_replication_role=replica`, then apply the
remaining 25 migrations (through `20261024020657`). Loading data *before* the 25 newer
migrations matters: `20261020230000_hte_branches_and_requests` backfills
`student_assignments.branch_id`; loading afterwards fails on the NOT NULL column.

Result: all 70 migrations applied with no errors. Of 58 tables in the backup, every row
count matches except the four legacy tables that the repo never had
(`enable_rls_policies_version` - 1 row, `locations`, `location_types`,
`location_location_types` - empty), which are dropped by design. Four company branches
were created, no assignment lacks a branch, no geofence is outside 30-50 m. Auth users
(17), app users (13) and storage objects (16) are unchanged.

Not verified in the rehearsal: the API preflight, the role-workflow SQL (needs fixture
placements/roles), real sign-in, Storage file access, email queue (not in the dumps),
or the apps themselves. These need the rebuilt copy attached to a running Supabase stack.

### Scripted rebuild: `scripts/rebuild-database.cjs` (rehearsed end to end 2026-10-24)

`node scripts/rebuild-database.cjs --mode rehearsal --backup <dir>` restores the backup into
a fresh Docker Postgres (`cdm-e2e`, port 57402) and runs the same rebuild production would.
Result: committed in one transaction; 70 migrations; 21 populated app tables match the
backup row for row; `auth.users` 17 / `storage.objects` 16 untouched; `supabase db push
--dry-run` reports "Remote database is up to date"; auth triggers, 15 storage policies,
RLS on every table, 4 branches, schema identical to the earlier manual rehearsal.

Safety built in: everything runs in one transaction with row-count audits, so any failure
rolls back with no change. Production mode refuses unless `REBUILD_DB_URL` contains the
`--project-ref`, a terminal is attached, the typed phrase `REBUILD <ref>` is entered, and
live `auth.users`/`public.users`/`storage.objects` counts equal the backup's (stale-backup
guard). Production run: `$env:REBUILD_DB_URL='<connection url>'; node
scripts/rebuild-database.cjs --mode production --backup <fresh backup dir> --project-ref
jhslfwczxkdhexjgssjr`. Remaining unverified: apps against the rebuilt data (sign-in,
selfie access, mobile), and the production connection path (pooler vs direct, TLS).

Original draft runbook (the script automates steps 3-4):

1. Announce a window; stop the production web deployment and mobile sync.
2. Take a new `supabase db dump` set and Storage copy immediately before (same commands
   as the `D:` backup); keep a second copy off the PC.
3. Against `jhslfwczxkdhexjgssjr` only: drop and recreate `public`, `private` and
   `supabase_migrations`; leave `auth` and `storage` data untouched.
4. Apply the 45 baseline migrations, load the public-schema data only (not `auth`),
   apply the 25 newer migrations, record versions in `supabase_migrations`.
5. Run the preflight, role checks, sign-in and Storage checks; redeploy web and mobile
   builds that match the schema.
6. Rollback: restore from the step 2 dump. The schema drop is not reversible otherwise.
