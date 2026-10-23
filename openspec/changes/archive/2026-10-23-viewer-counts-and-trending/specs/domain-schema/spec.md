## ADDED Requirements

### Requirement: Viewer and listener counts persist beside their rows
`topics.viewer_count` and `episodes.listener_count` SHALL be integers, not null, defaulting to 0, written only by the
scheduled sync and never lowered. `viewer_counters` SHALL hold one row per Topic or Podcast Episode with a saved
counter: the counter's bytes, a cascading reference to its Topic or its Podcast Episode, a check that exactly one of the
two is set (`viewer_counters_ref_shape`), and its update time. A Topic's or a Podcast Episode's deletion SHALL delete
its counter.

#### Scenario: A deleted topic takes its counter with it
- **WHEN** a Topic with a saved counter is deleted
- **THEN** its `viewer_counters` row is deleted too

### Requirement: A finding's viewer count counts people
`findings.viewer_count` SHALL be the number of distinct signed-in people who have opened the Finding, replacing
`findings.view_count`, which counted every open. The migration SHALL backfill it from `finding_views` as the distinct
users with an open. `findings.view_count` SHALL stay in the database, unread and unwritten, until a later release drops
it once no process from before this change runs. A person's later opens SHALL leave `findings.viewer_count` unchanged,
and `finding_views` SHALL keep its one row per open.

#### Scenario: A second open by the same person counts once
- **WHEN** a signed-in person opens a Finding twice
- **THEN** its `viewer_count` rises by one and `finding_views` holds two rows

## REMOVED Requirements

### Requirement: Resource carries an optional engagement signal
**Reason**: Nothing reads the engagement signal once Trending ranks by unique viewers.
**Migration**: None. `resources.engagement` stays in the database, unread and unwritten, until a later release drops it
once no process from before this change runs. A future ranking that wants an outside signal captures one again.
