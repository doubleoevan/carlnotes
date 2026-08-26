## Why

An invite can only name an email address. Inside the app that is backwards: people know each other by username — usernames are on every public Topic, profile, and team members — while addresses are exactly what people do not know about each other. Naming a recipient by username closes that gap, and it cannot ship bare: usernames are harvestable from those same public surfaces, so the new mode arrives together with the guardrails that keep it from becoming a spam channel, and with the page structure that makes two invitation kinds legible.

Depends on `add-teams`, which adds the single invites table with a target of Topic or Team. This change adds a second way to address that same object, the abuse controls the new addressing mode requires, and the section shapes of the two routing pages.

## What Changes

- The invites table gains a nullable `invited_user_id` beside the nullable `email` — a second identifier for the invite that already exists, never a second table or mechanism. The email column records which identifier the sender used, the user column records the resolved recipient, and per-target unique indexes on each give both the same re-invite no-op. Everything downstream of creation — expiry, revocation, acceptance, display — treats the two identically apart from whether an email is sent.
- The asymmetry is the anti-spam design, recorded as deliberate: an email invite sends a message and writes the row, because the recipient may have no account and email is the only way to reach them. A username invite writes the row only, and never sends mail — a row in the invitations section costs the recipient a glance, an inbox message is what makes an unwanted invite feel like spam. Email delivery must not be added to the username path for consistency's sake.
- An email invite sent to an address that already belongs to an account resolves to that account — the recipient sees one invitation, not an orphaned pending row — and the message still sends.
- Four guardrails: in-app-only delivery for unsolicited invitations; a per-sender invite limit scaled by account age and plan; accept-rate reputation that automatically lowers a sender's limit when their invitations are declined or ignored; and a invite-access setting of anyone, connected, or nobody, defaulting to anyone, changed from the Account page. The setting applies to both addressings — an email invite that resolves to an account consults it too.
- Connections are derived, never stored: sharing a Team, holding an active subscription to one of the sender's Topics, or having accepted an invitation from them before. Connected senders skip the recipient's restriction and get higher limits. No connection table, no friend requests.
- Routing: Topic invitations live on the Activity page, Team invitations on the Teams page — each beside the thing it concerns.
- Each page sits beside what it concerns and shows only what exists there. The Activity page keeps its three sections and renames two (label-only): Your subscriptions → Your topic subscriptions, Your invitations → Your topic invitations. The Teams page shows two sections — Your teams and Your team invitations with accept and decline — and no subscriptions section, because a subscription names a Topic, never a Team.
- Sender surfaces stay where `add-teams` put them: a username field sits beside the email field in the existing invite fields, an unknown username refused by name when the invitations send, with no invite ever written for it.

## Capabilities

### New Capabilities

- `invitations`: the two addressing modes and their deliberate asymmetry, the account resolution rule, the four guardrails, derived connections, and the section shapes of the two pages — three on Activity, two on Teams.

### Modified Capabilities

- `domain-schema`: the invites requirement gains `invited_user_id`, `declined_at`, and the per-target user unique indexes, and users gain the invite-access setting.
- `activity-page`: the two section renames, and the invitations section including received invitations with accept and decline beside the sent rows it already holds.
- `teams`: the teams index grows into the two-section Teams page, and the team page's membership controls gain the username field.
- `topic-editing`: the invitee editor gains the username field beside its email field.

## Impact

- `db/schema.ts` and one migration: `invites.invited_user_id` and `declined_at`, the per-target user unique indexes, and the `users.invite_access` column.
- `db/quotas.ts` and `api/invite/`: the scaled rate limit, reputation, the invite-access gate, connection derivation, and username creation with inline rejection.
- `api/activity.ts`, `ui/src/pages/ActivityPage.tsx`, `ui/src/components/table/InvitesTable.tsx`: renames, received rows, accept and decline.
- `ui/src/pages/TeamsPage.tsx` and the team api: the two sections.
- The invite controls in the invite editor and the team page's member fields: the username field.
- `ui/src/components/account/AccountSettings.tsx`: the invite-access control.

## Corrections to the prompt's premises

- **"Exactly one of the two set, enforced by a check constraint."** Two of the prompt's own rules break it: a link invite names nobody, and the resolution rule writes a row with both the address the sender used and the account it resolved to. So no check constrains the pair. What holds instead: each creation path sets its own column, resolution is the one sanctioned way both appear, and the per-target unique indexes on email and on invited user each make re-inviting a no-op — including across modes, since a resolved email invite occupies the same user slot a username invite would.
- **"The same table with the same query."** Today's Activity invitations table lists invitations the user *sent*, while the page-shape principle ends each page with "what you have been invited to", and the tests require accept and decline on both pages. Both are honored by reading the section as the user's invitations in both directions: the received rows offer accept and decline, the sent rows keep their columns and withdraw control, with the query widened to username rows.
- **"Backed by the follower count the team page already shows."** No followable Team object exists, and no follower count renders on the team page today. A subscription names a Topic, never a Team, so the Teams page lists no subscriptions section and no team-subscription table is added; a user reaches a team's Topics through the subscriptions the Activity page already lists.
