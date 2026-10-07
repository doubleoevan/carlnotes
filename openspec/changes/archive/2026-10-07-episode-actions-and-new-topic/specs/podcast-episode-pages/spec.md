## ADDED Requirements

### Requirement: A Podcast Episode's page offers its Topic's actions and Remove episode

A Podcast Episode's page SHALL offer three actions on its Topic in the search bar's actions menu, and Remove episode
for whoever may remove the Podcast Episode. Add topic to team SHALL show where Team Up would show, for a signed-in
user and never on someone else's private Topic, and SHALL open a dialog that lists the teams the user leads that hold
the Topic with a remove action, the user's other leader teams with an add action, and New team, which opens the new
team form with the Topic picked. Share topic SHALL open the Topic's share dialog. Report issue SHALL report the Topic.
Remove episode SHALL remove the Podcast Episode after a confirmation and open the Topic's page. The Add topic to team
dialog and the Topic page's Team Up SHALL read the same teams and act the same way.

#### Scenario: A user adds the episode's Topic to a team from the menu

- **GIVEN** a signed-in user who leads a team that does not hold the Topic
- **WHEN** the user opens the Podcast Episode's page, opens its actions menu, picks Add topic to team, and picks the team
- **THEN** the Topic is added to that team and the dialog shows the team with a remove action

#### Scenario: Add topic to team stays hidden on someone else's private Topic

- **WHEN** a member of a team that holds someone else's private Topic opens one of its Podcast Episodes' pages
- **THEN** the actions menu offers Share topic and Report issue, and no Add topic to team

#### Scenario: A visitor can report the Topic

- **WHEN** a visitor opens a public Topic's Podcast Episode page and its actions menu
- **THEN** the menu offers Share topic and Report issue, and no Remove episode

## MODIFIED Requirements

### Requirement: A podcast episode page has a card, and a public one is described for search engines

Every published Podcast Episode's page SHALL have its card in its head, whatever its Topic's visibility, so a shared
link previews: the Podcast Episode's title and description, and its Open Graph image, the Podcast Episode's own card of
1200 by 630 pixels with its cover beside its title, its Topic's name, and its season, number, and length. The card SHALL
be drawn on its first request and stored, and its url SHALL change when what it shows changes. No episode page SHALL
include Open Graph audio tags, so a link preview opens the page instead of playing the Podcast Episode in place.

A public Topic's episode page SHALL also declare a canonical url, and include `PodcastEpisode` JSON-LD with the Podcast
Episode's name, description, url, publish date, duration, episode number, season, the audio's url, and the series it
belongs to. A page whose Topic is public but not yet shown SHALL be `noindex`, as its topic page is. When a Podcast
Episode of a public Topic publishes, search engines SHALL be told about its page through IndexNow.

A private or invite Topic's episode page SHALL have its card alone: it SHALL be `noindex`, with no canonical url, no
JSON-LD, and no podcast feed.

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
- **THEN** the head has the Podcast Episode's title, its description, and its card as `og:image`, and it is `noindex`
  with no canonical url, no JSON-LD, and no `og:audio`

#### Scenario: The structured data is valid

- **WHEN** the page's JSON-LD is parsed
- **THEN** it is a `PodcastEpisode` with a `partOfSeries` that names the Topic's podcast feed, a `datePublished`, and an
  ISO 8601 duration

#### Scenario: A new Podcast Episode is announced

- **WHEN** a Podcast Episode of a public Topic publishes
- **THEN** IndexNow is told the podcast episode page's url
