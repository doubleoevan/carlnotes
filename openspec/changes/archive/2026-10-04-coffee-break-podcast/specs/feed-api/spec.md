## ADDED Requirements

### Requirement: A Finding rated thumbs down leaves the feed but stays stored

A Finding that a user rated thumbs down SHALL stay stored, so that its rating keeps guiding later Scans, and SHALL leave
every place that shows a Topic's Findings to read: the homepage feed, the topic page's All, Unread, and Bookmarked
views, the new count, the kept count on a topic card and a share card, the RSS feed, a public page's structured data, the
scan email, Carl's chat, and the MCP feed read. The topic page SHALL offer a Rated down view to a signed-in user that
shows only those Findings, so a rating can be changed back. A Podcast Episode's chapters SHALL still show the thumbs down
on the chapter that narrated such a Finding.

#### Scenario: A Finding rated down leaves the feed

- **GIVEN** a Topic with 25 Findings that no one rated down and 8 that a user rated down
- **WHEN** a user opens the topic page in the All view
- **THEN** the feed lists the 25, and the new count leaves out the 8

#### Scenario: The Rated down view brings them back

- **WHEN** a signed-in user picks Rated down in the feed's filters
- **THEN** the feed lists only the 8 Findings rated down, and a thumbs up on one moves it back to the All view
