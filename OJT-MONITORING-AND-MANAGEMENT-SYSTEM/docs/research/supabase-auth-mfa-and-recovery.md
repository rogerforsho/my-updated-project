# Supabase MFA and Password Recovery Research

**Reviewed:** 2026-10-20  
**Question:** What Supabase Auth behavior must the OJT app account for when enforcing Super Admin TOTP MFA and sending password recovery links to web and mobile?

## Findings

### TOTP enrollment and sign-in

- Supabase TOTP enrollment is a three-step flow: call `auth.mfa.enroll({ factorType: 'totp' })` to create an unverified factor and obtain its QR/secret; call `auth.mfa.challenge({ factorId })`; then call `auth.mfa.verify({ factorId, challengeId, code })` with the authenticator code. Successful verification activates the factor. ([TOTP guide](https://supabase.com/docs/guides/auth/auth-mfa/totp), [enroll API](https://supabase.com/docs/reference/javascript/auth-mfa-enroll))
- A conventional sign-in produces `aal1`. A session becomes `aal2` after the user proves a second factor. `getAuthenticatorAssuranceLevel()` reports `currentLevel` and `nextLevel`; `aal1` with `nextLevel: 'aal2'` means a factor is enrolled but has not yet been verified in that session. ([AAL API](https://supabase.com/docs/reference/javascript/auth-mfa-getauthenticatorassurancelevel), [TOTP guide](https://supabase.com/docs/guides/auth/auth-mfa/totp))
- Supabase documents that adding the MFA interface alone does not enforce MFA. The app must enforce its rule in the relevant frontend, backend/API, and database/RLS paths. For this app, a Super Admin UI gate should be backed by server-side checks of the verified session's assurance level; do not treat the presence of an enrolled factor as proof that the current session is `aal2`. ([MFA guide](https://supabase.com/docs/guides/auth/auth-mfa))
- Supabase exposes project settings that can disable TOTP enrollment or verification. If either is disabled, the corresponding enrollment or sign-in challenge flow cannot complete; confirm the project Auth settings when enabling the feature. ([MFA guide](https://supabase.com/docs/guides/auth/auth-mfa), [Auth error codes](https://supabase.com/docs/guides/auth/debugging/error-codes))

### Password recovery redirects

- `resetPasswordForEmail(email, { redirectTo })` uses `redirectTo` as the return URL for the email link. That URL must match an entry in the project's Auth Redirect URLs allow list. If omitted, Supabase uses the configured Site URL, which also matters for password-reset email links. ([Password-based Auth](https://supabase.com/docs/guides/auth/passwords), [Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls))
- Supabase permits deep-link URI schemes for mobile apps, but the exact URI used by the app must be present in the redirect allow list. Production should use exact redirect paths where possible; broad wildcard entries should be reserved for cases that need them. ([Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls))
- After the recovery link redirects to the app, the user must be in an authenticated recovery session before the app accepts a new password and calls `auth.updateUser({ password })`. ([Password-based Auth](https://supabase.com/docs/guides/auth/passwords))
- If the email template constructs its own confirmation URL and the request specified `redirectTo`, Supabase documents using `{{ .RedirectTo }}` in place of `{{ .SiteURL }}` so the configured return destination is retained. ([Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls), [Email Templates](https://supabase.com/docs/guides/auth/auth-email-templates))

## Implementation implications

1. Enforce `aal2` for Super Admin protected actions on the server as well as in the UI; verify this behavior with a session at `aal1` and one at `aal2`.
2. Configure the production web callback path and the mobile recovery deep-link URI in Supabase Auth's Redirect URLs. Confirm the Site URL and email template use the intended redirect destination.
3. Test the full email-to-app recovery flow on each supported platform. A successful call to `resetPasswordForEmail` alone does not prove that the configured link returns to the correct app or that the app has exchanged/recognized the recovery session.

This note records platform behavior and implementation constraints. It does not change Supabase project settings or contact production.
