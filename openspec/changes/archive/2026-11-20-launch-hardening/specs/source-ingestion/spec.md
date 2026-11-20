## ADDED Requirements

### Requirement: A stored snippet has a length limit

Ingestion SHALL store at most a fixed number of characters of a Source's native text as a Resource's snippet, and
SHALL cut a longer text at that limit, so one full-text feed entry cannot grow a Resource's row without bound.

#### Scenario: A full-text feed entry is cut

- **WHEN** an rss entry's content runs to 75,000 characters
- **THEN** the found Resource's snippet holds the start of that text up to the limit, and the Resource is still found

#### Scenario: A short snippet is stored whole

- **WHEN** a search result's highlights are shorter than the limit
- **THEN** the found Resource's snippet holds them unchanged
