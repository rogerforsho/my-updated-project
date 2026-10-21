# HTE Branch Migration: PostgreSQL and Supabase Review

**Reviewed:** 2026-10-20  
**Scope:** Database behavior relevant to `20261020230000_hte_branches_and_requests.sql`; this note is research, not a migration validation or authorization to deploy.

## Findings

1. **Pin privileged-function search paths.** Supabase recommends `SET search_path = ''` with schema-qualified objects for every `SECURITY DEFINER` function. The current migration does this for branch creation/sync triggers, the request guard, and the review RPC; keep it in place as those functions evolve. The review RPC also revokes broad execution and grants `authenticated`, with user/role/scope checks inside the function. ([Supabase RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security), [Supabase database functions](https://supabase.com/docs/guides/database/functions), [PostgreSQL `CREATE FUNCTION`](https://www.postgresql.org/docs/current/sql-createfunction.html))

2. **The review RPC is the only approval path.** The current migration grants `SELECT, INSERT`, removes direct `UPDATE` and its policy, and exposes the controlled decision through `review_company_request`. Its isolated PGlite check confirms direct updates are denied and the RPC writes notification and audit metadata. ([Supabase RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security))

3. **Composite foreign keys have supporting indexes.** `company_branches` declares `UNIQUE (company_id, branch_id)`; the migration adds indexes beginning with `(company_id, branch_id)` on assignments, schedules, and requests. PostgreSQL does not automatically index referencing columns, so retain these indexes. ([PostgreSQL constraints](https://www.postgresql.org/docs/current/ddl-constraints.html))

4. **Legacy rows are preflighted before the backfill and `NOT NULL` change.** The migration reports invalid coordinate pairs/ranges and geofence rows before creating branches, then reports unmatched assignments before setting `branch_id NOT NULL`. PostgreSQL still requires testing lock duration against production-shaped data; Supabase recommends local migration tests and promotion through migration files. ([PostgreSQL `ALTER TABLE`](https://www.postgresql.org/docs/current/sql-altertable.html), [PostgreSQL locking](https://www.postgresql.org/docs/current/explicit-locking.html), [Supabase database migrations](https://supabase.com/docs/guides/deployment/database-migrations))

5. **The partial-index conflict target is a supported pattern.** `ON CONFLICT (company_id) WHERE is_primary DO NOTHING` can infer the partial unique index on `company_id WHERE is_primary`; PostgreSQL supports unique-index inference with an index predicate. Keep the predicate aligned if either definition changes. ([PostgreSQL `INSERT`](https://www.postgresql.org/docs/current/sql-insert.html))

6. **RLS does not validate uploaded files.** The request table's path `CHECK` only validates the stored text prefix. It does not prove that the Storage object exists, belongs to the student, or is in the expected bucket. Keep Storage object authorization in Storage RLS policies and test those policies separately from table RLS. Supabase's guidance requires both grants and policies for exposed tables and recommends allow/deny RLS tests. ([Supabase RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security), [Supabase Storage access control](https://supabase.com/docs/guides/storage/security/access-control))

## Deployment checks suggested by the sources

- Test the migration against a production-shaped isolated database, including invalid legacy geofence rows, unmatched assignments, duplicate HTE names, direct-table approval attempts, and each application role's allowed/denied access.
- Confirm the exact `supabase/migrations` copy and its paired `database/migrations` copy are identical before deployment; deploy only through the reviewed migration workflow.
- Check lock duration and table sizes before applying the backfill / `NOT NULL` change to production. No production database was accessed or changed for this research.
