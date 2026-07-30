## ADDED Requirements

### Requirement: The reddit adapter records the post score as engagement
The reddit adapter SHALL map each post's score from the listing response it already fetches into the Resource's `engagement`, with no additional API calls, and a re-scan SHALL refresh the stored value. Adapters that capture no signal leave `engagement` null.

#### Scenario: A reddit post carries its score
- **WHEN** the reddit adapter ingests a post with a score
- **THEN** the stored Resource's `engagement` holds that score, and a later scan updates it

#### Scenario: Other sources stay null
- **WHEN** an rss Resource is ingested
- **THEN** its `engagement` is null and the trending sort falls back to recency for it
