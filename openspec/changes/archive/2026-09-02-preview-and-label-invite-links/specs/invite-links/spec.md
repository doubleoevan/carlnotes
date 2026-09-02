## ADDED Requirements

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
