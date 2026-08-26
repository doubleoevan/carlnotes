## 1. Schema

- [x] 1.1 Add `invites.invited_user_id` referencing users with cascade delete, `invites.declined_at`, the per-target unique indexes on the invited user, and `users.invite_access` defaulting to anyone, with a `inviteAccess` value set in `shared/enums.ts`
- [x] 1.2 Generate and apply the migration. Additive only, no backfill
- [x] 1.3 Extend the schema test: the user unique indexes exist, and a link row with neither addressing is accepted

## 2. Creation: addressing, guardrails, connections

- [x] 2.1 Username creation for both targets: resolve the username against `users.username_normalized`, reject an unknown one before any write, set `invited_user_id`, send no email
- [x] 2.2 Resolve an email invite to its account when the address is known, setting `invited_user_id` beside the email, still sending the message
- [x] 2.3 One connection function: shared Team, active subscription to a sender's Topic, or a previously accepted invitation, derived at creation and stored nowhere
- [x] 2.4 The invite-access gate at creation, using that function for interacted-with, rejecting with a message that says the recipient is not accepting invitations
- [x] 2.5 The computed invite limit in `db/quotas.ts`, replacing the flat limit for every creation path: plan base times the age factor times the reputation factor, floor of one, doubled for connected recipients, admin bypass. Reputation is the accepted share among the sender's user invitations at least a week old, a still-pending week-old one counting as ignored
- [x] 2.6 Cover: the resolution rule, each connection derivation, and each invite-access setting in `api/invite/invites.smoke.ts`; the payload rejecting a user invite naming nobody in `shared/contracts.test.ts`; the age and reputation factors, the connected doubling, and the floor in `db/quotas.test.ts`; the unknown-username rejection and the no-mail username path verified live

## 3. Accept and decline

- [x] 3.1 Accept: the same write as accepting the token, subscribing to the topic or joining the team, from a route the two pages share
- [x] 3.2 Decline: stamp `declined_at`, drop the row from both pages, notify nobody, and keep the stamp through the topic-save reconciliation
- [x] 3.3 Cover accept and decline for both targets with the username addressing in `api/invite/invites.smoke.ts`; revocation and expiry share one code path (`toInviteRefusal`), covered across addressings in `api/invite/invites.test.ts`

## 4. The Activity page

- [x] 4.1 Rename the section labels: Your topic subscriptions, Your topic invitations. Labels only
- [x] 4.2 Received Topic invitations above the sent table: Topic, sender, date, accept, decline
- [x] 4.3 Sent rows render the identifier the sender used — username or address — with the query otherwise unchanged
- [ ] 4.4 Cover the renames, the received controls, the mixed-addressing rendering, and Team invitations never rendering here

## 5. The Teams page

- [x] 5.1 Keep Your teams as `add-teams` built it, with no subscriptions section, since a subscription names a Topic, never a Team
- [x] 5.2 Your team invitations: pending invitations with accept and decline, the same table component and column conventions as the Activity page
- [x] 5.3 The two sections in order — Your teams, then Your team invitations — and a Team never in two of them
- [ ] 5.4 Cover the section exclusivity, accept-equals-join, and Topic invitations never rendering here

## 6. Sender surfaces

- [x] 6.1 The username field beside the email field in the invite editor's Followers fields and the team membership fields — the share menu keeps no invite fields
- [ ] 6.2 Cover the inline rejection
- [x] 6.3 The invite-access control in the Account page settings, with the "People I interact with" copy for the connected value
- [x] 6.4 Update both domain-model skill copies: a Connection row (derived at invite creation from a shared Team, an active subscription, or a prior accepted invitation, never stored) and the invites layering line gains the second addressing

## 7. Verification

- [x] 7.1 `bunx biome check .`, `bunx tsc -b`, and `bun test` all clean
- [x] 7.2 With two dev accounts: invite by username to a Topic and a Team, watch the in-app-only delivery, accept one and decline one, watch reputation count them, set who may invite to connected from the Account page and watch a stranger rejected while a teammate passes
