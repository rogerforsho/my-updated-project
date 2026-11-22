# ADR 0009: Program Hours, Four Pre-deployment Documents, and the Five-Month Window

**Status:** Accepted, 2026-11-08.

## Context

The system treated every student as needing 486 hours and two pre-deployment documents, and a practicum could run with no end date. The institution's rules differ by program, require a consent waiver and medical certificate, and cap an internship at five months (CHED CMO 104 / SIPP).

## Decision

1. **Required Hours follow the program, and the OJT Coordinator sets them** (amended 2026-11-22). The hours come from the school, CHED and the curriculum, so the Coordinator of the course's department sets Target Hours once per course (Coordinator > Target Hours), stored in `program_target_hours`. The first rows are seeded with BSIT 486, BS-CPE 240, BSBA-HRM 300, BSENTREP 300 and show "Not yet confirmed" until a Coordinator saves them. `required_hours_for_course()` reads that table; `shared/courses.ts` keeps the same numbers only as seed and fallback values. `students.required_hours` is filled from the course on insert and when the course changes. When a Coordinator changes a program's hours, students still on the old value follow (`set_program_target_hours()`); a value set on purpose and students with a completion certificate stay as they are.
2. **Four documents gate scheduling and placement:** consent waiver, medical certificate, orientation certificate, endorsement letter. One shared list (`GATEWAY_DOCUMENT_SPECS`) drives every check. Students already placed with an active assignment are exempt.
3. **The Practicum Window is a hard limit:** an end date is required and may be at most 5 calendar months after the start. It is checked in the shared schedule policy, in the Coordinator review and assignment services, and by database triggers, because students and Coordinators can write those tables through RLS. A schedule must also be able to reach the required hours inside the window. There is no Coordinator override.

## Alternatives considered

- **Keep hours as a per-assignment setting.** Rejected: nothing set it, so every student silently got 486.
- **Enforce the cap in the app only.** Rejected: RLS lets a student insert a schedule directly.
- **A database constraint instead of triggers.** Rejected: it would block closing an already-overlong assignment (closing sets the end date to today).

## Consequences

- Changing a program's hours is a Coordinator action, not a code change. `shared/courses.ts` is no longer the source of truth, so it can differ from the table after a change; it only matters for a student with no value.
- Existing rows over the cap stay loadable. Only new rows and changes to the dates are checked.
- The five-month limit makes a minimum daily load implied by the program (for example 486 hours on a five-day week needs about 4.5 hours a day).
- Documents are not verified for notarization by the system; the Coordinator checks it during review.
