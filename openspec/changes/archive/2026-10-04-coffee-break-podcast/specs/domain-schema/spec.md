## ADDED Requirements

### Requirement: Podcast Episode is one rendered audio episode of a Topic

The schema SHALL persist a Podcast Episode in `episodes`: the Topic that it belongs to, the user that it bills, the Scan
that started it, a status of `rendering`, `published`, `failed`, or `removed`, a failure reason, a title, a description,
a season, an episode number, the audio's object key, byte size, and duration, the speech model, the cost in dollars, the
checked script, and when it published. A Scan SHALL have at most one Podcast Episode. A Podcast Episode's Topic, season,
and number SHALL be unique together. Deleting a Topic SHALL clear the Topic on its Podcast Episode rows instead of
deleting them, the way a deleted Topic's Scans keep their spend history. Deleting a user SHALL delete the Podcast
Episode rows that bill them. The hosts' names SHALL NOT appear in the schema.

#### Scenario: A removed Podcast Episode keeps its row

- **WHEN** a Podcast Episode is removed
- **THEN** its row stays with the status `removed`, its season, its number, and its cost, and with no audio key, no
  script, and no chapters

#### Scenario: A Scan has one Podcast Episode

- **WHEN** an episode workflow is retried for a Scan that already has a Podcast Episode row
- **THEN** no second row is created

#### Scenario: A deleted Topic's Podcast Episodes keep their spend

- **WHEN** a Topic with published Podcast Episodes is deleted
- **THEN** its Podcast Episode rows remain with no Topic, and their cost still counts in the month's spend

#### Scenario: Two Podcast Episodes never share a number

- **WHEN** two Podcast Episodes of one Topic publish in the same season
- **THEN** their numbers differ

### Requirement: A Podcast Episode's chapters join it to Findings

The schema SHALL persist a Podcast Episode's chapters in `episode_chapters`: the Podcast Episode, the chapter's
position, the Finding that it narrates, that Finding's Resource, the chapter's title and source url, its start and end
times, and a user's rating of the chapter. A chapter's Finding SHALL be cleared if the Finding is deleted, and the
chapter SHALL keep its Resource, title, source url, and rating. Chapters SHALL be written only when their Podcast
Episode publishes.

#### Scenario: A filtered-out Finding leaves its chapter

- **WHEN** a Scan filters out a Finding that a published Podcast Episode narrated
- **THEN** the chapter remains with its title, its source url, and its Resource, and with no Finding

#### Scenario: A failed render has no chapters

- **WHEN** a Podcast Episode fails before publishing
- **THEN** no chapter rows exist for it

### Requirement: Listen state is a per-user record, not a Podcast Episode column

The schema SHALL persist a user's listening in `episode_listens`, one row per user and Podcast Episode: a play count,
the progress in seconds, and when the user completed the Podcast Episode. Deleting the Podcast Episode or the user SHALL
delete the row.

#### Scenario: Two listeners keep separate progress

- **WHEN** two users listen to the same Podcast Episode
- **THEN** each has their own row with their own progress

### Requirement: A feed token names one listener and one Topic

The schema SHALL persist a per-listener podcast feed token in `episode_feed_tokens`: the Topic, the user, and a unique
random token. A user SHALL have at most one token per Topic. Deleting the Topic or the user SHALL delete the row.

#### Scenario: A listener has one token per Topic

- **WHEN** a listener opens the podcast feed dialog for the same Topic twice
- **THEN** both show the same token

### Requirement: A Topic records its podcast setting

`topics` SHALL include `is_podcast_enabled`, true by default.

#### Scenario: A new Topic has its podcast on

- **WHEN** a Topic is created
- **THEN** `is_podcast_enabled` is true

### Requirement: The change includes the podcast episodes migration

The change SHALL include generated migrations that create `episodes`, `episode_chapters`, `episode_listens`, and
`episode_feed_tokens`, and add `topics.is_podcast_enabled`, `findings.is_from_custom_source`, and
`episode_chapters.rating`.

#### Scenario: The migration applies to an existing database

- **WHEN** the migration runs against a database with Topics and users
- **THEN** every existing Topic has `is_podcast_enabled` true, and no existing row is otherwise changed
