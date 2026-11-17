# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

AGENTS.md holds the scope, approved stack, the four account roles and the ISO/IEC 25010 wording rule. Read it first; it is not repeated here.

## Repository layout

The git root is `capstone-project/`; the app lives in `OJT-MONITORING-AND-MANAGEMENT-SYSTEM/` (run all commands from there). The root `vercel.json` points Vercel at `apps/web`. `.github/workflows/cron.yml` (root) calls the web app's internal cron routes, because Vercel Hobby only allows daily crons.

npm workspaces: `apps/web` (Next.js 15 App Router), `apps/mobile` (Expo/React Native, students only), `apps/desktop` (Electron shell that loads the web portal), `shared` (domain logic imported by web and mobile: schedule policy, gateway/clearance rules, geo, validation, types).

## Commands

```bash
npm run dev:web            # Next dev server, http://localhost:3000
npm run dev:mobile         # expo start (needs an installed dev build; Expo Go cannot load the face-detection module)
npm run dev:desktop        # web + Electron
npm run typecheck          # tsc --noEmit for web and mobile (there is no root lint; web has `npm run lint -w apps/web`)
npm run build              # next build

npm test                   # unit phase then db phase, ~4 min
npm run test:unit          # node --test over scripts/*.test.{cjs,mjs}
npm run test:db            # runs every scripts/check-*.cjs (PGlite, no Docker/Supabase needed)
node --test scripts/regressions.test.cjs     # one unit file
node scripts/check-department-rls.cjs        # one db check
```

`scripts/run-tests.mjs` discovers test files from disk, so a new `*.test.cjs` or `check-*.cjs` needs no registration. Do not re-chain the phases with `&&`: an earlier chain let one stale unit test hide all the db checks for six days. When piping `npm test`, the exit code is the pipe's, so redirect to a file and check `$?`.

Database checks load the real files in `supabase/migrations/` into PGlite and assert RLS and workflow behaviour. Many unit tests are source-level assertions (they read the TS/SQL text), so renaming or moving a file referenced by a test can break one without any runtime change.

Other scripts of note: `scripts/seed-local-accounts.mjs` / `seed-local-students.mjs` (local Supabase, `qa-*@local.test` accounts), `seed-staging-*.mjs` (CDM-OJT Staging project), `rebuild-database.cjs` (single-transaction schema rebuild with rehearsal/production modes; read its header before use), `docs/operations/production-data-reset.md`.

## Architecture

**Supabase is the backend.** Schema is defined only by the ordered files in `supabase/migrations/` (timestamp-named; add a new one, never edit an applied one). Authorization lives in Row Level Security plus SECURITY DEFINER functions, with the web services layer re-checking on top. Read `docs/adr/0006` before touching roles or onboarding.

**Roles.** User-facing: Student, Supervisor, Coordinator, Super Admin. In code/DB they are `Student`, `Supervisor`, `Coordinator`, `Admin`. Older "Staff"/"Program Head" strings survive in migration history and in some route names (`/program-head`); do not treat them as live roles. Coordinators are scoped by department grants (ICS/IBE), enforced in `apps/web/src/lib/department-scope.ts` and in RLS. Admin actions require MFA `aal2`.

**Web (`apps/web`).**
- `app/(dashboard)/{admin,coordinator,supervisor}` hold role pages; each role's `layout.tsx` is the route guard. Students are excluded from the portal.
- `src/services/*` is the server-side business layer (admin, assignments, certificates, auth/…); `src/lib/*` holds actor/trust helpers (`actor.ts`, `trusted-actor.ts`, `actor-access.ts`), attendance recording, uploads, CSV/PDF/zip utilities. Supabase clients are in `src/lib/supabase/` (`server`, `client`, `service` for the service role).
- `middleware.ts` does auth redirects, an **allow-list of known paths** (`KNOWN_PATHS`; a new top-level route must be added there or it 404s) and the per-IP Upstash limiter. Rate limiting is deliberately two layers: per-IP at the edge (fails open) and per-subject/lockout in a DB function (ADR 0008).
- `app/api/mobile/*` is the mobile BFF. The mobile app does not write attendance, reports, registrations, etc. directly; it posts to these routes, which authenticate the student via `src/lib/mobile-bff.ts`, validate, rate-limit and write with the service client. `app/api/internal/*` are cron-only (bearer `CRON_SECRET`): email queue processing and auto time-out.
- Transactional email is queued in the DB and drained by cron (`docs/operations/email-queue.md`).

**Mobile (`apps/mobile`).** `src/navigation` (Auth vs Student navigators), `src/screens`, `src/services` (one module per feature, calling Supabase reads or the web BFF), `src/lib` (offline attendance queue and sync, selfie upload, supabase client). Offline is limited to attendance logging; queued items sync as "pending verification" and conflicts with server records keep the queued item. Event time (device) and server receipt time are stored separately.

**Shared domain rules.** Required hours per program, the practicum window cap, schedule policy, lunch-overlap exclusion for credited hours, and the clearance gateway (credited hours + approved final report + passing final evaluation) live in `shared/` and are mirrored in SQL. When changing one, change the other and its tests; the mobile app must use the same "approved reports only" rule as the server. Dates are Manila time (`apps/web/src/lib/manila-date.ts`).

## Docs and conventions

- `GLOSSARY.md` defines the domain terms and the words to avoid (e.g. "Credited Hours" not "raw hours", "OJT Coordinator" not "Program Head"). Use them in code, UI and commits.
- ADRs in `docs/adr/`; system diagrams in `docs/system-diagrams/`, `docs/dfd.md`, `docs/erd.dbml`; feature inventory in `docs/system-features.md`.
- Issues and specs live in GitHub Issues (`gh`); labels in `docs/agents/`.
- `.claude/agents/` (repo root) defines the feature loop (auditor, fixer, verifier, orchestrator) which works from `docs/testing/feature-matrix.md` and commits to `loop/<slug>` branches.
- The worktree can be shared with another session: stage only your own hunks, never stage `.env*` files, and verify `tsc` from a clean checkout before pushing.
