# Release order: database first, then code

Production code deploys on its own when `production-ready` changes (Vercel). Migrations do not: they are applied by hand.
On 2026-11-21 production was 12 migrations behind its own repo, and after they were applied the older web app broke
(midterm evaluations rejected, renamed report type, clearance gate). The order below prevents both directions of that mismatch.

## Every release

1. **Check for drift:** `npm run check:db-drift`. It lists migrations missing from, or unknown to, staging and production. Read-only. Needs `supabase login`.
2. **Staging first:** `supabase link --project-ref xlkvjuwzcviicerpzdjz`, then `supabase db push --dry-run`, then `supabase db push`. Test the new code against staging.
3. **Production database next:** `supabase link --project-ref jhslfwczxkdhexjgssjr`, `supabase db push --dry-run`, read the list, then `supabase db push`. Re-link to staging afterwards so a later command cannot hit production by accident.
4. **Then merge to `production-ready`.** The new code deploys onto a database that already has its migrations.
5. **Run `npm run check:db-drift` again.** Both projects must print `OK`.

## Migration rule: the old code must keep working

Between step 3 and step 4 (and for mobile installs that have not updated) the previous code runs against the new schema.
A migration must not reject values or names the deployed code still writes. For a rename or a stricter rule, ship it in two releases:

1. Release A: add the new name or rule, keep accepting the old one. Deploy the code that uses the new one.
2. Release B (after web is live and the mobile build has rolled out): remove the old name or tighten the rule.

Examples that would have needed two steps: renaming `Weekly Progress` to `Weekly Journal`, and allowing only `final` evaluations.

## What the drift check does not cover

- Auth and Storage settings: run `supabase config diff --project-ref <ref>` for each project. Email confirmations, redirect URLs, rate limits and bucket settings live there, not in migrations.
- Schema differences that are not migrations (a change made in the dashboard). For a full compare, `supabase db dump --linked -f file.sql` on each project and `diff --strip-trailing-cr`.
- Data, edge functions, mobile build versions.
