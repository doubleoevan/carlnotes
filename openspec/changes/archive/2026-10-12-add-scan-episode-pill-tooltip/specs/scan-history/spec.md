## MODIFIED Requirements

### Requirement: A scan history row has a pill that plays the Podcast Episode that its Scan rendered

A scan history row whose Scan has a published Podcast Episode SHALL show that Podcast Episode's number as a pill, such
as `E14`, that plays the Podcast Episode, or pauses it while it plays. Hovering the pill SHALL show the same tooltip as
the latest Podcast Episode's play button: the Coffee Break podcast, the season and episode number, the title in bold,
and the date, length, chapter count, and AI voices note. A row whose Scan rendered no Podcast Episode, or whose Podcast
Episode is still rendering or failed, SHALL show no pill. The pill SHALL follow the same access rule as the player, so
a subscriber of an invite Topic sees it only for a Podcast Episode published after they joined.

#### Scenario: A Scan with a Podcast Episode shows its number

- **WHEN** the scan history lists a Scan whose Podcast Episode published as number 14
- **THEN** its row shows `E14`, and selecting it plays that Podcast Episode

#### Scenario: The pill shows the Podcast Episode's tooltip

- **WHEN** a user hovers the `E14` pill of a Scan whose Podcast Episode is season 2026's episode 14
- **THEN** the tooltip reads Coffee Break podcast, then Season 2026 · Episode 14, then the title in bold, then the date,
  length, chapter count, and AI voices note

#### Scenario: A Scan with no Podcast Episode shows no pill

- **WHEN** the scan history lists a Scan that rendered no Podcast Episode
- **THEN** its row shows no podcast episode pill
