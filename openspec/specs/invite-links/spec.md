# invite-links Specification

## Purpose
TBD - created by archiving change add-invite-links. Update Purpose after archive.
## Requirements
### Requirement: An invite is a token, and a link is how it travels

An invite SHALL have a token, and the token SHALL be acceptable at an absolute `/invite/:token` url. An email invite SHALL name one address and carry a single use, and a link invite SHALL name no address and carry a limited number of uses. Every token is deliberately a bearer credential, the email invite's included: any signed-in holder SHALL be able to accept it, bounded by its use limit, with acceptance never checking the accepter's address — the recipient-only path is accepting from the invitations list. Both SHALL grant the same access to the same Topic.

Creating one SHALL be available only to a user authorized to invite to the Topic, and every token SHALL record who created it, except for the invites that existed before tokens did.

#### Scenario: A link invite is created with no address

- **WHEN** an owner creates an invite link for their Topic
- **THEN** a token is created with no email, a limited number of uses, and an expiry, and the invite URL for it is handed back

#### Scenario: An email invite is a one-use token

- **WHEN** an owner invites an address by typing it
- **THEN** the invite row has that address and a single use, and the invitation email links to that token's invite URL

#### Scenario: Only an authorized user may create

- **WHEN** a user who may not invite to a Topic asks to create a token for it
- **THEN** the api rejects it and no token is created

### Requirement: The join route accepts a token and subscribes the accepter

`GET /invite/:token` SHALL resolve the token and, for a signed-in visitor holding a valid one, create an active subscription to the Topic and land them on it. Acceptance SHALL increment the token's use count.

Accepting a valid token for a Topic the visitor already actively subscribes to SHALL answer joined before the limit is consulted: no use is spent, no second subscription is created, and it is never reported as a failure.

What the new subscriber may then see SHALL follow the rule already in force for invite Topics: a subscriber sees Findings from Scans that ran after their subscription became active, and the same next-scheduled-scan disclaimer applies at the moment they join.

#### Scenario: A valid token subscribes the visitor

- **WHEN** a signed-in visitor opens an invite URL for a valid token
- **THEN** an active subscription to the Topic is created, the use count increases by one, and they land on the Topic

#### Scenario: Accepting twice subscribes once

- **WHEN** a visitor who is already subscribed opens the invite URL again
- **THEN** they are answered joined before the limit is consulted, no use is spent, and no second subscription is created

#### Scenario: A new subscriber sees Findings from later Scans

- **WHEN** a visitor accepts a token and opens the Topic
- **THEN** they see Findings from Scans that ran after their subscription became active, with the next-scheduled-scan disclaimer

### Requirement: A signed-out visitor is carried through sign-in and back

A signed-out visitor opening an invite URL SHALL be sent to sign in and returned to the same invite URL afterwards, with the join intent preserved across the round trip. It SHALL be sent in the `next` search parameter the sign-in page already reads, instead of by a mechanism of its own.

The sign-in step SHALL render the app's shared session layout, so that its embedded-webview handling applies. An invite link is opened inside a mail client or a chat application more often than not, and Google's OAuth rejects an embedded webview, so a sign-in surface without that handling would put a dead provider button at the end of the funnel.

#### Scenario: Sign-in returns to the invite URL

- **GIVEN** a signed-out visitor opening an invite URL
- **WHEN** they finish signing in or signing up
- **THEN** they return to the same invite URL and the token is accepted

#### Scenario: The sign-in step is the shared session layout

- **WHEN** the join route asks a visitor to sign in
- **THEN** it renders the shared session layout, so an embedded webview leads with email sign-in instead of a provider button that cannot work

### Requirement: A refused token says which way it failed, in Carl's voice

A revoked, expired, or exhausted token SHALL be rejected with a rendered message in Carl's voice instead of a raw error, and the three SHALL be distinguishable enough that the person holding the link knows whether asking for a new one would help. No rejection SHALL create a subscription.

#### Scenario: A revoked token is rejected

- **WHEN** a visitor opens an invite URL for a token the owner revoked
- **THEN** they are told the link is no longer good, in Carl's voice, and no subscription is created

#### Scenario: An expired token is rejected

- **WHEN** a visitor opens an invite URL for a token past its expiry
- **THEN** they are told the link has expired, and no subscription is created

#### Scenario: An exhausted token is rejected

- **WHEN** a visitor opens an invite URL for a token whose uses are spent
- **THEN** they are told the link has been used up, and no subscription is created

### Requirement: Provider compose buttons hand the invite to a webmail composer

The invite section SHALL offer a row of buttons that each create a token and open a webmail provider's own compose window with the invitation prewritten: Gmail, Outlook / Hotmail, Yahoo Mail, Proton Mail, and the default mail client through `mailto:`. Copy link SHALL remain reachable alongside them in every case.

The Outlook button SHALL be labelled Outlook / Hotmail, because Hotmail merged into Outlook.com and those addresses remain in wide use, and SHALL include both the consumer and the work deeplink and pick between them instead of shipping one. Proton SHALL fall back to the `mailto:` button if it has no working compose url.

The row SHALL be ordered by likelihood instead of alphabetically, leading with the provider the signed-in user's own account email domain names. Their OAuth provider is not read: the session does not include it, and their address already answers the same question for every provider in the row.

Every compose url SHALL be built by one map of builder functions instead of inline at each button, so a changed endpoint is a one-line fix and a new provider is one entry.

#### Scenario: A compose button opens a prefilled composer

- **WHEN** a user activates the Gmail button in the invite section
- **THEN** a token is created and Gmail's compose window opens with the invitation and the invite URL prewritten

#### Scenario: The row leads with the user's own provider

- **WHEN** the invite section renders for a user whose account email is a Gmail address
- **THEN** the Gmail button is first in the row

#### Scenario: A new provider is one entry

- **WHEN** a provider is added to the compose-url map
- **THEN** its button appears in the row with no other change

### Requirement: A compose button never names an invitee

The handoff to a composer is one way. The app SHALL NOT receive the chosen recipients, their addresses, or confirmation that anything was sent, and a compose button SHALL NOT add anyone to the Topic's invitee list.

The invite section SHALL make the difference clear: naming an address is an allowlist, where the owner knows who was invited and one person can be revoked, and a compose button hands out a bearer token, where whoever holds the link may join and the owner sees a use count. The UI SHALL NOT imply that opening a composer added anyone.

The app SHALL NOT attempt to recover recipients by any means, including a bcc to a CarlNotes address harvested through inbound email.

#### Scenario: Opening a composer adds no invitee

- **WHEN** a user opens a provider's composer from the invite section and sends the invitation
- **THEN** the Topic's invitee list is unchanged and no address is recorded

#### Scenario: A link invite shows a count, not a name

- **WHEN** an owner views the invites for a Topic
- **THEN** a link invite is shown by the uses it has left, while an email invite is shown by the address it named

### Requirement: An owner can see pending invites and revoke one

The owner SHALL be shown the Topic's invites that are still good, each with what it is, how much of it is spent, when it expires, and a control that revokes it. Revoking SHALL take effect immediately for every holder of that link and SHALL NOT touch any other invite or any subscription already created from it.

#### Scenario: Revoking closes the link

- **WHEN** an owner revokes an invite
- **THEN** the invite URL for its token stops accepting from that moment

#### Scenario: Revoking keeps the people who already joined

- **WHEN** an owner revokes a link that has already been accepted
- **THEN** the subscriptions created from it remain

### Requirement: A travelling token is limited, expiring, and rate limited

Every token SHALL have a limited number of uses and an expiry. The acceptance route SHALL be guarded by the bot check the app already uses, and creating SHALL be limited per account per day.

These are part of this change, not a follow-up. A token that travels by link is a spam vector aimed at a Topic the creating user does not pay to scan, and an unbounded one turns another user's Scan budget into someone else's mailing list.

#### Scenario: Creating past the daily limit is rejected

- **WHEN** an account creates more invites in a day than the limit allows
- **THEN** the api rejects it and no token is created

#### Scenario: The acceptance route has the bot check

- **WHEN** the join route is opened
- **THEN** it is guarded by the same bot check the app's signup uses

### Requirement: An invite URL previews as what it opens

`GET /invite/:token` SHALL serve the preview image of the Team or Topic the token opens, titled as an invitation naming it, so an invitation pasted into a message reads as one instead of as a page.

The title SHALL name the act the token grants, which differs by target: a Team invitation reads "Join {team} on CarlNotes" and a Topic invitation reads "Follow {topic} on CarlNotes", since accepting a Topic invitation subscribes the reader and the app's copy calls that following.

Its `og:url` SHALL be the invite URL, so a platform that rewrites a shared link to it hands the reader the invitation and not the page. The URL SHALL be marked no-index, since a token is a credential and belongs in no search result.

Serving the preview SHALL NOT accept the invitation, spend a use, or require a session. Acceptance remains a signed-in POST behind the bot check, so a link previewed by a messaging client or a crawler consumes nothing.

A token that is unknown, revoked, expired, or exhausted SHALL fall through to the site's own tags, so a link nobody can act on advertises no Team or Topic.

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

- **WHEN** an invite URL is fetched for a revoked, expired, exhausted, or unknown token
- **THEN** the response carries the site's own tags and names no Team or Topic

