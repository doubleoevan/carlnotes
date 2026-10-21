## ADDED Requirements

### Requirement: The docs embed keys each section by page and heading, with an ordinal on a repeated heading

The docs embed SHALL store one `docs_chunks` row per section of each docs page, keyed by the page and the section's
heading, and SHALL upsert over that key so an edited section replaces its row. If a page repeats a `##` heading, each
later section with that heading SHALL carry an ordinal in its stored heading, so every key on the page is unique, no
section is written over another, and the upsert never meets one key twice in a batch.

#### Scenario: A page repeats a heading

- **GIVEN** a docs page with two `## Tips` sections
- **WHEN** the docs embed runs
- **THEN** the page has two rows, the first under `Tips` and the second under `Tips` with its ordinal, and the upsert
  succeeds

#### Scenario: An edited section replaces its row

- **WHEN** a section's words change and the docs embed runs again
- **THEN** the row under that page and heading is updated in place, and no second row for the section is written
