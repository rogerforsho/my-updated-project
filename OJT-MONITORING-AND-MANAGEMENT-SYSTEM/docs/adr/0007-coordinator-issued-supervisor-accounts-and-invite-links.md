# ADR 0007: Coordinator-Issued Supervisor Accounts and Invite Links

**Status:** Accepted, 2026-10-28. Amends ADR 0006 (account lifecycle).

## Context

ADR 0006 says Super Admins manage account access and that Coordinators and Supervisors receive single-use email setup invitations. In the code, an OJT Coordinator already creates Supervisor accounts from the Supervisors page: the server creates the account and emails a one-time password setup link (`docs/system-features.md` lists "create Supervisor accounts" under the Coordinator). This ADR records that as intended and adds a way for a company to sign its own Supervisors up.

## Decision

1. **Who may create Supervisor accounts.** Both the Super Admin and an OJT Coordinator. Students still self-register and a Coordinator approves them; Coordinator accounts stay with the Super Admin.
2. **Invite links.** A Coordinator holding an academic grant for a department may generate a sign-up link for one company. The company's Supervisor opens the link, enters name, work email and position, and receives the same one-time password setup email as any other invited account.
3. **Link rules.**
   - Valid for **two sign-ups** (not one), then it stops working.
   - Expires **7 days** after creation.
   - A Coordinator can **revoke** it at any time.
   - It names **one company and one department** (ICS or IBE); the person signing up cannot change either.
   - Only a hash of the link is stored. The link is shown once, when it is created.
   - Creating, using and revoking a link are written to the audit log.
4. **Abuse limits.** The sign-up page is rate limited per email address and per network, and answers identically whether or not the email already has an account, so it cannot be used to discover registered emails. If account creation fails, the use is given back.

## Consequences

- A Coordinator can only issue links for departments they are granted. Companies are shared between ICS and IBE and carry no department, so a Coordinator may choose any active company; the department on the link records which institute issued it and is not used to restrict the Supervisor afterwards.
- Supervisors have no department of their own. The department on a link is attribution and audit information only; it does not change what a Supervisor can see.
- A leaked link allows at most two sign-ups within seven days, each still requiring access to the email inbox to set a password. Coordinators should revoke a link they shared by mistake.
- The Super Admin keeps no routine access to academic records; nothing here changes that.
