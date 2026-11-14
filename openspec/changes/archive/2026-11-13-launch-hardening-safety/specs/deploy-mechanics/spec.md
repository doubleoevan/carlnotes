## ADDED Requirements

### Requirement: A migration that drops or renames says the previous release no longer reads it

A test SHALL fail a migration added from this change on that holds `DROP COLUMN`, `DROP TABLE`, or `RENAME` unless its
first comment says the previous release no longer reads what it removes, so a service rolled back one release still
runs against the schema. A column or a table SHALL be added in one release and removed in a later one.

#### Scenario: A rename with no comment fails the test

- **WHEN** a new migration renames a column and its first comment says nothing about the previous release
- **THEN** the test fails naming the migration

#### Scenario: A commented drop passes

- **WHEN** a new migration drops a column and its first comment says the previous release no longer reads it
- **THEN** the test passes

#### Scenario: The repository's migrations pass

- **WHEN** the test runs over the repository at this change
- **THEN** it passes
