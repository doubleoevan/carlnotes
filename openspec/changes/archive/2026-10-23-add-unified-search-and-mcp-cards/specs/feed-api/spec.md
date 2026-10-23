## REMOVED Requirements

### Requirement: Topic findings include bookmark and viewer fields

**Reason**: A Finding counts views again, every open, while a Topic keeps counting viewers, so the field is renamed with
what it counts. The requirement added below keeps the rest of the rule.

**Migration**: Every topic finding's `viewerCount` becomes `viewCount`. Only the web app, the MCP cards, and the MCP
tool results read it.

### Requirement: A Finding rated thumbs down leaves the feed but stays stored

**Reason**: The Rated down view read as a filter for the reader's own thumbs downs, with no Rated up beside it, and the
site search's Filters menu offered it too. A thumbs down now hides a Finding from every view, and the requirement
added below keeps the rest of the rule.

**Migration**: The `ratedDown` value leaves the feed views and the search request's `view`. A search page url that
still sends it reads as the default view, All, and the MCP search tool rejects it like any other unknown view.

## ADDED Requirements

### Requirement: Topic findings include bookmark and view fields

Every topic finding in feed and topic-page payloads SHALL include `isBookmarked`, resolved for the requesting user, and
`viewCount`, how many times it has been opened, so the client can render the pinned group, the Bookmarked view, the
trending sort, and the Views line of the Finding's note without further requests. The existing include-consumed
parameter is unchanged: the Bookmarked view filters client-side over the delivered payload, the same way the Unread view
already does.

#### Scenario: The payload includes both fields

- **WHEN** a signed-in user requests a feed containing a bookmarked Finding that was opened 5 times by 2 people
- **THEN** that finding includes `isBookmarked` true and `viewCount` 5

#### Scenario: The Bookmarked view needs no extra request

- **WHEN** the user switches the filter to Bookmarked
- **THEN** the client filters the already-delivered Findings by `isBookmarked` with no new fetch

### Requirement: A Finding rated thumbs down leaves every view but stays stored

A Finding that a user rated thumbs down SHALL stay stored, so that its rating keeps guiding later Scans, and SHALL leave
every place that shows a Topic's Findings to read: the homepage feed, the topic page's All, Unread, and Bookmarked
views, the site search, the new count, the kept count on a topic card and a share card, the RSS feed, a public page's
structured data, the scan email, Carl's chat, and the MCP feed read. No view SHALL show it. A Podcast Episode's
chapters SHALL still show the thumbs down on the chapter that narrated such a Finding.

#### Scenario: A Finding rated down leaves the feed

- **GIVEN** a Topic with 25 Findings that no one rated down and 8 that a user rated down
- **WHEN** a user opens the topic page in the All view
- **THEN** the feed lists the 25, and the new count leaves out the 8

#### Scenario: No view brings a Finding rated down back

- **GIVEN** the same Topic, and a bookmarked Finding among the 8 rated down
- **WHEN** a signed-in user picks Unread or Bookmarked in the feed's filters, or searches for the Finding's title
- **THEN** none of the 8 Findings is listed
