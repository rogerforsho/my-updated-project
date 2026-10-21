# Historical: four application account categories

**Status:** Superseded by ADR 0006, 2026-10-20

This record preserves the earlier decision for migration history only. The current application roles are OJT Student, Supervisor, OJT Coordinator, and Super Admin; OJT Staff and Program Head are not user-facing roles. Follow [ADR 0006](0006-explicit-ojt-account-roles-and-review-ownership.md) and the approved redesign plan for current behavior.

The application presents Student, Supervisor, OJT Staff, and Admin. OJT Staff combines the former Coordinator and Program Head academic workflows. An OJT Staff account can have one or both ICS and IBE grants; academic records remain restricted to those grants. Admin handles accounts and system settings, including system broadcasts and backups, without academic workflow authority. IT evaluators remain external reviewers.

For compatibility with existing policies and chat records, the database stores OJT Staff as `role = 'Coordinator'` and generates `account_category = 'OJT Staff'`. The migration converts existing Program Head roles to Coordinator after checking department grants, adds missing Coordinator profile rows, and preserves their Program Head profile rows and linked records. The stored compatibility value is not an additional user category. Remove this mapping only when the legacy database policies and chat schema are replaced together.

The `/coordinator` and `/program-head/reports` paths remain as route compatibility; the navigation presents a single OJT Staff section. Admin has a separate console. Historic migrations remain intact so existing installations can migrate without losing data.
