# Coordinator–Supervisor Chat Feasibility

**Reviewed:** 2026-10-15  
**Question:** Can this system support a chat where an OJT Coordinator and Company Supervisor communicate?

## Finding

**Yes, technically. It is feasible within the existing stack, but it is not an implemented feature or clearly approved requirement today.** The system already uses Supabase Auth, PostgreSQL, and Row Level Security, and its web app includes both Coordinator and Supervisor portals. Supabase Realtime can deliver database-change events to connected clients; its official guidance documents database subscriptions, including RLS-aware Postgres Changes, and recommends Broadcast for more scalable/security-focused realtime delivery ([Supabase: subscribing to database changes](https://supabase.com/docs/guides/realtime/subscribing-to-database-changes), [Supabase: Realtime authorization](https://supabase.com/docs/guides/realtime/authorization)). So no additional backend framework is inherently necessary.

## What exists and what is missing

- **Existing foundation:** Coordinator and Supervisor are approved roles, with the web app serving both. Assignments associate a student with a company and supervisor (`systemrules/rules/docs/5. ROLES_AND_PERMISSIONS.md`; `database/migrations/001_initial_schema.sql`, `student_assignments`).
- **Notifications are not chat:** `notifications` stores an optional sender, one receiver, a message, timestamp, and read/unread status (`database/migrations/001_initial_schema.sql:144–151`). It has no conversation/thread or participant model; current usages dispatch reminders, activity notices, and announcement alerts. The RLS policy grants users read access to their own received notifications (`database/migrations/002_rls_policies.sql:88–90`).
- **No chat implementation found:** The source search found no chat/conversation tables, Coordinator–Supervisor chat pages/services, or Supabase Realtime subscriptions. Current notification UI is a list of notices, not a two-way conversation (`apps/web/app/(dashboard)/student/notifications/page.tsx`).
- **Realtime capability is not configured by virtue of using Supabase:** a chat would still need durable conversation/message storage, participant and assignment authorization, send/read behavior, UI in the relevant portals, and Realtime subscription configuration/policies. The existing notification row and its read policy are not sufficient authorization for chat.

## Scope constraint

The manuscript describes fragmented communication as a problem and calls for “stakeholder communication” and “structured communication,” and says Company Supervisors coordinate with the institution about internship concerns (`capstone_manuscript.txt:42–51, 74, 134`). However, its described workflows and sprint list specify announcements, notifications, reports, evaluations, and feedback—not a direct-message/chat workflow (`capstone_manuscript.txt:104, 116–119, 380–382`). The project PRD lists “Unapproved private chat or messaging platforms” under non-goals (`systemrules/rules/docs/3. PRD.md:27`); it is unclear whether that excludes third-party platforms only or any in-app private chat. Repository instructions also say not to invent features beyond the manuscript (`AGENTS.md:38`). Therefore a Coordinator–Supervisor chat fits the broad communication goal, but the intended interpretation and scope should be explicitly confirmed before implementation. This is a product/scope decision, not a technical blocker.

## Practical boundary

A focused first version could be online-only messages between a Coordinator and Supervisor associated through an active student/company assignment, with strict RLS on conversation membership. That linkage and authorization approach is a recommendation inferred from the assignment model and the documented rule that supervisors only access assigned trainees (`systemrules/rules/docs/5. ROLES_AND_PERMISSIONS.md`; `systemrules/rules/docs/11. ARCHITECTURE.md`). The project instructions limit offline behavior to mobile attendance and require active internet for other modules (`AGENTS.md:8`), so offline chat should not be assumed.

**Answer:** Yes, the system can support it using the current Supabase-based architecture. It would be a new feature requiring explicit workflow/access rules and scope approval; existing notifications do not already provide chat.
