# ADR 0009: Program Hours, Four Pre-deployment Documents, and the Five-Month Window

**Status:** Accepted, 2026-11-08.

## Context

The system treated every student as needing 486 hours and two pre-deployment documents, and a practicum could run with no end date. The institution's rules differ by program, require a consent waiver and medical certificate, and cap an internship at five months (CHED CMO 104 / SIPP).

## Decision

1. **Required Hours follow the program:** BSIT 486, BS-CPE 240, BSBA-HRM 300, BSENTREP 300. The app (`shared/courses.ts`) and the database (`required_hours_for_course()`) hold the same mapping and a test keeps them equal. `students.required_hours` is filled from the course on insert and when the course changes, and only a value set on purpose overrides it.
2. **Four documents gate scheduling and placement:** consent waiver, medical certificate, orientation certificate, endorsement letter. One shared list (`GATEWAY_DOCUMENT_SPECS`) drives every check. Students already placed with an active assignment are exempt.
3. **The Practicum Window is a hard limit:** an end date is required and may be at most 5 calendar months after the start. It is checked in the shared schedule policy, in the Coordinator review and assignment services, and by database triggers, because students and Coordinators can write those tables through RLS. A schedule must also be able to reach the required hours inside the window. There is no Coordinator override.

## Alternatives considered

- **Keep hours as a per-assignment setting.** Rejected: nothing set it, so every student silently got 486.
- **Enforce the cap in the app only.** Rejected: RLS lets a student insert a schedule directly.
- **A database constraint instead of triggers.** Rejected: it would block closing an already-overlong assignment (closing sets the end date to today).

## Consequences

- Changing a program's hours means changing two places (`shared/courses.ts` and the SQL function); the test fails if they drift.
- Existing rows over the cap stay loadable. Only new rows and changes to the dates are checked.
- The five-month limit makes a minimum daily load implied by the program (for example 486 hours on a five-day week needs about 4.5 hours a day).
- Documents are not verified for notarization by the system; the Coordinator checks it during review.
