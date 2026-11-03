# ADR 0008: Two-Layer Rate Limiting

**Status:** Accepted, 2026-11-03. Spec: GitHub issue #6.

## Context

Account-level abuse limits (login, password recovery, registration, mobile submissions) are already enforced by a database function that counts attempts per subject and per network and can lock an account out. Most other public routes have no limit. Before launch we also want to keep abusive traffic away from the database during busy periods.

## Decision

1. **Keep the database limiter** for per-subject rules that carry business meaning, such as lockout.
2. **Add a per-IP limiter on Upstash Redis** at the edge middleware for API, auth and download routes. Internal cron routes, health and readiness are skipped.
3. **Fail open.** If Redis is unreachable the request is allowed and the failure is reported to Sentry.

## Alternatives considered

- **Replace the database limiter with Redis.** One mechanism, and it removes the database round trip. Rejected because lockout rules would have to be rebuilt and re-verified for no launch benefit.
- **Database limiter only.** Rejected because every limited request would cost a database call, which is the load we want to avoid.

## Consequences

- A request can be checked twice (edge IP limit, then subject limit). Both can answer 429, and clients must handle either.
- A future reader looking for "the" rate limiter will find two. Per-subject rules belong in the database, and coarse per-IP rules belong at the edge.
- During a Redis outage the app stays available but only the database limits apply.
- Limiter keys are namespaced by environment so staging and production never share counters.
