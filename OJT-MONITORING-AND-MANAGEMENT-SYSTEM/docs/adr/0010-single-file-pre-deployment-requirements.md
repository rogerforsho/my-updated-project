# ADR 0010: One Combined File for the Pre-deployment Requirements

**Status:** Accepted, 2026-11-16. Refines ADR 0009 decision 2. Narrowed by ADR 0011: the combined file is now PDF only (DOCX is no longer accepted).

## Context

Students uploaded four separate gateway documents and the OJT Coordinator reviewed each one, so every student meant up to four files to open and four decisions. Students also uploaded without knowing what was expected.

## Decision

1. **One file per student.** The student uploads ONE PDF or DOCX (report type `Pre-deployment Requirements`, max 25 MB) that contains all four documents. The mobile screen lists what the file must contain, and photos and links are not accepted for this type (checked on the server in `app/api/mobile/reports/route.ts`).
2. **One decision.** The Coordinator approves or rejects the file. When rejecting, they tick which of the four documents are missing or incorrect; the ticks and any remark go into the existing `reports.remarks`.
3. **Old data still counts.** `getGatewayStatus` clears a student with one approved combined file OR all four legacy documents approved. The four legacy types stay reviewable (`isCoordinatorReviewType`) but can no longer be submitted (`STUDENT_REPORT_TYPES`).
4. **No schema change except the bucket size.** `private-documents` goes from 10 MB to 25 MB (migration `20261116000100`). The same cap now applies to every report upload, because the upload route does not know the report type.

## Alternatives considered

- **Everyone re-uploads.** Rejected: students with approved documents would be forced to redo work for no gain.
- **A document-types table.** Rejected: nothing else needs it; the type is a plain string on `reports` and one shared list drives the checklist.
- **Merging four uploads into one PDF on the server.** Rejected: more code and moving parts than asking the student for one file.
