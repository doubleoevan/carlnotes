## MODIFIED Requirements

### Requirement: A compose button never names an invitee

The handoff to a composer is one way. The app SHALL NOT receive the chosen recipients, their addresses, or confirmation that anything was sent, and a compose button SHALL NOT add anyone to the Topic's invitee list.

The invite section SHALL make the difference clear: naming an address is an allowlist, where the owner knows who was invited, and a compose button hands out a bearer token, where whoever holds the link may join and the owner sees a use count. The UI SHALL NOT imply that opening a composer added anyone.

The app SHALL NOT attempt to recover recipients by any means, including a bcc to a CarlNotes address harvested through inbound email.

#### Scenario: Opening a composer adds no invitee

- **WHEN** a user opens a provider's composer from the invite section and sends the invitation
- **THEN** the Topic's invitee list is unchanged and no address is recorded

#### Scenario: A link invite shows a count, not a name

- **WHEN** an owner views the invites for a Topic
- **THEN** a link invite is shown by the uses it has left, while an email invite is shown by the address it named

### Requirement: An invite URL previews as what it opens

`GET /invite/:token` SHALL serve the preview image of the Team or Topic the token opens, titled as an invitation naming it, so an invitation pasted into a message reads as one instead of as a page.

The title SHALL name the act the token grants, which differs by target: a Team invitation reads "Join {team} on CarlNotes" and a Topic invitation reads "Follow {topic} on CarlNotes", since accepting a Topic invitation subscribes the reader and the app's copy calls that following.

Its `og:url` SHALL be the invite URL, so a platform that rewrites a shared link to it hands the reader the invitation and not the page. The URL SHALL be marked no-index, since a token is a credential and belongs in no search result.

Serving the preview SHALL NOT accept the invitation, spend a use, or require a session. Acceptance remains a signed-in POST behind the bot check, so a link previewed by a messaging client or a crawler consumes nothing.

A token that is unknown, expired, or exhausted SHALL fall through to the site's own tags, so a link nobody can act on advertises no Team or Topic.

An invitation SHALL show only a card the origin already serves to anyone holding its id. A Topic's card is served for any visibility, so a Topic invitation always previews. A Team's card is served only for a public Team, so an invitation to a private Team falls through to the site's own tags instead of showing a card its image route would refuse to render.

#### Scenario: An invitation previews as its team

- **WHEN** a message client fetches an invite URL for a live token opening a public team
- **THEN** the response carries that team's preview image, titled "Join {team} on CarlNotes"

#### Scenario: A private team's invitation shows the site's own tags

- **WHEN** a message client fetches an invite URL for a live token opening a non-public team
- **THEN** the response carries the site's own tags and names no Team

#### Scenario: An invitation is never indexed, and never rewritten to its page

- **WHEN** an invite URL is fetched
- **THEN** the response is marked no-index and its `og:url` is the invite URL

#### Scenario: An invitation previews as its topic

- **WHEN** a message client fetches an invite URL for a live topic token
- **THEN** the response carries that topic's preview card, titled "Follow {topic} on CarlNotes"

#### Scenario: Unfurling spends nothing

- **WHEN** an invite URL is fetched without a session
- **THEN** no use is spent, no membership or subscription is written, and the token stays acceptable

#### Scenario: A dead token advertises nothing

- **WHEN** an invite URL is fetched for an expired, exhausted, or unknown token
- **THEN** the response carries the site's own tags and names no Team or Topic

## REMOVED Requirements

### Requirement: A refused token says which way it failed, in Carl's voice

**Reason**: It named a revoked token as one of three ways a token fails. Closing an invite link was removed with its column in migration 0084, so no token can be revoked.

**Migration**: Replaced by "A rejected token says which way it failed, in Carl's voice", which keeps the expired and exhausted rejections and the rule that no rejection creates a subscription, and drops the revoked one. The title says rejected because refused was renamed to rejected throughout.

## ADDED Requirements

### Requirement: A rejected token says which way it failed, in Carl's voice

An expired or exhausted token SHALL be rejected with a rendered message in Carl's voice instead of a raw error, and the two SHALL be distinguishable enough that the person holding the link knows whether asking for a new one would help. No rejection SHALL create a subscription.

#### Scenario: An expired token is rejected

- **WHEN** a visitor opens an invite URL for a token past its expiry
- **THEN** they are told the link has expired, and no subscription is created

#### Scenario: An exhausted token is rejected

- **WHEN** a visitor opens an invite URL for a token whose uses are spent
- **THEN** they are told the link has been used up, and no subscription is created
