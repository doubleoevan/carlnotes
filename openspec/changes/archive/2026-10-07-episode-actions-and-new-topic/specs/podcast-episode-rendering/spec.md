## RENAMED Requirements

- FROM: `### Requirement: A Podcast Episode narrates the Scan's new Findings, then liked and bookmarked ones, then the rest`
- TO: `### Requirement: A Podcast Episode picks its Findings by score, with a bonus for a like, a bookmark, and a url Source's page`

## MODIFIED Requirements

### Requirement: The Topic's owner and an admin can remove a Podcast Episode

The Topic's owner and an admin SHALL be able to remove a published or failed Podcast Episode, and nobody else SHALL.
Removing a Podcast Episode SHALL delete its audio from object storage, its chapters, its script, and its listen state,
and SHALL keep the Podcast Episode's row with the status `removed`, its season, its number, and its cost. Its number
SHALL never be reused, and its cost SHALL still count in the billed user's monthly spend. A removed Podcast Episode
SHALL be in no feed and no episode list, SHALL have no public page, and its audio, chapters, and transcript urls SHALL
respond as missing. The Findings it narrated MAY be narrated by a later Podcast Episode. A removed Podcast Episode
SHALL NOT count toward the free plan's one Podcast Episode per Topic, so the Topic's next Scan may render a new one.
Whoever may remove a Podcast Episode SHALL find the remove control on each row of the episodes card, on the Topic
page's player card, and as Remove episode in the Podcast Episode page's actions menu, and every one SHALL open the same
confirmation.

#### Scenario: An owner removes a Podcast Episode

- **WHEN** a Topic's owner removes its published Podcast Episode
- **THEN** the audio object is deleted, the Podcast Episode is gone from the player, the episodes card, and every feed
  of the Topic, and its audio url responds as missing

#### Scenario: An admin removes a Podcast Episode

- **WHEN** an admin removes a Podcast Episode of another user's Topic
- **THEN** it is removed the same way

#### Scenario: A subscriber cannot remove a Podcast Episode

- **WHEN** a subscriber who does not own the Topic sends the removal
- **THEN** the api rejects it and the Podcast Episode stays

#### Scenario: A removed Podcast Episode's number is not reused

- **GIVEN** a Topic whose latest Podcast Episode this season is number 14
- **WHEN** the owner removes it and the next Podcast Episode publishes
- **THEN** the new Podcast Episode is number 15

#### Scenario: A removed Podcast Episode frees the free plan's one

- **GIVEN** a Topic on the free plan whose one Podcast Episode was removed
- **WHEN** its next Scan succeeds with Findings left to narrate
- **THEN** the Scan renders a new Podcast Episode

#### Scenario: Whoever may remove finds the control on the player and the episode page

- **WHEN** an admin opens a Topic page and one of its Podcast Episode pages
- **THEN** the player card shows the remove button, the episode page's actions menu offers Remove episode, and a
  subscriber who does not own the Topic sees neither

#### Scenario: A removed Podcast Episode still counts in spend

- **WHEN** a Podcast Episode that cost $0.40 is removed
- **THEN** the billed user's monthly spend still includes the $0.40

### Requirement: A Podcast Episode picks its Findings by score, with a bonus for a like, a bookmark, and a url Source's page

A Podcast Episode SHALL pick up to fifteen Findings by score with their bonuses, from the triggering Scan's new
Findings and the Topic's other Findings that a user rated thumbs up or bookmarked, or whose page is one of the Topic's
url Sources, narrated or not. A Finding SHALL get a score bonus of 0.2 for a bookmark, 0.2 for a thumbs up, and 0.2 if
its page matches one of the Topic's url Sources by canonical url. The bonuses SHALL add up, and the score SHALL stay at
1 or below.
On a tie a new Finding SHALL be picked first. The picked Findings SHALL be narrated with the Scan's new Findings first,
then the others, each in relevance score order without the bonuses. Any place left SHALL go to the Topic's other
Findings that no published Podcast
Episode of the Topic has narrated, in score order, then to the Topic's other narrated Findings, in score order. A
Finding SHALL count as narrated by its Resource, so a Finding that was filtered out and found again later counts as
narrated, and a removed Podcast Episode's Findings count as not narrated. A Finding that a user rated thumbs down SHALL
never be narrated. If every one of the Topic's Findings that may be narrated counts as narrated, no Podcast Episode
SHALL be made and nothing SHALL be spent.

#### Scenario: A Finding with a bonus takes a new Finding's place, and a bonus that only ties does not

- **GIVEN** a Scan with fifteen new Findings scored 0.5, a bookmarked Finding scored 0.3, and a liked Finding scored 0.2
  whose page is one of the Topic's url Sources
- **WHEN** its Podcast Episode is planned
- **THEN** the liked Finding on the url Source's page, at 0.6 with its bonuses, is picked in place of the fifteenth new
  Finding, and the bookmarked Finding, at a tie of 0.5 with its bonus, is left out

#### Scenario: A Finding rated down is never narrated, and liked and bookmarked ones follow the new ones

- **GIVEN** a Topic with a new Finding rated thumbs down, a new unrated Finding, an older Finding never narrated, and
  three narrated Findings, the best-scored one unrated, one rated thumbs up, and one bookmarked
- **WHEN** its Podcast Episode is planned
- **THEN** the Finding rated down is left out, and the order is the new unrated Finding, the liked and the bookmarked
  narrated Findings, the older Finding, and the unrated narrated Finding

#### Scenario: New Findings come first

- **GIVEN** a Scan that kept four new Findings on a Topic with ten Findings never narrated
- **WHEN** its Podcast Episode is planned
- **THEN** the four new Findings come first in score order, followed by the ten in score order

#### Scenario: Narrated Findings fill out a thin Scan's Podcast Episode

- **GIVEN** a Scan with two new Findings on a Topic whose five other Findings were all narrated
- **WHEN** its Podcast Episode is planned
- **THEN** the two new Findings come first, followed by the five narrated ones in score order

#### Scenario: Nothing to say, no Podcast Episode

- **GIVEN** a Scan with no new Findings on a Topic whose Findings were all narrated
- **WHEN** the podcast episode workflow runs
- **THEN** no Podcast Episode row is written and no model is called

#### Scenario: A Finding found again counts as narrated

- **GIVEN** an unrated, unbookmarked Finding that a Podcast Episode narrated, was filtered out, and was found again by a
  later Scan
- **WHEN** the later Scan's Podcast Episode is planned
- **THEN** that Finding comes after every Finding that no Podcast Episode narrated
