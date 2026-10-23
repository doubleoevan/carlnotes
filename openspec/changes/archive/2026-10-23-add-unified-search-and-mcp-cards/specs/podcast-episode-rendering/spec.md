## REMOVED Requirements

### Requirement: The Topic's owner and an admin can remove a Podcast Episode, and its Findings may be narrated again

**Reason**: The trash button on the Topic page's player card sat beside the play controls, where one tap away from play
removed an episode for good. The requirement added below keeps every other rule and the two other remove controls.

**Migration**: None. The episodes card's rows and the episode page's actions menu still remove a Podcast Episode.

## ADDED Requirements

### Requirement: Owners and admins remove a Podcast Episode in its list or page, and its Findings may be narrated again

The Topic's owner and an admin SHALL be able to remove a published or failed Podcast Episode, and nobody else SHALL.
Removing a Podcast Episode SHALL delete its audio from object storage, its chapters, its script, and its listen state,
and SHALL keep the Podcast Episode's row with the status `removed`, its season, its number, and its cost. Its number
SHALL never be reused, and its cost SHALL still count in the billed user's monthly spend. A removed Podcast Episode
SHALL be in no feed and no episode list, SHALL have no public page, and its audio, chapters, and transcript urls SHALL
respond as missing. The Findings it narrated MAY be narrated by a later Podcast Episode. Whoever may remove a Podcast
Episode SHALL find the remove control on each row of the episodes card and as Remove episode in the Podcast Episode
page's actions menu, and both SHALL open the same confirmation. The Topic page's player card SHALL show no remove
control.

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

#### Scenario: Whoever may remove finds the control in the list and on the episode page

- **WHEN** an admin opens a Topic page and one of its Podcast Episode pages
- **THEN** each row of the episodes card shows the remove button, the player card shows none, the episode page's actions
  menu offers Remove episode, and a subscriber who does not own the Topic sees neither

#### Scenario: A removed Podcast Episode still counts in spend

- **WHEN** a Podcast Episode that cost $0.40 is removed
- **THEN** the billed user's monthly spend still includes the $0.40
