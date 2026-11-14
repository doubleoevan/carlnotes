## ADDED Requirements

### Requirement: The feed reads one last succeeded Scan and one latest Podcast Episode a Topic

The Feed API SHALL read each listed Topic's most recent succeeded Scan, and each Topic's latest published Podcast
Episode, as one row a Topic through an index on the Topic and the time. It SHALL never read every Scan or every Podcast
Episode of the listed Topics to keep the newest. Every other caller of the latest Podcast Episode read SHALL get the
same read, and each read SHALL return what it returned before.

#### Scenario: A year of daily Scans reads one row a Topic

- **GIVEN** 100 listed Topics that each hold 365 succeeded Scans
- **WHEN** a signed-in user's feed is built
- **THEN** the last succeeded Scan read returns 100 rows, and its plan reads each Topic's newest row through the index
  on the Topic and the start time

#### Scenario: The latest Podcast Episode read keeps its result

- **WHEN** the feed holds twelve Topics with published Podcast Episodes
- **THEN** the read names the same twelve Podcast Episodes as before, in one query, through the index on the Topic and
  the publish time

#### Scenario: More Topics still take no more queries

- **WHEN** the feed holds more Topics
- **THEN** the number of queries that read the last succeeded Scans and the latest Podcast Episodes stays the same
