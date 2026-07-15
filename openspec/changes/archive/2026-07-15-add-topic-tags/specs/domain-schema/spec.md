## ADDED Requirements

### Requirement: Topic carries filter tags

The `topics` table SHALL have a `tags` `text[]` column, non-null and defaulting to the empty array, holding free-form labels used as Topic metadata for feed filtering and directory categories. A GIN index SHALL cover `topics.tags` so containment and overlap filters (`@>`, `&&`) stay index-backed. Tags SHALL be plain Topic metadata, not a domain entity: no `tags` table and no tag join table SHALL exist, and no rejected domain noun SHALL be introduced. Resources and Findings SHALL remain untagged.

#### Scenario: A new topic defaults to an empty tag set

- **WHEN** a topic row is created without specifying tags
- **THEN** its `tags` is a non-null empty array, requiring no backfill for existing rows

#### Scenario: Tag filters are index-backed

- **WHEN** the schema and migration are inspected
- **THEN** a GIN index covers `topics.tags`, so a containment or overlap filter on tags can use it

#### Scenario: Tags are metadata, not an entity

- **WHEN** the schema and migration are inspected
- **THEN** no `tags` table or tag join table exists, and neither `resources` nor `findings` has a tags column
