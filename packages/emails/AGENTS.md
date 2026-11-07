# packages/emails/

`@carlnotes/emails`, the React Email templates and the send every email goes through. `apps/api` imports it for the
auth, invite, and unsubscribe mail, and `@carlnotes/pipeline` for a Scan's topic scan email and report; it imports
`@carlnotes/db`, `@carlnotes/server`, `@carlnotes/contracts`, and `@carlnotes/nightshift`, with
`@react-email/components`, `@react-email/render`, `markdown-to-jsx`, and `react`.

- The templates, one `.tsx` file each, imported by name without the extension (`@carlnotes/emails/auth-email`):
  `topic-scan-email.tsx` (the scheduled Scan's email to its subscribers), `manual-scan-email.tsx` (the report of a
  Scan the user started by hand),
  `auth-email.tsx` (the mail Better Auth asks for), `topic-invite-email.tsx`, `team-invite-email.tsx`, and
  `report-email.tsx` (a content report to the support inbox, and the sweep's reminder for one left open, with the
  reported text and the admin console link), and `notifications-email.tsx` (the daily email about what others wrote
  on a user's things, with fixed lines and at most ten quotes). Each exports its component, a `render<Name>Email` for
  the HTML and a `render<Name>EmailText` for the plain text, and the invite, report, and manual scan templates their
  subject line.
- `emailShell.tsx` — the shell every template renders inside: `EmailShell`, `EmailIntro`, `EmailFooter`, `LinkOrText`,
  and the `summaryLink` and `footerBrandLink` styles.
- Colors and sizes: every color and font size a template writes comes from `@carlnotes/nightshift/email`: a Latte token
  from `emailColors`, `EMAIL_FONT_STACK`, and `toEmailFontSize` for a type role. `templateValues.test.ts`
  fails on a hex color or a pixel font size in a template. Line heights, weights, and spacing stay written in the style.
- `email.ts` — `sendEmail` sends one message through Resend, `sendEmailBatches` sends many, and `sendScanEmailCall`
  sends one Scan's batch and returns the accepted sends or the Resend failure. Every call from the api or the worker
  first takes a rate limit slot shared with inbound retrieval (`waitForResendSlot` in `@carlnotes/db/resendRateLimit`), which one call
  holds for 200 milliseconds, so calls leave evenly spaced at five a second. A call that would wait past ten seconds for
  the slot goes ahead without it, and each wait adds a little jitter, so waiters that woke together do not ask in
  lockstep. `EmailMessage` is the message shape, `isSendableAddress` says whether an address parses as an email, and
  `reportDroppedAddresses` reports the ones dropped by count, never by address.
- `unlinkedText.ts` — `toUnlinkedText` writes each url and domain in a user's text with bracketed dots so no mail
  client links it, and `toEmailQuote` cuts a quote to a length first. The report and notifications emails use them.
- `unsubscribe.ts` — the one-click unsubscribe tokens of the topic scan email and the notifications email:
  `signUnsubscribeToken` signs a recipient with a topic, or with the notifications kind, through
  `@carlnotes/server/hmac` at send time, and `verifyUnsubscribeToken` reads one back, or returns null for
  a tampered or malformed token. The routes are `apps/api/unsubscribe.ts`.
- Imports: `@carlnotes/db`, `@carlnotes/server`, `@carlnotes/contracts`, and `@carlnotes/nightshift`; never `models` or
  `pipeline`, which come after it, and never an app.
- Dev: `bun run dev:email` opens the React Email preview of this folder on port 3011. Tests: `bun test packages/emails`.

`personal-sources-email.tsx` renders Email Carl confirmations, clarification, and account, plan, or daily limit replies.
Numbered clarification accepts numbers and written Topic names. `personalSourcesEmail.ts` uses the shared sender,
confirmation-bound idempotency, original subject, and In-Reply-To/References headers. Carl's From and Reply-To use
RESEND_FROM_EMAIL.

`previewEmails.ts`, started by `bun run dev:email`, renders synthetic examples with Bun and serves temporary HTML through React Email on port 3011. Email Carl previews cover confirmation, numbered clarification, quota, and plan. Retired previews are removed from its temporary catalog. `reportEmail.ts` builds links and sends reports outside the previewable template.
