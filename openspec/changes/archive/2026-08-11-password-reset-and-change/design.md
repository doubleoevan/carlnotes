## Context

Sign-in is Better Auth with `emailAndPassword: { enabled: true }` plus Google and GitHub. Password signup is gated by Turnstile: `/api/signup-gate` verifies the token server-side and sets a short-lived signed cookie, which the `databaseHooks.user.create.before` hook checks and fails closed on. Verification email already goes out through `worker/email.ts` over Resend as one line of inline HTML.

Better Auth already implements `forgetPassword`, `resetPassword`, and `changePassword`, and stores reset tokens in the `verifications` table it owns. So this is configuration, one email, and three UI surfaces — not a new authentication mechanism.

Two things the codebase does not have: any rate limiter, and any password-management UI at all.

## Goals / Non-Goals

**Goals:**

- A locked-out password account can get back in without an admin touching the database.
- A signed-in user can rotate a password they think has leaked.
- Neither flow tells an attacker whether an address has an account.
- A password change actually ends the sessions it is meant to end.

**Non-Goals:**

- A general-purpose rate limiter for the app's own endpoints. Better Auth's limiter covers its own routes and is tuned here, but the username change and the publish gate live outside it and still want one.
- Password strength meters or rotation policies.
- Recovery for OAuth-only accounts. Google and GitHub own that, and we cannot reset a password that does not exist.
- Multi-factor anything.

## Decisions

**Turnstile on the reset request instead of a rate limiter.** An unauthenticated endpoint that sends email on demand is the classic abuse target: it can be pointed at any address, repeatedly, and every send costs money and reputation with Resend.

The obvious fix is a per-address rate limit, but there is no rate limiter in this codebase, and building one properly — a shared store, a window, a key strategy that is not defeated by rotating IPs — is a change of its own. Turnstile is already wired for password signup, already has server-side verification in `verifyTurnstileToken`, and is a better fit here anyway: a rate limiter throttles a determined attacker, while a challenge stops the automation before it starts. Reusing the existing gate-cookie pattern means the reset request costs one component and no new infrastructure.

This is not a substitute for the limiter the username change and publish gate still want. Those are authenticated endpoints where a challenge would be an insult to a real user, and they need a different answer.

**The response never says whether the address exists.** A reset form that answers differently for a known and unknown address is an account-enumeration oracle: an attacker learns who has an account here, which is the first step in credential stuffing and targeted phishing. The endpoint SHALL answer identically either way, and the UI says a link is on its way rather than confirming anything.

This includes the OAuth-only case. Someone who signed up with Google has no password to reset, and saying so would leak both that they have an account and which provider they use.

**Both paths revoke other sessions.** A password is reset because it was forgotten, and changed because it might be known to someone else. In the second case a live session belonging to whoever knew it is the whole risk, and leaving it alive makes the change theatre. Better Auth supports revoking on reset directly, and its `changePassword` takes the same option.

The current session stays alive on a change, so the user is not thrown out of the page they just used. A reset signs them in fresh.

**Changing a password requires the current one.** Otherwise anyone who reaches an unlocked laptop takes the account permanently, rather than just having a look around. It is one field and it is the difference between a session compromise and an account compromise.

**The reset email stays one line of inline HTML.** The verification email is already built that way, and the react-email templates in `emails/` exist for the scan digests, which carry findings, cards, and a footer. A reset link is a sentence and a URL; wrapping it in the digest shell would be more template than message.

**The link's route segment gets reserved before it ships.** Usernames live at the root, so a new top-level route can be shadowed by a username someone already holds. `usernames` states that rule and its blocklist is where the segment goes. This is the first change to test it since the rule was written.

## Risks / Trade-offs

**Turnstile can fail or be unavailable** → Password signup already depends on it and fails closed, so a reset is no worse off than a signup. It also means a Turnstile outage locks out password recovery entirely, which is the cost of not having a limiter.

**A reset link in email is a bearer token** → Short lifetime and single use limit the window. Mail is still the recovery channel for almost everything, and the alternative is an admin editing rows by hand, which is where this change started.

**Revoking sessions will surprise someone** → A user who changes their password on a laptop gets signed out on their phone. That is the intended behavior and the UI should say so at the moment of the change rather than leaving it to be discovered.

**Password requirements are length and breach history, never composition** → A rule demanding a symbol produces `Password1!` rather than entropy, and NIST 800-63B tells verifiers not to impose character-class rules. The floor is 12 characters, and the check that earns its place is against a known-breach corpus, since credential stuffing replays passwords that already leaked rather than guessing new ones. Both are enforced in the password hasher, which is the one point signup, reset, and change all pass through, so the three cannot drift.

**The breach lookup fails open** → A third party being down must not stop anyone setting a password. The length floor still applies in that case, and the failure is logged rather than swallowed so a permanently broken check cannot pass for a working one.

**Rate limiting was already there, and miscalibrated** → Better Auth ships a limiter enabled by default in production and disabled in development, at 100 requests per 10 seconds. That ceiling is reasonable for ordinary reads and far too loose for a login, where it allows ten guesses a second. The credential paths now carry custom rules at 10 per minute, and the limiter is enabled in development too, so the limits are exercised locally rather than first meeting real traffic in production.

## Open Questions

- Whether a reset should also clear the `usernameChanged` flag or any other per-account allowance. Assumed not: they are unrelated, and coupling them would make a recovery flow hand out entitlements.
