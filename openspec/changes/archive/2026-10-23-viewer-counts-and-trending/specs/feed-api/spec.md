## ADDED Requirements

### Requirement: Topic findings include bookmark and viewer fields
Every topic finding in feed and topic-page payloads SHALL include `isBookmarked`, resolved for the requesting user, and
`viewerCount`, the signed-in people who have opened it, so the client can render the pinned group, the Bookmarked view,
and the trending sort without further requests. The existing include-consumed parameter is unchanged: the Bookmarked
view filters client-side over the delivered payload, the same way the Unread view already does.

#### Scenario: The payload includes both fields
- **WHEN** a signed-in user requests a feed containing a bookmarked Finding that two people have opened
- **THEN** that finding includes `isBookmarked` true and `viewerCount` 2

#### Scenario: The Bookmarked view needs no extra request
- **WHEN** the user switches the filter to Bookmarked
- **THEN** the client filters the already-delivered Findings by `isBookmarked` with no new fetch

### Requirement: A topic feed includes its viewer count and its newest finding's time
Every Topic in the homepage feed payload SHALL include `viewerCount`, read from the Topic's column with no Redis call,
and `feedUpdatedAt`, the creation time of its newest shown Finding or, with none, the Topic's own, the same time the
sitemap reads. The homepage SHALL render neither, and the trending sort SHALL read both.

#### Scenario: A topic with no findings dates from its creation
- **WHEN** a Topic in the feed has no Findings
- **THEN** its `feedUpdatedAt` is its creation time

## REMOVED Requirements

### Requirement: Topic findings carry bookmark and engagement fields
**Reason**: Trending ranks by unique viewers, so the payload includes `viewerCount` in place of `engagement`.
**Migration**: Read `viewerCount`. The replacement requirement is "Topic findings include bookmark and viewer fields".
