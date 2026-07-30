## ADDED Requirements

### Requirement: Topic carries a constrained max-results count
The `topics` table SHALL carry a `max_results` integer, not null, defaulting to 10, constrained by a database check to one of 5, 10, 15, or 20. It is the size of the topic's auto-kept Finding set.

#### Scenario: The default is ten
- **WHEN** a topic row is inserted without a max-results value
- **THEN** `max_results` is 10

#### Scenario: An out-of-range value is refused
- **WHEN** a write attempts a `max_results` outside 5, 10, 15, or 20
- **THEN** the database rejects it

### Requirement: Bookmarks are per-user rows mirroring consumptions
The schema SHALL define a `bookmarks` table: the user (cascade delete), the finding (cascade delete), and a created timestamp, unique per user and finding. Bookmark state SHALL never be a `findings` column.

#### Scenario: The schema exposes bookmarks
- **WHEN** `bunx tsc -b` runs against the repository
- **THEN** `db/schema.ts` compiles and exports a `bookmarks` table with the user and finding references, their cascades, and the per-pair uniqueness

### Requirement: Resource carries an optional engagement signal
The `resources` table SHALL carry a nullable `engagement` integer holding the source's engagement count where an adapter captured one, such as a reddit post score. Null means no signal was captured.

#### Scenario: Engagement defaults to null
- **WHEN** a Resource is inserted by an adapter that captures no signal
- **THEN** `engagement` is null

### Requirement: The change includes the max-results, bookmarks, and engagement migrations
The change SHALL include generated Drizzle migrations that add `topics.max_results` with its default and check, backfill existing topics to 10, create `bookmarks`, and add `resources.engagement`. Applying them to a database at the current schema MUST succeed without altering any other table.

#### Scenario: Existing topics backfill to ten
- **WHEN** the migrations run against a database with existing topics
- **THEN** every existing topic's `max_results` is 10 and no other table changes
