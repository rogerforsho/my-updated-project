# Panel demonstration fixes and verification

Date: 24 October 2026, Asia/Singapore

All seven findings from the [panel demonstration audit](panel-demo-audit-2026-10-24.md) have been addressed locally. The local web image was rebuilt successfully and the container serving port 3000 was refreshed. Its readiness endpoint returns HTTP 200.

## Findings resolved

| Audit finding | Change | Verification |
| --- | --- | --- |
| 1 Attendance cannot read its assigned branch | Added a mirrored forward migration granting only branch SELECT to the server service role. Policy query errors now return 503 rather than claiming the placement is missing. | Actual service read succeeds and UPDATE remains ungranted. Real mobile API time-in and time-out pass; duplicates return 409; Supervisor verification credits eight hours. Outside-location entries are flagged. Captured events replay within the dates of a closed placement and remain pending review. |
| 2 Prepared document paths fail ownership validation | Corrected the fixture generator and existing synthetic report paths to the student's own `user_id/reports/UUID.docx` namespace. Ownership validation was retained. | Coordinator downloads Student A and Student C evidence; Supervisor downloads Student A evidence using real application actions and signed URLs. |
| 3 Prepared attendance photos use the wrong bucket | Generated labeled synthetic JPEG evidence in `attendance-selfies` and corrected the prepared attendance references and fixture generator. | Assigned Supervisor and Coordinator obtain and download both time-in and time-out images. |
| 4 Applicant back ID preview is missing | Explicitly persisted both ID paths in the public student profiles and fixture generator. | Student B's real approval action provides two signed previews; both images download successfully. |
| 5 Mobile schedule proposals skip gateway prerequisites | Added the approved gateway check to the mobile endpoint and reused the same shared gateway matching logic in the web service. | With zero or one approved document the endpoint returns 400; with both it creates a pending proposal. Temporary test records were removed and Student B restored to pending. |
| 6 Completed submissions return misleading 503 errors | Report upload and submission endpoints check completion first and return 409 with a read-only explanation. Mobile report listing exposes completion, and the Submit control is hidden for completed students. | Both live endpoints return 409 for Student C while its existing attachment stays present. Regression tests cover the API rejection and the completion value used by the mobile screen. |
| 7 Preview configuration hardcodes one LAN address | Removed inline preview portal and backend URLs. The preview profile uses its selected environment configuration; local mobile environment files were preserved. Extended the safety test to check the portal URL as well. | The previously failing preview safety test passes. |

## Validation results

- Full `npm test`: 135 Node tests passed, zero failed, followed by all 15 repository check scripts passing.
- Targeted post-fix live verification: 13 checks passed, zero failed. Several checks contain multiple assertions, including upload, download, duplicate prevention and hours verification.
- Web and mobile TypeScript checks passed.
- Web ESLint passed with zero errors and 38 existing warnings.
- The local Docker production build passed, including its TypeScript and page generation stages.
- Local application readiness returned HTTP 200 after the container refresh.
- `git diff --check` reported no whitespace errors.

New regression coverage checks gateway prerequisites, completed upload and submission rejection without evidence removal, attendance policy query failure classification, and completion metadata for the mobile report screen. The branch migration check also verifies that the service account gains SELECT without UPDATE and that the migration can be applied twice.

## Database and fixture handling

The new migration is `20261024020657_attendance_branch_service_read.sql`, present in both migration directories. Its SQL was applied only to the local database and its local migration history was recorded. The unrelated pending course migration was not applied as part of this repair. No hosted staging or production migration was run.

Existing demo accounts and passwords were preserved. No Super Admin was created or changed. Student A remains at eight verified hours after temporary attendance checks were removed; Student B remains pending; Student C remains completed with 486 hours, the same final grade, and the exact same certificate row and verification code.

The completed example's evidence repair used the database's provider-only maintenance capability in one local transaction. Its certificate was held, removed and reinstated within that transaction while only the identified synthetic evidence references were repaired. The completion guard was never disabled, and the certificate row was compared before and after for exact equality. A local pre-repair evidence snapshot is retained privately.

Retained verification artifacts at the workspace root:

- `artifacts/panel-audit/fix-results.json`
- `artifacts/panel-audit/fix-tests-final.log`
- `artifacts/panel-audit/fix-lint.log`
- `artifacts/panel-audit/local-web-build.log`

The live fix verification can be repeated from the workspace root with `node artifacts/verify-panel-fixes.cjs`. It uses the private local demo account manifest, creates only temporary labeled test records, restores their original states and never prints passwords or signed URLs. The original audit result JSON remains unchanged as the before-fix evidence.

## Remaining presentation preparation

The mobile source changes require a rebuilt app or a reloaded development build. A shareable preview build must receive the matching portal and backend values through its preview environment; removing the LAN override does not provision those values in the hosted build service.

No native phone, visual browser, GPS hardware, face detection or real offline network transition was tested in this fix pass. The closed-placement replay check exercises the actual backend with a captured historical event; it does not replace offline capture and reconnect testing on the phone. Rehearse with the intended device, build and network before presenting.
