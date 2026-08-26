## Why

An invite Topic takes invitees by email address and nothing else. That works for someone who already has an account, and it does very little for anyone who does not: the address is written to `topic_invites`, an invitation email goes out, and access is keyed to that exact address, so an invitee who signs up with a different one is locked out of the Topic they were invited to. There is no link an owner can hand to a person whose address they do not know.

A tokenized invite URL closes that gap, and it is the thing every later invite path builds on. The share sheet change builds on this token, and the Teams change extends this table.

## What Changes

- `topic_invites` gains a token, so an invite is a link as well as an address. It gains its own `id`, a nullable `email`, `invited_by_user_id`, `max_uses`, `used_count`, `expires_at`, and `revoked_at`. An email invite becomes a row with an address and one use, so today's behaviour is preserved instead of replaced.
- `GET /invite/:token` accepts a token: it resolves the token, rejects a revoked, expired, or exhausted one in Carl's voice instead of with a raw error, sends a signed-out visitor through sign-in and back, and creates the subscription active.
- The invite section keeps its typed email field and its Invite button unchanged, and gains a row of buttons that each create a token and open a webmail provider's own compose window with the invite prewritten: Gmail, Outlook / Hotmail, Yahoo Mail, Proton Mail, and the default mail client through `mailto:`. Copy link sits alongside as the universal fallback.
- The owner gets a list of the Topic's active invites with a revoke control, since a link that cannot be withdrawn is the first support request this would otherwise earn.
- The acceptance route has Turnstile, and each account is limited on how many invites it may create per day.
- **BREAKING** for the schema only: `topic_invites` moves off its `(topic_id, email)` composite primary key onto its own `id`, keeping a unique on the pair so re-inviting an address stays a no-op.

## Capabilities

### New Capabilities
- `invite-links`: the invite token, the compose-button handoff, the join route and what it refuses, the revoke control, and the abuse and cost gates that ship with them.

### Modified Capabilities
- `domain-schema`: `topic_invites` includes a token, a nullable email, a use limit and count, an expiry, and a revocation, and its primary key moves to its own id.
- `topic-editing`: the invitee editor gains the provider compose row, the copy-link fallback, and the active-invite list with its revoke control.

## Impact

- `db/schema.ts` and one Drizzle migration: the new `topic_invites` columns and the primary key move, with existing rows given an id and a token in the migration.
- `db/quotas.ts`: the per-account daily create limit.
- `api/topic/invites.ts`: creating, listing, and revoking.
- `api/invite/invites.ts` and `ui/src/pages/InvitePage.tsx`: acceptance, its refusals, and its sign-in step.
- `ui/src/components/topic/EditTopicFields.tsx`: the invitee editor's new row and invite list.
- `ui/src/lib/composeUrls.ts`: one map of provider compose-url builders.
- `emails/topic-invite-email.tsx`: the existing invitation's link becomes an invite URL with the invitee's own one-use token.
- No change to `topics.visibility`, whose values stay public, invite, and private.

## Corrections to the queue row's premises

Two claims in the prompt this change came from do not match the code, and the design proceeds from the code:

- **"Today no email is sent at all."** Not so. `startInviteEmails` in `api/topic/topics.ts` sends `emails/topic-invite-email.tsx` on topic creation and to newly added addresses on edit. So an email invite already mails the invitee, and the open question of whether it should is settled by it already doing so.
- **"The invite writes a pending subscription row that the invitee approves on their own Activity page."** No row is written. Pending is the absence of a subscription row for the invited address, which is what the Activity page's invite table reports by left-joining subscriptions, and the invitee subscribes from the Topic itself. Acceptance therefore creates the subscription row that did not exist, instead of flipping one.
