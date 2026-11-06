## MODIFIED Requirements

### Requirement: The sweep copies the counts into columns and keeps them through a restart

Every scheduled sweep SHALL, under a job lease of its own, copy the estimate of every Topic and Podcast Episode whose
counter changed into `topics.viewer_count` and `episodes.listener_count`, never lowering either, and save each changed
counter's bytes in `viewer_counters`. A Topic or Podcast Episode whose copy fails SHALL be copied by the next sweep.
After a Redis restart, and on the first sweep after the release, the sweep SHALL rebuild Redis before it copies
anything: it SHALL merge every saved counter back into its key, so every count the last sweep saved is kept, and add
every signed-in person Postgres records as a Topic's owner, active follower, or opener of its findings, or as a Podcast
Episode's listener. The views and listens added after the last sweep and before the restart were never
saved, so a restart loses up to one sweep's worth of new viewers and listeners. The homepage feed and the trending sort
SHALL read the columns alone.

#### Scenario: A saved count survives a Redis restart
- **WHEN** Redis restarts empty, a new visitor opens a topic page, and the next sweep runs
- **THEN** the Topic's viewers are its saved count plus the new visitor, and its column never shows less

#### Scenario: A restart loses the views since the last sweep
- **WHEN** a visitor opens a topic page after a sweep, and Redis restarts before the next sweep
- **THEN** that view is lost, and the Topic's shown viewers stay at the saved count

#### Scenario: The rebuild seeds the signed-in people Postgres records
- **GIVEN** a Topic whose owner, one follower, and one user who opened a finding are recorded in Postgres
- **WHEN** the first sweep after the release runs on a Redis with no restore marker
- **THEN** the Topic's viewers are three, and a second rebuild leaves them at three

#### Scenario: Two sweeps never copy at once
- **WHEN** a second sweep starts while the first still holds the lease
- **THEN** the second copies nothing
