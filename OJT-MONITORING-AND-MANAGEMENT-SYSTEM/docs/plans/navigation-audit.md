# Navigation audit

Status: recommendation only, 2026-10-28. **Nothing has been hidden, merged or removed.** Approve, change or reject each line below first.

## How this was judged

The capstone manuscript is not in the repository, so scope was checked against `AGENTS.md` (the nine increments and the explicit exclusions), `docs/adr/0006`, `docs/adr/0007` and `docs/system-features.md`. If the manuscript disagrees with `docs/system-features.md`, the manuscript wins and this table needs another pass.

Excluded by `AGENTS.md`: job applications or recruitment, MOA transactions, payroll, general HR, students outside 4th-year ICS and IBE.

## The six pages you flagged

| Page | In scope? | Evidence | Recommendation |
|---|---|---|---|
| `what-if` | Yes | ADR 0006: "What-if scenarios are read-only"; `system-features.md` lists it under Monitoring | **Keep.** Candidate to move under Progress as a tab. |
| `map` (Deployment Map) | Yes | `system-features.md` lists "map view" under Monitoring | **Keep.** Needs the manuscript to confirm. |
| `branches` (HTE Branches) | Yes | ADR 0006: multiple approved branches; attendance geofences depend on branches | **Keep.** Candidate to merge into Companies. |
| `evaluations` (Evaluation Appeals) | Yes | ADR 0006: appeals preserve the original evaluation; Coordinator decides | **Keep.** Candidate to share a page with Supervisor Evaluations. |
| `supervisor-evaluations` | Yes | Increment 7, performance evaluation | **Keep.** Same merge candidate as above. |
| `incident-reports` | Yes | ADR 0006: Coordinator-only; `system-features.md` documents the confidential flow | **Keep.** Do not hide: it is the only route for a student concern. |

None of the six is outside the documented scope. The clutter is the number of Coordinator menu items (21), not pages that do not belong.

## Menu consolidation (optional, only if you want fewer items)

The Coordinator sidebar has 21 entries. Merging closely related pages would bring it to about 15 without removing any capability:

| Merge | Into | Saves |
|---|---|---|
| Companies, HTE Branches, HTE Requests | one **Partners** page with tabs | 2 |
| Supervisor Evaluations, Evaluation Appeals | one **Evaluations** page with tabs | 1 |
| Progress, What-if Analysis | **Progress** with a What-if tab | 1 |
| Holidays & Days Off, Attendance | leave separate (different jobs) | 0 |
| Deployment Map | keep, or move under Companies as a tab | 0 to 1 |

Cost: each merge moves existing pages into tabs, so links, bookmarks and the route guards in `middleware.ts` need updating. This is a larger change than hiding items and is not needed to meet the manuscript.

## Other roles

- **Supervisor (6 items):** My Students, Attendance, Daily Reports, Evaluations, Messages, Notifications. All in scope. No change.
- **Super Admin (1 item, 4 tabs):** Users, Announcements, Holidays, Audit Log. All in scope. No change.

## Decisions needed

1. Keep all six flagged pages as they are? (Recommended: yes.)
2. Do the menu consolidation above, or leave the 21-item menu?
3. Confirm the manuscript lists the deployment map and holidays. Both are documented in `docs/system-features.md` or requested in the feedback notes, but neither can be checked against the manuscript from here.
