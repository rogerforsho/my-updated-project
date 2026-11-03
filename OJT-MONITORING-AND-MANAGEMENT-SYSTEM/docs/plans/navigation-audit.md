# Navigation audit

Status: implemented, 2026-11-03. Optional analysis and the standalone map were removed; related workflows were consolidated into tabs.

## How this was judged

The capstone manuscript is not in the repository, so scope was checked against `AGENTS.md` (the nine increments and the explicit exclusions), `docs/adr/0006`, `docs/adr/0007` and `docs/system-features.md`. If the manuscript disagrees with `docs/system-features.md`, the manuscript wins and this table needs another pass.

Excluded by `AGENTS.md`: job applications or recruitment, MOA transactions, payroll, general HR, students outside 4th-year ICS and IBE.

## The six pages you flagged

| Page | In scope? | Evidence | Recommendation |
|---|---|---|---|
| `what-if` | No longer a standalone feature | Read-only hypothetical planning was low priority and excluded holidays and schedule changes | **Removed.** Old links redirect to Progress. |
| `map` (Deployment Map) | No longer a standalone feature | Company and branch pages retain the location and geofence workflows | **Removed.** Old links redirect to Companies. |
| `branches` (HTE Branches) | Yes | ADR 0006: multiple approved branches; attendance geofences depend on branches | **Keep.** Candidate to merge into Companies. |
| `evaluations` (Evaluation Appeals) | Yes | ADR 0006: appeals preserve the original evaluation; Coordinator decides | **Keep.** Candidate to share a page with Supervisor Evaluations. |
| `supervisor-evaluations` | Yes | Increment 7, performance evaluation | **Keep.** Same merge candidate as above. |
| `incident-reports` | Yes | ADR 0006: Coordinator-only; `system-features.md` documents the confidential flow | **Keep.** Do not hide: it is the only route for a student concern. |

Branches, appeals, evaluations, and incident reports remain in scope; only the low-priority standalone analysis and map were removed. The clutter was the number of Coordinator menu items, not the underlying workflows.

## Menu consolidation (optional, only if you want fewer items)

The Coordinator sidebar now has 14 entries. Related lower-frequency workflows remain reachable through section tabs:

| Merge | Into | Saves |
|---|---|---|
| Companies, HTE Branches, HTE Requests | one **Partners** section with tabs | 2 |
| Supervisor Evaluations, Evaluation Appeals | one **Evaluations** section with tabs | 1 |
| Progress, Department Reports | one **Progress & Reports** section with tabs | 1 |
| Holidays & Days Off, Attendance | leave separate (different jobs) | 0 |
| Deployment Map | removed as a standalone page; company and branch location setup remains | 1 |

Old map and what-if URLs redirect to their replacement sections; the original partner, evaluation, report, and import routes remain available for bookmarks and direct links.

## Other roles

- **Supervisor (6 items):** My Students, Attendance, Daily Reports, Evaluations, Messages, Notifications. All in scope. No change.
- **Super Admin (1 item, 4 tabs):** Users, Announcements, Holidays, Audit Log. All in scope. No change.

## Result

The coordinator sidebar now exposes the daily workflows directly while related lower-frequency workflows remain reachable from their section tabs. The manuscript still needs a separate review for final scope confirmation.
