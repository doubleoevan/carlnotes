## 1. The invite token

- [x] 1.1 Extend `topic_invites` in `db/schema.ts`: its own `id` primary key, a unique `token`, a nullable `email`, a nullable `invited_by_user_id`, `max_uses`, `used_count`, a nullable `expires_at`, and a nullable `revoked_at`, keeping a unique index on the topic and address pair so re-inviting an address stays a no-op
- [x] 1.2 Generate the migration with `bun run db:generate` and apply it with `bun run db:migrate`, giving every existing row an id, a token, and one use, so today's invites keep working and gain a link they never had
- [x] 1.3 Add the per-account daily create limit beside the other counters in `db/quotas.ts`

## 2. Creating, listing, and revoking

- [x] 2.1 Add `api/topic/invites.ts` with a route that creates an invite, authorized on the same authority that may invite to the Topic and rejected past the daily limit
- [x] 2.2 List a Topic's pending invites for its owner, each with its kind, its use count, its expiry, and whether it is revoked
- [x] 2.3 Revoke an invite by stamping `revoked_at`, leaving every subscription already created from it in place
- [x] 2.4 Cover creating, the authority check, and revocation in `api/invite/invites.smoke.ts`, with the limit arithmetic in `db/quotas.test.ts`

## 3. Acceptance

- [x] 3.1 Add `GET /invite/:token`: resolve the token, and for a signed-in visitor holding a valid one create the active subscription and land them on the Topic, incrementing `used_count`
- [x] 3.2 Make acceptance idempotent per user and Topic, so a second acceptance creates no second subscription and reports no error
- [x] 3.3 Reject a revoked, expired, or exhausted token with its own message in Carl's voice on a rendered page, never a raw error, and create no subscription
- [x] 3.4 Send a signed-out visitor to `/login?next=/invite/:token`, reusing the `next` parameter `LoginPage` already reads through `toSafeRedirectPath` instead of adding an intent mechanism
- [x] 3.5 Render the sign-in step through `SessionLayout`, so its embedded-webview handling leads with email where Google's OAuth would answer `403 disallowed_useragent`
- [x] 3.6 Put the existing `TurnstileWidget` bot check on the acceptance route
- [x] 3.7 Cover a valid acceptance and a repeat acceptance in `api/invite/invites.smoke.ts`, the three rejections in `api/invite/invites.test.ts`

## 4. The compose buttons

- [x] 4.1 Add `ui/src/lib/composeUrls.ts` holding one map of builder functions, one entry per provider, so a changed endpoint is a one-line fix and a new provider is one entry
- [x] 4.2 Include Gmail, Outlook / Hotmail with both its consumer and work deeplinks, Yahoo Mail, Proton Mail, and `mailto:` for everyone else. Label the Outlook button Outlook / Hotmail, since those addresses are still in wide use
- [x] 4.3 Order the row by likelihood, leading with the provider suggested by the signed-in user's own account email domain
- [x] 4.4 Render the row in `ui/src/components/topic/EditTopicFields.tsx` beneath the typed email field, with copy link alongside, each button creating a token and opening its composer
- [x] 4.5 Write the section's copy so naming an address reads as an allowlist and a compose button reads as handing out a link, without a paragraph of explanation
- [x] 4.6 Add the pending-invite list with its revoke control, showing an email invite by its address and a link invite by its use count
- [x] 4.7 Cover the builders' subject and body encoding for every provider in the map, and the ordering putting the user's own domain first

## 5. The invitation email

- [x] 5.1 Point the link in `emails/topic-invite-email.tsx` at the invitee's own invite URL, including the one-use token created with their row, so an invitee who signs up with a different address still ends up inside the Topic. Its one line saying access is keyed to the invited address is corrected, since with a token it no longer is

## 6. Verification

- [x] 6.1 `bunx biome check .`, `bunx tsc -b`, and `bun test` all clean
- [ ] 6.2 Before building the buttons, open a Gmail compose url by hand and click the To label. Confirm the contact picker is one click from the prefilled composer, and repeat in Outlook, since that click is the whole reason these beat a plain `mailto:`
- [ ] 6.3 Test every compose url on a real account of that provider and watch the composer open prefilled. Documentation is stale across the board and this is the only reliable check
- [ ] 6.4 Confirm which Outlook deeplink a consumer account and a work account each need, instead of shipping one and hoping
- [ ] 6.5 Confirm whether Proton has a usable compose url at all. If it does not, it falls back to the `mailto:` button instead of getting its own entry
- [ ] 6.6 Open an invite URL inside a mail client's embedded browser and confirm the sign-in step leads with email instead of a Google button that cannot work there
- [ ] 6.7 Accept a link end to end from a second account: the Topic opens, the use count moves, and the new subscriber sees Findings only from Scans after they joined
- [ ] 6.8 Revisit the provider list only when analytics show a locale that justifies it. Naver, Daum, QQ, Mail.ru, GMX, Web.de, and Rediff are all real and all unearned today
