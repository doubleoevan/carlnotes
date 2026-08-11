## 1. The reset email

- [x] 1.1 Add `password-reset` to `EmailKind` in `worker/email.ts`
- [x] 1.2 Write the reset email as one line of inline HTML beside `sendVerificationEmail` in `api/auth.ts`, rather than a react-email template, since it is a sentence and a link
- [x] 1.3 Wire `sendResetPassword` in the `emailAndPassword` block and set a short token lifetime

## 2. Reset

- [x] 2.1 Add the reset-request endpoint, answering identically whether or not the address has an account, and sending nothing when it does not
- [x] 2.2 Give the same answer for an address whose account has no password credential, naming no provider
- [x] 2.3 Gate the request on the existing Turnstile gate cookie, verified server-side and failing closed, reusing `verifyTurnstileToken` and the signup-gate pattern
- [x] 2.4 Turn on `revokeSessionsOnPasswordReset`, so every session from before the reset stops authenticating
- [x] 2.5 Enforce the signup password minimum on the reset, so the three ways a password is set cannot drift

## 3. Change

- [x] 3.1 Add the change-password endpoint requiring the current password, revoking other sessions and keeping the acting one
- [x] 3.2 Refuse and change nothing when the current password is wrong

## 4. UI

- [x] 4.1 Add "Forgot password?" to the login form in `ui/src/components/session/SessionLayout.tsx`, on the login path only, since the component is shared with signup
- [x] 4.2 Add the reset page behind the tokened link, with the Turnstile widget on the request form
- [x] 4.3 Add the change-password section to the account page, reusing the reveal toggle the session form already has
- [x] 4.4 Say that other sessions were signed out when a change succeeds
- [x] 4.5 Add the new route in `ui/src/App.tsx`, and add its segment to the username blocklist in `shared/usernames.ts` in the same change, since a username at the root would shadow it

## 5. Verify

- [x] 5.1 `bash scripts/preflight.sh` is green
- [x] 5.2 Test that the request answers identically for a known address, an unknown address, and an OAuth-only address
- [x] 5.3 Test that a reset link is refused on second use and after expiry
- [x] 5.4 Check the whole flow against a real seeded account: request, email, reset, sign-in, and that a session opened beforehand no longer authenticates
- [x] 5.6 Test that a breached password is refused, and that an unreachable corpus fails open to the length floor
- [x] 5.5 Check that a change with the wrong current password is refused, and that a correct one keeps the acting session while ending another. Verified end to end against a throwaway account: a wrong current password answers 400 and changes nothing, both sessions survive it, and the old password still signs in. A correct one is accepted, ends the other session, and stops the old password working. Better Auth rotates the session cookie on success, so the caller stays signed in through the replacement the response sets rather than through the token it arrived with
