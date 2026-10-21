# Transactional email queue

Student approvals and rejections are committed with the in-app notification, audit row, and a PGMQ message. Supervisor welcome messages are queued after the account profile is created. A protected Next.js worker sends the existing templates through Resend so provider latency does not hold up web requests. Password recovery uses Supabase's single-use email link; legacy queued OTP reset messages are discarded by the worker and are never sent.

Failed account-status and supervisor-welcome deliveries are retried after the 60-second queue visibility timeout. Messages with more than five failed attempts are archived in PGMQ for operator review. Legacy password-reset messages are discarded immediately because recovery codes are no longer part of the account-recovery flow. Resend idempotency keys prevent duplicate emails when the provider accepts a message but queue acknowledgement times out.

## Deploy

1. Apply these migrations in timestamp order: `20261016004509_architecture_security_and_async_email_queue.sql`, `20261016035254_remediate_security_definer_api_findings.sql`, then `20261019022203_rate_limit_student_submissions_and_require_id_cards.sql`. The last migration enables the new rate-limit actions and requires stored front and back ID images. Both migration directories contain the files.
2. Deploy the Next.js app with the mobile upload and attendance BFF routes.
3. Release a compatible mobile build that uploads through those BFF routes.
4. After the web and mobile clients are updated, apply `20261019023106_enforce_server_mediated_student_writes.sql`. It blocks direct student attendance/report writes and direct authenticated Storage uploads; the BFF service and signed-upload flows remain available.
5. Apply `20261019054700_student_registration_resubmission.sql` after revision 38. The registration resubmission route requires its revision 39 RPC. Both migration directories contain the file.
6. Apply `20261019070000_attendance_assignment_date_credit_guard.sql` after revision 39. It prevents verified attendance outside an assignment's date range from earning hours and corrects existing out-of-range credits to zero. Both migration directories contain the file.
7. Keep `RESEND_API_KEY`, optional `RESEND_FROM_EMAIL`, a long random `CRON_SECRET`, and optional `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` in the deployment environment. Do not commit these values.
8. In the Supabase Dashboard, enable the `pg_cron`, `pg_net`, and Vault extensions if they are not already enabled.
9. Store the worker URL and authorization value in Vault. Substitute the deployed origin and the same `CRON_SECRET` used by Next.js:

   ```sql
   select vault.create_secret(
     'https://your-portal.example/api/internal/process-transactional-email',
     'transactional_email_worker_url'
   );
   select vault.create_secret(
     'Bearer replace-with-the-configured-cron-secret',
     'transactional_email_worker_authorization'
   );
   ```

10. Schedule a one-minute worker call:

   ```sql
   select cron.schedule(
     'transactional-email-worker',
     '* * * * *',
     $$
       select net.http_post(
         url := (select decrypted_secret from vault.decrypted_secrets where name = 'transactional_email_worker_url'),
         headers := jsonb_build_object(
           'Content-Type', 'application/json',
           'Authorization', (select decrypted_secret from vault.decrypted_secrets where name = 'transactional_email_worker_authorization')
         ),
         body := '{}'::jsonb
       );
     $$
   );
   ```

11. Confirm the Cron run history returns HTTP 200 and inspect Supabase Queues for pending or archived messages. Worker logs contain only static failure descriptions and delivery counters, never recipient addresses, one-time codes, or rejection reasons.

For a secret or URL rotation, update the Vault secret. To disable processing, unschedule `transactional-email-worker`; queued messages remain in the database.

## Sentry configuration

Set `SENTRY_DSN` for server and edge reporting and `NEXT_PUBLIC_SENTRY_DSN` for browser reporting. Both can remain unset during local development. `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, and `SENTRY_PROJECT` are optional build-only values for source-map uploads; they must be injected by the deployment environment and must never be added to a client bundle.

The browser/server integrations disable default PII collection and scrub cookies, headers, bodies, query strings, user identity fields, and console breadcrumbs. Session Replay is not enabled. Expo's Sentry React Native SDK requires native code and cannot run inside Expo Go; enabling mobile crash capture requires adopting a custom Expo development build.
