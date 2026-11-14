## ADDED Requirements

### Requirement: A publication's rebuild keeps the Dashboard's snapshots until it has new ones

A Dashboard rebuild that a publication starts SHALL leave the Dashboard's snapshots and share image in place until it
has new ones to write, and SHALL replace them as it writes those. A rebuild that fails SHALL leave the last snapshots
readable. A change that takes an item out of what a reader may see, a Topic turned private or deleted or moved to
another owner or team, SHALL still leave that reader's data on the next read.

#### Scenario: A publish with Redis unreachable leaves the last snapshot

- **GIVEN** an owner's Topic Dashboard built last night, and Redis unreachable
- **WHEN** an author publishes a Topic Post on one of the owner's Topics and the rebuild fails
- **THEN** the owner's Specials pages still show last night's snapshot, and the failure is reported

#### Scenario: A rebuild that succeeds leaves no empty Dashboard

- **WHEN** a publication's rebuild finishes
- **THEN** the next read of the Dashboard returns the new snapshots, and no read between the publication and that
  write returned an empty Dashboard

#### Scenario: A build that loaded before a publication skips its write

- **GIVEN** a nightly build that loaded a Dashboard's daily counts before a publication on one of its Topics
- **WHEN** the nightly build reaches its write after the publication's rebuild started
- **THEN** the nightly build writes nothing, and the Dashboard keeps the snapshots the publication's rebuild writes

#### Scenario: A Topic turned private still leaves the public data at once

- **WHEN** an owner makes a public Topic private while Redis is unreachable
- **THEN** the person's public Dashboard no longer counts the Topic on the next read
