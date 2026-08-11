## Why

A password account that forgets its password is locked out permanently. There is no reset link, no change form, and no path back in short of an admin editing the database by hand — which is exactly what just happened in dev.

A signed-in user also cannot rotate a password they think has leaked. Both gaps sit on the one sign-in path we own end to end; Google and GitHub users already have recovery through their provider.

## What Changes

- **Forgot password.** The login form gains a "Forgot password?" link. Submitting an address sends a reset link through the existing Resend sender, and the response is identical whether or not that address has an account.
- **Reset page.** The link opens a page that takes a new password and signs the user in. The token is single-use and short-lived.
- **Change password.** The account page gains a change-password form that requires the current password.
- **Other sessions are revoked** on both a reset and a change. A password is changed because it might be known to someone else, so leaving their sessions alive defeats the point.
- **The reset request is gated by Turnstile**, reusing the challenge and the signed gate cookie that already protect password signup.
- Better Auth supplies `forgetPassword`, `resetPassword`, and `changePassword`; this change configures them, adds the email, and builds the three UI surfaces.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `user-auth`: password accounts gain reset and change flows, an enumeration-safe request response, session revocation on both paths, and a Turnstile gate on the reset request

## Impact

- `api/auth.ts` — `sendResetPassword`, the token lifetime, and `revokeSessionsOnPasswordReset`; the existing `emailAndPassword` block is where all of it lands.
- `worker/email.ts` — `EmailKind` gains `password-reset`. The reset email follows the verification email's minimal inline HTML rather than a react-email template, since it is one sentence and one link.
- `api/index.ts` — the reset request reuses the existing signup-gate endpoint's Turnstile verification, on top of Better Auth's ten-a-minute credential limiter.
- `ui/src/pages/LoginPage.tsx` — the "Forgot password?" link, on the login form only, where signup never shows it.
- `api/passwords.ts` — the 12-character floor and the known-breach check, enforced in the hasher every password path shares.
- `ui/src/pages/` — a reset page behind the tokened link, and a change-password section on the account page.
- `ui/src/App.tsx` — one new route, whose segment must be added to the username blocklist before it ships, since usernames live at the root.
- No schema change. Better Auth's `verifications` table already stores reset tokens, and `accounts.password` already holds the credential.

**There is no rate limiter in this codebase.** The reset request is the third endpoint in three changes to want one, after the username change and the publish gate. This change does not build one: it reuses Turnstile, which is already wired and is a better fit for an unauthenticated endpoint anyway. The other two still want a real limiter, and that remains unbuilt.
