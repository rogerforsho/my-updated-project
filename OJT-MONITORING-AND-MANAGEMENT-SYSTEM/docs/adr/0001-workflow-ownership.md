# ADR 0001: Keep workflow rules and identity ownership explicit

- Status: Accepted
- Date: 2026-10-11

## Context

The web and mobile apps duplicated student schedule rules, mobile attendance sync decisions were embedded in device code, and seven web services repeated the same Auth-to-profile lookup. The 779-line web auth module also combined registration, approvals, sessions, and password recovery. These repetitions made it easy for the apps to disagree and made failure behavior difficult to test.

## Decisions

1. Put pure Practicum Schedule rules and normalization in `shared/`; keep Supabase reads and writes in each app. New schedules use same-day shifts, require an explicit lunch start when lunch is positive, default an omitted duration to 60 minutes, and retain existing schedule limits. Do not guess missing lunch starts on legacy approved schedules.
2. Put offline attendance synchronization decisions in an injectable mobile workflow; keep device storage, connectivity, and Supabase calls in its adapter. A conflicting server record never gets overwritten or uploaded over, the pending item and local evidence remain available for Coordinator resolution, and each queued event reuses one photo path on retry.
3. Resolve the signed-in Auth user and matching active `public.users` profile through `trusted-actor.ts`. Keep role and department authorization within each workflow and retain database RLS and write guards.
4. Organize web auth actions by registration, account review, session access, and recovery. Keep `auth.ts` as the public compatibility facade and keep rate-limit and service-client mechanics in a narrow internal module.

## Consequences

Both apps now calculate new schedule values through one tested policy. Offline sync decisions can be tested without a physical device. Missing or inactive actor profiles fail closed in the seven workflows using the shared lookup. Existing auth imports and action signatures remain stable while callers can migrate later.
