## ADDED Requirements

### Requirement: A search result shows its icon where a Finding shows its favicon

A search result that is not a Finding SHALL start at its title, level with a Finding's title, on the search page, on
mobile, and in the search MCP view. Its kind's icon, or a team's or profile's avatar, SHALL sit first on its metadata
line, where a Finding shows its favicon.

#### Scenario: A Topic row puts its icon on its line

- **WHEN** a search returns a Topic and a Finding
- **THEN** both titles start at the same inset, and the Topic's icon sits on its metadata line where the Finding's
  favicon sits
