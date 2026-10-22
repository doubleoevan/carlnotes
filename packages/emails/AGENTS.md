# packages/emails/

`@carlnotes/emails`, the React Email templates and the send every email goes through. `apps/api` imports it for the
auth, invite, and unsubscribe mail, and `@carlnotes/pipeline` for a Scan's digest and report; it imports
`@carlnotes/db`, `@carlnotes/server`, `@carlnotes/contracts`, and `@carlnotes/nightshift`, with
`@react-email/components`, `@react-email/render`, `markdown-to-jsx`, and `react`.

- The templates, one `.tsx` file each, imported by name without the extension (`@carlnotes/emails/auth-email`):
  `topic-scan-email.tsx` (the scheduled Scan's digest), `manual-scan-email.tsx` (the report of a Scan the user started
  by hand),
  `auth-email.tsx` (the mail Better Auth asks for), `topic-invite-email.tsx`, and `team-invite-email.tsx`. Each exports
  its component, a `render<Name>Email` for the HTML and a `render<Name>EmailText` for the plain text, and the invite and
  manual scan templates their subject line.
- `emailShell.tsx` — the shell every template renders inside: `EmailShell`, `EmailIntro`, `EmailFooter`, `LinkOrText`,
  and the `summaryLink` and `footerBrandLink` styles.
- Colors and sizes: every color and font size a template writes comes from `@carlnotes/nightshift/email`: a Latte token
  from `emailColors`, `EMAIL_FONT_STACK`, and `toEmailFontSize` for a type role. `templateValues.test.ts`
  fails on a hex color or a pixel font size in a template. Line heights, weights, and spacing stay written in the style.
- `email.ts` — `sendEmail` sends one message through Resend, `sendEmailBatches` sends many, and `sendScanEmailCall`
  sends one Scan's batch and returns the accepted sends or the Resend failure. Every call from the api or the worker
  first takes a rate limit slot shared in Redis (`takeRateLimitSlot` in `@carlnotes/db/redisRateLimits`), which one call
  holds for 200 milliseconds, so calls leave evenly spaced at five a second. A call that would wait past ten seconds for
  the slot goes ahead without it, and each wait adds a little jitter, so waiters that woke together do not ask in
  lockstep. `EmailMessage` is the message shape, `isSendableAddress` says whether an address parses as an email, and
  `reportDroppedAddresses` reports the ones dropped by count, never by address.
- `unsubscribe.ts` — the topic-scan email's one-click unsubscribe tokens: `signUnsubscribeToken` signs a recipient and
  topic through `@carlnotes/server/hmac` at send time, and `verifyUnsubscribeToken` reads one back, or returns null for
  a tampered or malformed token. The routes are `apps/api/unsubscribe.ts`.
- Imports: `@carlnotes/db`, `@carlnotes/server`, `@carlnotes/contracts`, and `@carlnotes/nightshift`; never `models` or
  `pipeline`, which come after it, and never an app.
- Dev: `bun run dev:email` opens the React Email preview of this folder on port 3011. Tests: `bun test packages/emails`.
