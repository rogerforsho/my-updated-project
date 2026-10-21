# ADR 0002: Coordinator–Supervisor Conversations

## Status
Accepted

## Context
Coordinators and Company Supervisors need a private way to discuss trainees they jointly support. The domain has no direct Coordinator-to-Supervisor assignment. A Supervisor may have multiple trainees, and multiple Coordinators may belong to a department, so eligibility follows existing placement and course-department data.

## Decision
- Only active Coordinator and Supervisor accounts may use chat. Admins and Program Heads have no chat access.
- A Coordinator is eligible to chat with a Supervisor when the Coordinator’s department matches the course department of at least one active student placement assigned to that Supervisor.
- There is one conversation per Coordinator–Supervisor pair, not per trainee. Either participant may start it by sending the first message.
- When the pair has no active matching placement, the thread remains readable as archived history and cannot receive new messages. Sending becomes available again if a matching active placement returns.
- Messages are immutable plain text up to 4,000 characters. Opening a thread marks incoming messages read; no sender-facing read receipt is shown.
- Every new message creates a generic notification linked to the conversation, with no message preview. The notification is available in the Coordinator/Supervisor inbox and bell.
- The feature is web-only and online-only in v1. Existing account-deletion cascades remove associated conversations, messages, and notifications.

## Consequences
- Eligibility is enforced in PostgreSQL, not only in page routing.
- Active placement status is checked at send time, while existing conversation rows remain readable when the relationship ends.
- The notifications table needs a nullable conversation link, and notification navigation remains scoped to the receiver.
- Supabase Realtime may deliver new message rows only to users authorized to read those rows.

## Alternatives Considered
- One conversation per trainee: rejected because the conversation is for the staff pair and should not fragment across shared trainees.
- Delete or hide the thread when the placement ends: rejected because participants need a history of prior coordination.
- Keep the thread writable after the relationship ends: rejected because it would allow contact without a current program relationship.
