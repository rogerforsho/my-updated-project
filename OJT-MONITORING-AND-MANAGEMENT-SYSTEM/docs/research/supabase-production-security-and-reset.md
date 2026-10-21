# Supabase Auth, RLS, and Production Reset Research

**Reviewed:** 2026-10-20  
**Question:** What Supabase constraints should shape account onboarding, database authorization, backups, and the planned production data reset?

## Findings

### Account invitations and setup

- Supabase's `auth.admin.inviteUserByEmail()` is an Auth Admin API operation. Call it only from trusted server code using the project's secret key; secret/service-role keys bypass RLS and must never be shipped to a browser, mobile app, or other public client. ([User management](https://supabase.com/docs/guides/auth/users), [API keys](https://supabase.com/docs/guides/getting-started/api-keys))
- The invite's `redirectTo` must match an allowed redirect URL. Invite links expire according to the project's Email OTP expiration setting, which defaults to one hour; expired invitations need to be sent again. ([User management](https://supabase.com/docs/guides/auth/users))
- **Application implication:** route invite creation through a server-side operation, validate the invited role and recipient there, and configure an allowlisted redirect into the student mobile setup flow. Supabase invitation acceptance/email verification does not itself provide the separate OJT Coordinator approval required by this system.

### RLS and authorization tests

- Access requires both SQL privileges (grants) and RLS policies: grants determine whether an operation is available to a database role, while policies filter which rows it may affect. Adding policies does not revoke grants already present. ([Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security))
- Supabase's table-hardening procedure is to enable RLS, grant only needed operations, write policies for each operation, add pgTAP tests asserting both allowed and denied cases, and run `supabase test db`. ([Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security), [Testing your database](https://supabase.com/docs/guides/database/testing))
- Secret/service-role keys bypass RLS. They therefore cannot be used as evidence that a user's policy is correct; authorization tests must exercise the intended client roles and user claims. ([API keys](https://supabase.com/docs/guides/getting-started/api-keys), [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security))

### Backup and restore coverage

- Supabase database backups include Storage metadata, but **do not include the stored file objects**. Deleting a Storage object is not undone by restoring an older database backup. A complete recovery set therefore needs a separate copy of Storage objects as well as the database backup. ([Database backups](https://supabase.com/docs/guides/platform/backups), [Download Storage objects](https://supabase.com/docs/guides/storage/management/download-objects))
- Storage objects can be listed/copied with the Supabase CLI or downloaded in bulk through the S3-compatible endpoint; metadata and object bytes are distinct parts of a complete backup. ([Download Storage objects](https://supabase.com/docs/guides/storage/management/download-objects))
- Restoring a database backup makes the project inaccessible during restore, with downtime depending on database size. Supabase supports restore to a new project for testing/recovery, but that clone is database-only: Storage files/settings and several project settings need separate handling. It also copies Auth users and data; database extensions with external jobs can start running immediately after a binary clone. ([Database backups](https://supabase.com/docs/guides/platform/backups), [Restore to a new project](https://supabase.com/docs/guides/platform/clone-project))

### Validating a production target and avoiding a remote reset

- A Supabase project reference is visible under **Project Settings > General > Reference ID**. The CLI can link using an explicit `--project-ref`; its project list shows the linked project. Confirm these against the intended production project before any remote command. ([Project reference](https://supabase.com/docs/guides/graphql#term-reference), [CLI workflow](https://supabase.com/docs/guides/local-development/cli-workflows))
- `supabase db reset --linked` drops the linked remote schema, replays migrations, and runs seed files. Supabase labels it destructive, limits it to throwaway development/staging projects, and explicitly says never to use it on production. It is also the wrong tool for a data-only reset that must preserve the existing schema. ([CLI workflow](https://supabase.com/docs/guides/local-development/cli-workflows))
- Supabase's production migration workflow applies schema changes through versioned migrations; `db push --dry-run` previews schema migrations, not a separate data purge. Keep the schema repair and approved data-clearing operation distinct, inspect their exact target/scope, and verify migration history before schema deployment. ([Database migrations](https://supabase.com/docs/guides/deployment/database-migrations), [CLI workflow](https://supabase.com/docs/guides/local-development/cli-workflows))

## Implementation constraints

1. Never expose a Supabase secret/service-role key in either client app. Use server-only code for invite/admin actions.
2. Test RLS as the four application roles, including negative access cases; test the grants as well as row policies.
3. Before an approved production purge, confirm the dashboard Reference ID and CLI link agree with the intended production project. Do not use `db reset --linked`.
4. Preserve a recoverable database backup **and** a separate verified copy of all Storage objects. Rehearse recovery on an isolated environment; account for the fact that a Supabase clone carries production Auth data and may run database extension jobs.
5. Keep schema migrations and data reset steps separate so that the data reset preserves the schema, migration history, and required project configuration.

This note records platform facts and implementation constraints. It does not authorize or perform production changes.
