## MODIFIED Requirements

### Requirement: The sitemap and structured data date a topic by its content

A public Topic's sitemap `lastmod` and its structured data's `dateModified` SHALL be when the Topic last gained a shown
Finding, or its creation time if it has none, so a follow, a settings edit, or a Finding rated down does not announce
a change. The homepage feed's `feedUpdatedAt` SHALL read the same time.

#### Scenario: A settings edit leaves the date alone

- **WHEN** an owner edits a public Topic's frequency
- **THEN** the Topic's `lastmod` in the sitemap is unchanged

#### Scenario: A finding rated down leaves the date alone

- **WHEN** a public Topic's newest Finding is rated down
- **THEN** the Topic's `lastmod` is its newest shown Finding's creation time, the same as its `feedUpdatedAt`
