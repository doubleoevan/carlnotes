## Context

An invite Topic's access list is `topic_invites`, keyed `(topic_id, email)`. The owner types addresses in the edit modal, each becomes a row, and `startInviteEmails` mails each new address an invitation whose link leads to the topic page. Access is keyed to the address, so `toInviteFindingsCutoff` in `api/topic/topics.ts` gates an invitee's Findings on their subscription's `created_at`, and pending is modelled as the absence of a subscription row instead of as a row of its own.

That model has one hole and it is not a small one. The owner must know the address, and the invitee must sign up with that exact address. An owner who wants to invite a group chat, or a person whose address they do not have, has nothing to hand them.

Two queued changes already assume the token this change lands: the share sheet hands it to the operating system, and Teams extends this table into a single invite table. So the shape chosen here outlives this change.

## Goals / Non-Goals

**Goals:**
- An owner can hand out a join link for an invite Topic without knowing anyone's address.
- The email invite keeps working exactly as it does today, as a row with an address.
- An owner can see the links that are live and withdraw one.
- The provider buttons open a composer where the user's own address book already is.
- The token is limited, expiring, and revocable from the day it ships, not after.

**Non-Goals:**
- Reading anyone's contacts. No OAuth, no contacts API, no stored credential.
- Learning who a compose button was sent to. The handoff is one way and stays that way.
- A `link` value on `topics.visibility`.
- Per-invitee plan accounting. The limits bound the fan-out instead.
- Changing what an invitee sees after they join. The Finding visibility cutoff is the Activity page change's rule and is inherited.

## Decisions

### Contact pickers are rejected, not deferred

The obvious request is to sign in to a provider, browse contacts, and pick invitees inside CarlNotes. It is not buildable at acceptable cost, and the reason should not be rediscovered.

The social platforms return either nothing or only friends who already use the app, and none of them return an email address. Google Contacts is the one API that returns real addresses, and it sits behind a sensitive scope and a recurring third-party security assessment. An integration broker such as Composio does not change this: it brokers OAuth to APIs the app is already permitted to call, and grants no app review, no pricing tier, and no partner status.

The substitute is that every major webmail provider opens its own compose window from a plain url, and that window already contains the user's address book. A Gmail compose url opens Gmail with the invite prewritten, type-aheads the recipient field against the user's contacts, and puts Google's full contact picker one click away behind the To label. That picker is the actual product here, supplied by the provider and reached without a contacts API.

Also rejected outright, so nobody proposes it later: putting a bcc to a CarlNotes address on the compose url and harvesting the recipients through inbound email. It is defeated by deleting the bcc, and quietly collecting a user's contacts is not a thing to build.

### Two invite paths, two security models, and the UI must not blur them

The handoff to a composer is one way. The app hands out a url and gets nothing back: not the recipients, not their addresses, not confirmation that anything was sent. A provider button therefore never populates the invitee list.

So the two paths are genuinely different, not two spellings of one feature. The typed email field is an allowlist: the owner names an address, the app knows who was invited, pending and accepted are distinguishable, and one person can be revoked. A compose button produces a link token: whoever holds it may join, and the owner sees a use count instead of a guest list. Both ship, and the section's copy has to make that legible at a glance without a paragraph of explanation.

Underneath, every token is deliberately a bearer credential, the email invite's included: any signed-in holder may accept it, bounded by its use limit — one use on an email invite — which is what lets an invitee who signed up under a different address than the one they were invited at still land inside the Topic. The recipient-only path is accepting from the invitations list, which checks the acceptor is the named recipient before it accepts.

### One table, not a second one

`topic_invites` already exists and already means "who may open this Topic". The token is a second way to arrive at the same grant, so it extends that table instead of sitting beside it.

The row gains its own `id` as the primary key, a `token`, a nullable `email`, `invited_by_user_id`, `max_uses`, `used_count`, `expires_at`, and `revoked_at`. The `(topic_id, email)` pair keeps a unique index so re-inviting an address stays a no-op, and because Postgres treats nulls as distinct, any number of link rows with a null email coexist under it. That is the same property the `subscriptions` subscriber index already relies on.

An email invite becomes a row with its address and `max_uses` of one, which is what it has always effectively been. A link invite has a null email and a limited `max_uses`.

### `topics.visibility` gains no `link` value

A link-invited Topic is an invite Topic whose grant arrived as a token instead of as an address. The thing a `link` value would record — that whoever holds the link may join — is already recorded on the invite row by a null email, a `max_uses`, and an `expires_at`, and it is a property of the invite instead of of the Topic. A Topic can hold both kinds at once, so a single Topic-level value could not describe it honestly anyway.

The cost of the alternative is the reason to be sure: a new enum value fans out through `shared/enums.ts`, the Postgres enum, the contracts, and every `visibility === "invite"` branch, including the Findings cutoff, the share menu's gating, and the preview route's visibility check. That is a wide blast radius to record something the invite row already says.

### Acceptance reuses the sign-in redirect the app already has

`GET /invite/:token` resolves the token, and a signed-out visitor is sent to sign-in and back. No new intent-preserving mechanism is needed: `LoginPage` already reads a `next` search parameter through `toSafeRedirectPath`, so the join route redirects to `/login?next=/invite/:token` and the round trip returns to the same url. Whatever the visitor does there — email, Google, or a fresh signup — returns them to the token.

The sign-in step SHALL be `SessionLayout` and not a surface of its own. `SessionLayout` detects an embedded webview and leads with email, because Google answers `403 disallowed_useragent` inside one. An invite link is opened from a mail client or a chat application more often than not, so a separate sign-in surface would put a dead Google button on the last step of the funnel.

### A rejection is a message, not an error

A revoked, expired, or exhausted token is an ordinary outcome of a link that travelled, and each has a different thing to tell the person holding it. They are answered in Carl's voice on a rendered page. A raw error, or one message for all three, leaves someone who was genuinely invited with no idea whether to ask for a new link.

### The abuse gates ship in this change

A token that travels by link is a spam vector aimed at a Topic the user who created it does not pay to scan, so the gates are part of the feature instead of a follow-up: `max_uses` is limited, tokens expire, Turnstile guards the acceptance route through the existing `TurnstileWidget`, and each account is limited on how many invites it may create per day, beside the other per-user counters in `db/quotas.ts`. Better Auth's own rate limiter covers auth paths only and does not reach a Hono route, so that limit is written where the scan quota is written.

The owner's list of active invites with a revoke control ships with them. A bearer token with no way to withdraw it is the one failure mode this feature can produce that a user cannot work around.

### Invitees do not count against the inviter's plan limits

A Scan's cost is amortized across everyone subscribed to the Topic, so more subscribers do not mean more scanning. The one per-head cost is the Resend send, and the limited `max_uses` plus the per-account daily create limit already bound how many heads one owner can add. Adding plan accounting for subscribers is a separate change, worth making when the sends actually show up in a bill instead of in advance of it.

### The compose urls live in one map

Every compose endpoint goes in one map of builder functions instead of inline at each button. These endpoints are conventions, not contracts, and providers have changed them before, so a dead endpoint must be a one-line fix and a new provider must be one entry.

That is also what keeps the list short today. The regional portals that double as social platforms — Naver and Daum in Korea, QQ in China, Mail.ru in Russia — and the large European and Indian providers — GMX, Web.de, Rediff — are all real and all unearned until analytics show users in those locales. Adding one later must cost a single entry.

The row is ordered by likelihood instead of alphabetically. The signed-in user's own account email domain is already known, so the row leads with their probable provider; their OAuth provider is not read, since the session does not include it and the address answers the same question. Outlook's consumer and work deeplinks differ, so both are included and picked between instead of shipping one and hoping. The button is labelled Outlook / Hotmail, because Hotmail folded into Outlook.com in 2013 and those addresses are still in wide use, so an Outlook-only label would not read as theirs to a hotmail.com user. Copy link stays reachable in every case.

### The existing invitation email includes a token now

The email invitation already exists and already mails a link to the topic page. That link becomes the invitee's own invite URL, including the one-use token created with their row, so an invitee who signs up with a different address than the one they were invited at still ends up inside the Topic. The email's words do not change.

## Risks / Trade-offs

- **A link forwarded onward lets someone the owner never named into the Topic.** → That is what a bearer token is, and the UI says so instead of implying the link named anyone. The limit, the expiry, and the revoke control bound it.
- **The primary key move is a real migration on a live table.** → The rows are few and the migration is mechanical: add the columns, generate an id and a token for each existing row, move the primary key, keep a unique on the pair. Every existing row keeps its address and gets one use, which is what it already had.
- **A person accepts a link on an account whose address is already on the allowlist.** → The subscription is created once. The acceptance is idempotent per user and Topic, and the second attempt reports that they are already in.
- **Proton may have no usable compose url.** → Then it falls back to the `mailto:` button instead of getting its own entry, which is one line in the map. This is verified against a real account before the button ships, not assumed from documentation.
- **A provider quietly changes its compose url and the button opens an empty composer.** → The map makes it a one-line fix, and the manual verification step for this change is watching each composer open prefilled on a real account of that provider.
- **The owner reads the provider button as having invited someone.** → The invite list shows link invites as a use count instead of as a name, and the section's copy distinguishes naming an invitee from handing out a link.

## Migration Plan

One Drizzle migration on `topic_invites`: add `id`, `token`, `invited_by_user_id`, `max_uses`, `used_count`, `expires_at`, and `revoked_at`, make `email` nullable, move the primary key from `(topic_id, email)` to `id`, and add a unique index on `(topic_id, email)`.

Existing rows are given an id and a token by the migration and `max_uses` of one, so every current invite keeps working and gains a link it never had. `invited_by_user_id` is nullable for exactly those rows, since the address that invited them was never recorded. Rolling back means dropping the added columns and restoring the composite key, which is only safe before any link invite exists.

## Open Questions

- Whether an exhausted token should be distinguishable from a revoked one to the person holding it, or whether both should read as "this link is closed". The rejection copy can settle it while the join page is being built.
