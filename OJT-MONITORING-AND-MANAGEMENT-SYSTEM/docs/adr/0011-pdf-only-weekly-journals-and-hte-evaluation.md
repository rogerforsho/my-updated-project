# ADR 0011: PDF-Only Submissions, Weekly Journals Compiled into One PDF, and the HTE Evaluation

**Status:** Accepted, 2026-11-18. Narrows ADR 0010 (the combined requirements file is now PDF only).

## Context

Students picked from six document types with no sign of who reviews them, and `final_report` showed as a raw code. Daily Journals made the OJT Coordinator's end-of-term review a pile of many files, and uploads could be DOCX, photos or links that cannot be checked or merged. Students also had no way to give feedback about their Host Training Establishment (HTE).

## Decision

1. **Types.** Students submit Pre-deployment Requirements, Weekly Journal, Incident Report or Final Report. Daily Journal and Accomplishment Report are retired for new submissions but stay in `SUPERVISOR_REVIEW_REPORT_TYPES` so pending old rows can still be decided. Weekly Progress rows are renamed to Weekly Journal by migration `20261118000100`.
2. **PDF only.** The upload route, the submit route, the web `submitReport` action and the mobile picker accept `.pdf` only; links are no longer accepted. Weekly Journals are capped at 3 MB, other documents at 25 MB. Existing DOCX, photo and link rows stay readable.
3. **Who reviews it is shown.** `describeReportType` in `shared/gateway.ts` gives every stored type a display label and a reviewer (Supervisor or Coordinator). The mobile form, the Supervisor pages and the Coordinator submissions page use it, so there is one place to change.
4. **Compiled Weekly Journals.** When Required Hours are complete, the student taps a button and `POST /api/mobile/reports/compile-journals` merges every Supervisor-approved Weekly Journal, oldest first, behind a cover page, into one PDF (`pdf-lib`, `apps/web/src/lib/mergePdfs.ts`). It is stored as a `Compiled Weekly Journals` report and reviewed by the OJT Coordinator. Files that are not readable PDFs are skipped and listed in the report's remarks. A new compile is allowed only after the Coordinator returned the previous one. It is not required for clearance. The bucket limit rises to 50 MB for the merged file.
5. **HTE Evaluation.** A new student tab shows the ICS form (11 criteria, rated 1 to 5 and weighted to 100). It unlocks when the student's `internship_progress` is `completed`, is submitted once through `/api/mobile/hte-evaluation`, and is stored in `hte_evaluations` (read by the student and the department's Coordinator only; Supervisors have no policy). It is outside the completion-freeze list so a student whose OJT is already finalized can still submit it. The Coordinator reads it under Partner quality, as "HTE feedback".

## Alternatives considered

- **Coordinator downloads a merged PDF on demand.** Rejected: the student would not see what was sent, and nothing would land in the Coordinator's review queue.
- **Keep links as an alternative to PDF.** Rejected: a link cannot be validated or merged, and the target can change after approval.
- **Show the HTE Evaluation to the Supervisor.** Rejected: students would not rate their supervisor honestly.
- **Unlock the HTE Evaluation only after the certificate.** Rejected: records are frozen then, and the paper form is filled in at the end of training, not after grading.
