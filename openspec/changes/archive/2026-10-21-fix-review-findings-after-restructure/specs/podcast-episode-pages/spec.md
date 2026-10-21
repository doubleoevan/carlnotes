## MODIFIED Requirements

### Requirement: A podcast episode page has a card, and a public one is described for search engines

Every published Podcast Episode's page SHALL have its card in its head, whatever its Topic's visibility, so a shared
link previews: the Podcast Episode's title, a description, and its Open Graph image, the Podcast Episode's own card of
1200 by 630 pixels with its cover beside its title, its Topic's name, and its season, number, and length. The card SHALL
be drawn on its first request and stored, and its url SHALL change when what it shows changes. No episode page SHALL
include Open Graph audio tags, so a link preview opens the page instead of playing the Podcast Episode in place.

A public Topic's episode page SHALL describe itself with the Podcast Episode's own description, declare a canonical
url, and include `PodcastEpisode` JSON-LD with the Podcast Episode's name, description, url, publish date, duration,
episode number, season, the audio's url, and the series it belongs to. A page whose Topic is public but not yet shown
SHALL be `noindex`, as its topic page is. When a Podcast Episode of a public Topic publishes, search engines SHALL be
told about its page through IndexNow.

A private or invite Topic's episode page SHALL have its card alone: it SHALL be `noindex`, with no canonical url, no
JSON-LD, and no podcast feed. Its description SHALL be the Topic's sanitized description, the text the Topic's own page
head carries, and never the Podcast Episode's model-written description, which recounts the Topic's Findings to anyone
who fetches the head with no session.

#### Scenario: The head describes the Podcast Episode

- **WHEN** a crawler reads a public Topic's podcast episode page
- **THEN** the head has the Podcast Episode's description as the meta description, a canonical url, PodcastEpisode
  JSON-LD, and the Podcast Episode's card as `og:image`

#### Scenario: A shared link opens the page

- **WHEN** a messaging app fetches a public Topic's podcast episode url
- **THEN** the head has no `og:audio` tags, so the preview shows the card with no play button and opens the page

#### Scenario: The card is wide, so a link preview crops nothing

- **WHEN** a social platform fetches a Podcast Episode's `og:image`
- **THEN** it gets a 1200 by 630 image with the Podcast Episode's cover on the left and its title on the right

#### Scenario: An invite Topic's episode link previews

- **WHEN** a messaging app fetches an invite Topic's podcast episode url with no session
- **THEN** the head has the Podcast Episode's title, the Topic's description in place of the Podcast Episode's, and its
  card as `og:image`, and it is `noindex` with no canonical url, no JSON-LD, and no `og:audio`

#### Scenario: A private Topic's episode head recounts no Findings

- **GIVEN** a private Topic whose Podcast Episode's description names what its Findings said
- **WHEN** anyone fetches that episode page's head
- **THEN** the description is the Topic's description, and none of the Podcast Episode's description is in the head

#### Scenario: The structured data is valid

- **WHEN** the page's JSON-LD is parsed
- **THEN** it is a `PodcastEpisode` with a `partOfSeries` that names the Topic's podcast feed, a `datePublished`, and an
  ISO 8601 duration

#### Scenario: A new Podcast Episode is announced

- **WHEN** a Podcast Episode of a public Topic publishes
- **THEN** IndexNow is told the podcast episode page's url
