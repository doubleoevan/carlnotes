## REMOVED Requirements

### Requirement: A podcast episode page is described for search engines

**Reason**: A Podcast Episode of a private or invite Topic now has its card too, so its link previews when shared. The
requirement is replaced by "A podcast episode page has a card, and a public one is described for search engines".

**Migration**: None. A public Topic's episode page keeps the same head.

### Requirement: A private or invite Topic's Podcast Episodes have no public page

**Reason**: A visitor who opens a private or invite Topic's episode url now meets the Topic's gate instead of a missing
page. The requirement is replaced by "A private or invite Topic's Podcast Episodes are gated".

**Migration**: None.

## ADDED Requirements

### Requirement: A podcast episode page has a card, and a public one is described for search engines

Every published Podcast Episode's page SHALL have its card in its head, whatever its Topic's visibility, so a shared
link previews: the Podcast Episode's title and description, and its Open Graph image, the Podcast Episode's own card of
1200 by 630 pixels with its cover beside its title, its Topic's name, and its season, number, and length. The card SHALL
be drawn on its first request and stored, and its url SHALL change when what it shows changes.

A public Topic's episode page SHALL also declare a canonical url, include `PodcastEpisode` JSON-LD with the Podcast
Episode's name, description, url, publish date, duration, episode number, season, the audio's url, and the series it
belongs to, and include Open Graph audio tags for the Podcast Episode's audio. A page whose Topic is public but not yet
shown SHALL be `noindex`, as its topic page is. When a Podcast Episode of a public Topic publishes, search engines SHALL
be told about its page through IndexNow.

A private or invite Topic's episode page SHALL have its card alone: it SHALL be `noindex`, with no canonical url, no
JSON-LD, no podcast feed, and no audio tags, since its feed and its audio belong to its listeners.

#### Scenario: The head describes the Podcast Episode

- **WHEN** a crawler reads a public Topic's podcast episode page
- **THEN** the head has the Podcast Episode's description as the meta description, a canonical url, PodcastEpisode
  JSON-LD, `og:audio` tags, and the Podcast Episode's card as `og:image`

#### Scenario: The card is wide, so a link preview crops nothing

- **WHEN** a social platform fetches a Podcast Episode's `og:image`
- **THEN** it gets a 1200 by 630 image with the Podcast Episode's cover on the left and its title on the right

#### Scenario: An invite Topic's episode link previews

- **WHEN** a messaging app fetches an invite Topic's podcast episode url with no session
- **THEN** the head has the Podcast Episode's title, its description, and its card as `og:image`, and it is `noindex`
  with no canonical url, no JSON-LD, and no `og:audio`

#### Scenario: The structured data is valid

- **WHEN** the page's JSON-LD is parsed
- **THEN** it is a `PodcastEpisode` with a `partOfSeries` that names the Topic's podcast feed, a `datePublished`, and an
  ISO 8601 duration

#### Scenario: A new Podcast Episode is announced

- **WHEN** a Podcast Episode of a public Topic publishes
- **THEN** IndexNow is told the podcast episode page's url

### Requirement: A private or invite Topic's Podcast Episodes are gated

A Podcast Episode of a private or invite Topic SHALL open its page, rendered in the browser, only for a signed-in user
who may listen to the Podcast Episode. A visitor, or a user who may not see the Topic, SHALL meet the Topic's gate over
the episode's loading skeleton, the same notice the Topic's own page shows: on an invite Topic a visitor is offered Sign
up and Log in, on a private Topic Log in alone, each returning to the episode, and a signed-in user is told to ask the
Topic's owner. The gate's api answer SHALL name an invite Topic and never a private one. The episode's own content, its
player, its chapters, and its transcript, SHALL never be rendered for a visitor or a crawler, and the page SHALL stay out
of the sitemap.

#### Scenario: A visitor meets an invite Topic's gate

- **WHEN** a visitor opens an invite Topic's podcast episode url
- **THEN** the page shows the gate over the episode's loading skeleton, and its sign up link returns to the episode

#### Scenario: A visitor meets a private Topic's gate

- **WHEN** a visitor opens a private Topic's podcast episode url
- **THEN** the page shows the private gate with Log in alone, and neither the gate nor its api answer names the Topic

#### Scenario: An invite Topic's owner opens a podcast episode page

- **WHEN** the owner of an invite Topic opens one of its Podcast Episodes' urls
- **THEN** the Podcast Episode's page loads with its player, its chapters, and its transcript

#### Scenario: A late subscriber cannot open an earlier Podcast Episode's page

- **GIVEN** a subscriber of an invite Topic who joined after a Podcast Episode published
- **WHEN** the subscriber requests that Podcast Episode's url
- **THEN** the response is not found, since the subscriber may see the Topic and meets no gate

#### Scenario: Nothing private is indexed

- **WHEN** any page or feed of a private or invite Topic's Podcast Episodes is served
- **THEN** it declares `noindex`, and the sitemap lists none of them
