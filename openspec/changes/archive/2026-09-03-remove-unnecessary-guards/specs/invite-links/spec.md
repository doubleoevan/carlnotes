## REMOVED Requirements

### Requirement: An owner can see pending invites and revoke one

**Reason**: Closing an invite link is gone. A link that stopped working with no explanation read as a bug to the people holding it, and nobody using it understood what the control did. The route, the rejection reason, and the `revoked_at` column went with it.

**Migration**: Nothing replaces it. A link now ends only by running out of uses or reaching its expiry, both of which the acceptance page names. The one revoked link in production was cleared before the column was dropped, so no link changed what it admits.

### Requirement: A travelling token is limited, expiring, and rate limited

**Reason**: Its central claim, that the acceptance route carries the bot check, is what this change reverses. The bot gate belongs at account creation, where it already runs, and a second check at acceptance blocked real people whose browsers cannot complete a challenge while defending nothing the session requirement does not.

**Migration**: Replaced by "Tokens are guarded at the account, not the acceptance", which keeps the expiry, the per-plan use limit, and the per-account daily limit, and states where the bot gate actually lives.

## ADDED Requirements

### Requirement: Tokens are guarded at the account, not the acceptance

Every token SHALL have an expiry and a use limit read from the creator's plan at creation. Creating
SHALL be limited per account per day, and creating again while the caller already has a live link for
the target SHALL return that link instead of writing another, spending nothing. Reuse is scoped to
the caller's own links: a leader's team link auto-joins while a member's is a join request, so handing
one member another creator's token would change what the link admits.

The acceptance route SHALL require a session and nothing more. The bot gate lives at account
creation — password signup runs the bot check and OAuth accounts pass their provider's — so a
second check at acceptance defends nothing the session requirement does not, while blocking real
people whose browsers cannot complete a challenge.

#### Scenario: Accepting needs only a session

- **WHEN** a signed-in user posts an acceptance for a live token
- **THEN** it is accepted with no bot challenge, and a session-less post is rejected

#### Scenario: Creating twice hands back the same link

- **WHEN** an owner creates a link for a topic they already hold a live one for
- **THEN** their live link is returned, no row is written, and no daily-quota slot is spent

### Requirement: Containment applies where it contains anything

A link SHALL be rejected past its expiry or use limit only while it opens something the holder could
not reach anyway. A link whose Topic is currently public SHALL be accepted past both — the Follow
button on the public page already grants the same subscription — and its preview SHALL stay live.
The gate reads the Topic's visibility at acceptance, so a Topic made private is contained again from
that moment.


#### Scenario: A stale link to a public topic still works

- **WHEN** a signed-in user accepts an expired or exhausted link to a public Topic
- **THEN** they are subscribed as the Follow button would have

#### Scenario: A leaked private link is still contained

- **WHEN** a token opening a private Topic is past its use limit
- **THEN** it is rejected, and the page says to ask the inviter for a fresh link

### Requirement: A rejected team link becomes a join request

An expired or exhausted team token SHALL downgrade to a join request instead of a rejection: the
accepter appears as a not-yet-active member a leader can activate, and the page tells them a leader will
let them in. A team at its member limit SHALL be named as
full — its own acceptance status with its own copy — never reported as a used-up link.

#### Scenario: Person 26 becomes a join request

- **WHEN** someone accepts a team link past its use limit
- **THEN** a not-yet-active membership row is written and the page says a leader will let them in

#### Scenario: A full team is named as full

- **WHEN** an acceptance is rejected because the team is at its member limit
- **THEN** the page tells them the team is full, not that the link ran out
