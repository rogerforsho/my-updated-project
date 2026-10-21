# Production data reset gate

**Target:** `CDM-OJT` / `jhslfwczxkdhexjgssjr` (ap-southeast-1)  
**Intent:** remove existing Auth users/emails and linked OJT, company, demo, and Storage data while preserving schema and migration history.  
**State:** not executed; local backup and isolated restore have been checked, but the recovery set still needs an independent protected copy and the remaining gate items below.

## Read-only inventory captured before the reset

Production is active and contains real Auth and application records. Read-only SQL reported:

| Data | Rows/objects |
| --- | ---: |
| `public.users` | 13 |
| Students / Supervisors / Coordinators / Program Heads / Admins | 6 / 3 / 3 / 0 / 1 |
| Companies / student assignments | 4 / 1 |
| Attendance / reports / evaluations | 0 / 0 / 0 |
| Notifications / audit logs / certificates / schedules | 7 / 50 / 0 / 1 |
| Staff capability grants | 7 |
| `storage.objects` metadata rows | 16 |

These are a dated pre-reset snapshot, not a live count. Re-run the inventory immediately before any approved reset and reconcile every difference. Database backups do not contain Storage object bytes.

## Latest read-only production check

On 2026-10-20, the connected Supabase API confirmed that `CDM-OJT` is `ACTIVE_HEALTHY`, in `ap-southeast-1`, running PostgreSQL 17.6.1.147. Its recorded migration history currently contains only:

- `20261016004614` — `architecture_security_and_async_email_queue`
- `20261016035305` — `remediate_security_definer_api_findings`
- `20261019073840` — `ojt_staff_account_category_and_capabilities`
- `20261019073841` — `index_staff_capability_grant_actors`

The production security advisor also reports five RLS-enabled public tables with no policies (`auth_rate_limits`, `enable_rls_policies_version`, `location_location_types`, `location_types`, and `locations`) and warns that leaked-password protection is disabled. These are findings to assess against the actual access paths before launch; this check did not inspect their data or change settings. The migration list is not a schema diff, so it does not prove that production matches those migrations.

The snapshot predates the local HTE branch/request migration. The final inventory must also count `company_branches` and `company_requests`, and identify Business Permit/MOA objects stored under student report paths.

## Required recovery gate

Do not issue delete SQL, delete Auth users, remove Storage objects, apply migrations, or use `supabase db reset --linked` against production until every item below is recorded and verified:

1. In the Supabase Dashboard, confirm the project name and Reference ID are `CDM-OJT` and `jhslfwczxkdhexjgssjr`. Confirm the same project is selected in any CLI session.
2. Create a provider database backup or export and record its timestamp, project reference, and immutable location. Confirm the backup is readable.
3. Separately copy all Storage object bytes and record bucket, path, object count, and checksum information. The 16 metadata rows alone are not a file backup.
4. Restore the database backup into an isolated project. Restore representative Storage files from the separate copy. Verify schema, Auth identities, linked rows, policies, and file readability; record the rehearsal result.
5. Re-run the inventory, inspect migration history and foreign-key cascades, and prepare a data-only deletion order that preserves migration history and required reference data. Review every table and bucket in that order against the actual production schema.
6. Before releasing mobile recovery, add `cdm-ojt-monitoring://auth/reset-password` to the intended Supabase project's Auth redirect allowlist and verify a reset link returns to the installed app.
7. Keep the database and Storage recovery set immutable until post-reset validation is complete.

## Recovery evidence recorded on 2026-10-21

- The CLI link was checked against production reference `jhslfwczxkdhexjgssjr`. Database exports (`roles.sql`, `schema.sql`, `data.sql`) were copied to `C:\Users\Ralph\ojt-recovery-2026-10-21` outside Git. The migration schema and data were exported there separately as `history_schema.sql` and `history_data.sql`.
- All 16 production Storage objects were downloaded from `attendance-selfies`; `private-documents` had no objects. `manifest.csv` records paths, byte lengths, and SHA-256 hashes for nine SQL files and 16 object files. Rechecking all 25 entries found zero mismatches. Each downloaded object's path and byte length matched production metadata; total object bytes were 2,691,589.
- Separate `auth_schema.sql` and `storage_schema.sql` exports preserve managed-schema definitions omitted by the standard schema dump. The extracted `auth_triggers.sql` and `storage_policies.sql` contain three production Auth triggers and 12 production Storage policies. These were applied successfully to the isolated restore; its counts now match production. The full managed-schema dumps are reference material, not scripts to apply over an existing Supabase service schema.
- A separate local Supabase rehearsal using CLI 2.121.0 restored the schema, all nonempty database data, and four migration-history entries. Production and the restored database each had 17 Auth users, 13 application users, 16 original Storage metadata rows, four companies, one assignment, 25 public tables with RLS, and 126 public policies. A copied photo was uploaded under a local `recovery-test/` path, downloaded again with the same SHA-256 hash, and opened as an image.
- The rehearsal used a newer local Postgres/Supabase image than production. It omitted 35 **empty** `COPY` blocks whose platform tables differ locally; assertions retained all nonempty blocks. The `roles.sql` settings were not applied because the local platform reserves `supabase_admin`. The original export files were not edited. Rehearsal logs and the adapted test copy are under `C:\Users\Ralph\ojt-recovery-2026-10-21\rehearsal-current`.
- The 25 backup files and manifest were marked read-only against accidental edits. An AES-256 GPG archive at `C:\Users\Ralph\ojt-recovery-2026-10-21\recovery-2026-10-21.tar.gz.gpg` contains those 26 files. Decrypting it reproduced the source archive hash. Its recovery key is currently stored separately at `C:\Users\Ralph\ojt-recovery-2026-10-21\recovery-key.txt`; the owner must save that key outside this PC before the encrypted archive can serve as an independent recovery copy.
- Only the C: drive is mounted. A personal OneDrive sync folder exists, but its suitability for student records has not been approved or its remote sync verified. The unencrypted recovery folder and encrypted archive are still on the same computer; Windows read-only attributes are not immutable storage. Backblaze B2 was unavailable to the owner. Keep the production reset blocked until a second approved protected copy is verified, the final inventory and deletion order are reviewed, and the remaining redirect and migration checks above pass.

## Schema reconciliation required before reset

Production's applied migration history does not match the repository's Supabase migration set. The repository has two migration directories; they are not yet a single reconciled history. The current production schema still contains legacy Program Head/OJT Staff role behavior and legacy permissive policies. Do not infer that applying the newest local migration alone will safely upgrade production. Compare actual production DDL and migration history with each forward migration, resolve missing/duplicate versions in a reviewed migration, then test it on the isolated restore.

Apply schema changes separately from the data reset. Retain schema objects, migration history, Auth triggers/functions, required reference data, and Storage bucket configuration. Do not delete `auth.users` before reviewing every foreign key and trigger in the restored production schema.

## After the reset

- Delete HTE request records and linked student workflow rows before deleting students or companies. Delete practicum schedules and student assignments before company branches/companies because branch foreign keys restrict deletion. Remove request evidence and other private-document Storage objects using the verified object inventory; database deletion does not remove object bytes.
- Confirm all intended prior Auth accounts are gone and no unrelated account was removed.
- Confirm linked OJT/company/demo records and Storage object bytes are gone as specified, while schema and migration history remain.
- Provision the two named Super Admin identities through individual one-time invitations; verify each account independently enrolls and completes authenticator MFA before ordinary operations.
- Re-run Supabase security/performance advisors, RLS boundary checks, and account onboarding tests before opening student registration.
- Retain the recovery set until the owner confirms post-reset checks.
