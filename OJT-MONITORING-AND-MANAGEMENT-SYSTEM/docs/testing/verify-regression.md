# Verify: regression sweep (production build)

Run 2026-10-23. App `http://127.0.0.1:3100`, local Supabase, branch `loop/integration`. No source edits.
Scripts/screenshots: scratchpad `...\b209662f-c8e7-4737-b1ea-72def4f98a9c\scratchpad` (`pw\rg-*.cjs`, `pw\rg-api.mjs`, `rg-*.png`).

| Feature | Result | Evidence |
|---|---|---|
| sidebar-mojibake | PASS | "RA 10173 • ISO/IEC" present, no mojibake, for Supervisor, Coordinator, Super Admin |
| sv-evaluation | PASS | Ratings 5..1; final with a rating of 2 and no comment is blocked (alert shown, 0 rows); with comment saved (final:72); midterm with all ratings >= 3 and no comment saved; no errors |
| sv-verify-dispute | PASS | "Mark Disputed" moved a pending row to stored `rejected` (pending 4 -> 3) |
| co-student-status | PASS | Assignments "Set status" with confirm; QA Student `active` -> `inc`, audit STUDENT_STATUS_INC; no overflow at 390px |
| sa-delete-blocked-active | PASS | Deactivate pill and delete dialog both: "This Coordinator still has 4 active student(s) in ICS."; status stays active |
| st-future-dated-block | PASS | `/api/mobile/attendance` time_in and time_out +7 days -> 400 "cannot be recorded for a future date or time" |
| st-forgotten-timeout | PASS | `/api/internal/auto-time-out`: wrong secret 401, no header 401, real CRON_SECRET 200 `{"timedOut":0,"failed":0}` (no open entries) |
| sv-report-approve | PASS | Two new reports: one returned, one approved, both with feedback and decided_by in DB. Not rechecked: empty-comment return (button is not disabled; earlier run showed the server saves nothing) |
| sv-errand-justification | PASS | Bulk button reads "Verify clean logs (1)" (flagged/auto time-out entries excluded) |

No page/console errors or 4xx/5xx in any run; no horizontal overflow at 390px on supervisor attendance, evaluations, reports and coordinator assignments; no "undefined"/"NaN".

## Local data changes
- Evaluations added for QA-REG-ics (final 72 with comment, midterm); 2 more Daily Journal reports (decided). Attendance 7094fbdc disputed then restored to pending. QA Student status restored to active. Temporary supervisor reassignment of assignment 618bedaf restored.
