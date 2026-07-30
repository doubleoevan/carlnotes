## ADDED Requirements

### Requirement: Topic findings carry bookmark and engagement fields
Every topic finding in feed and topic-page payloads SHALL carry `isBookmarked`, resolved for the requesting user, and `engagement`, the Resource's captured signal or null, so the client can render the pinned group, the Bookmarked view, and the trending sort without further requests. The existing include-consumed parameter is unchanged: the Bookmarked view filters client-side over the delivered payload, the same way the Unread view already does.

#### Scenario: The payload carries both fields
- **WHEN** a signed-in user requests a feed containing a bookmarked reddit Finding
- **THEN** that finding carries `isBookmarked` true and its reddit score as `engagement`

#### Scenario: The Bookmarked view needs no extra request
- **WHEN** the user switches the filter to Bookmarked
- **THEN** the client filters the already-delivered Findings by `isBookmarked` with no new fetch
