## RENAMED Requirements

- FROM: `### Requirement: Podcast Episode is one rendered audio episode of a Topic`
- TO: `### Requirement: Podcast Episode is one recorded audio episode of a Topic`

## MODIFIED Requirements

### Requirement: Podcast Episode is one recorded audio episode of a Topic

The schema SHALL persist a Podcast Episode in `episodes`: the Topic that it belongs to, the user that it bills, the Scan
that started it, a status of `recording`, `published`, `failed`, or `removed`, a failure reason, a title, a description,
a season, an episode number, the audio's object key, byte size, and duration, the speech model, the cost in dollars, the
checked script, when it published, and whether it was recorded as a short Podcast Episode. A Scan SHALL have at most
one Podcast Episode. A Podcast Episode's Topic, season, and number SHALL be unique together. Deleting a Topic SHALL
clear the Topic on its Podcast Episode rows instead of deleting them, the way a deleted Topic's Scans keep their spend
history. Deleting a user SHALL delete the Podcast Episode rows that bill them. The hosts' names SHALL NOT appear in the
schema. Every Podcast Episode created before this change SHALL read as not short.

#### Scenario: A removed Podcast Episode keeps its row

- **WHEN** a Podcast Episode is removed by its Topic's owner or an admin
- **THEN** its row stays with the status `removed`, its season, its number, and its cost, and with no audio key, no
  script, and no chapters

#### Scenario: A replaced Podcast Episode keeps its chapters

- **WHEN** a later short Podcast Episode of the same Topic replaces a short Podcast Episode
- **THEN** the replaced row stays with the status `removed`, its season, its number, its cost, and its chapters, and
  with no audio key and no script

#### Scenario: A Scan has one Podcast Episode

- **WHEN** an episode workflow is retried for a Scan that already has a Podcast Episode row
- **THEN** no second row is created

#### Scenario: A deleted Topic's Podcast Episodes keep their spend

- **WHEN** a Topic with published Podcast Episodes is deleted
- **THEN** its Podcast Episode rows remain with no Topic, and their cost still counts in the month's spend

#### Scenario: Two Podcast Episodes never share a number

- **WHEN** two Podcast Episodes of one Topic publish in the same season
- **THEN** their numbers differ
