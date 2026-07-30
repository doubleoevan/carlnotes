# finding-bookmarks Specification

## Purpose
TBD - created by archiving change add-max-results-bookmarks-sort. Update Purpose after archive.
## Requirements
### Requirement: A bookmark is a per-user marker on a Finding
The system SHALL record bookmarks in a `bookmarks` table keyed by user id and finding id, unique per pair, with a created timestamp — mirroring `consumptions`. Bookmark state SHALL never live on the Finding row, and bookmark and consumed SHALL stay independent: marking one never changes the other.

#### Scenario: Bookmarking twice is one row
- **WHEN** a user bookmarks the same Finding twice
- **THEN** exactly one bookmark row exists for the pair

#### Scenario: Bookmark and consumed do not interact
- **WHEN** a user bookmarks a consumed Finding or consumes a bookmarked one
- **THEN** each state changes independently and neither clears the other

### Requirement: The bookmark route toggles the caller's own bookmark
`POST /api/topic-findings/:id/bookmark` SHALL take `isBookmarked` and create or remove the calling user's bookmark row, guarded by the same visibility rule as consume: a user may bookmark only Findings they can see. Every topic finding in feed and topic-page payloads SHALL carry `isBookmarked` resolved for the requesting user.

#### Scenario: A bookmark round-trips
- **WHEN** a signed-in user bookmarks a visible Finding and reloads
- **THEN** the Finding returns with `isBookmarked` true, and unbookmarking clears it

#### Scenario: An invisible finding cannot be bookmarked
- **WHEN** a user calls the bookmark route for a Finding they cannot see
- **THEN** the api rejects it and writes nothing

### Requirement: A bookmarked Finding survives the max-results prune
A Finding bookmarked by any user SHALL be exempt from the topic's `max_results` prune and from any prune that follows it, so it persists across later scans and appears in addition to the auto-kept top `max_results`.

#### Scenario: Bookmarks add to the kept set
- **WHEN** a topic is set to top 5 and eight of its Findings are bookmarked
- **THEN** after a scan the topic shows the five auto-kept Findings plus the eight bookmarked ones

### Requirement: Bookmarked Findings pin above the auto-kept feed
Bookmarked Findings SHALL render as a pinned group above the auto-kept Findings, each marked with a bookmark icon. The pinned group SHALL hold its position in every sort mode: the active sort orders the pinned group among itself and the auto-kept group among itself, never interleaving them. Each Finding card SHALL carry a bookmark control that toggles the state.

#### Scenario: Pinned stays on top under any sort
- **WHEN** a user switches the sort mode with bookmarked Findings present
- **THEN** the bookmarked group stays above the auto-kept group, and each group re-orders internally

### Requirement: The Bookmarked view shows only bookmarked Findings
A "Bookmarked" view SHALL join All and Unread in the search bar's Filters menu, for signed-in users only, and show only the requesting user's bookmarked Findings.

#### Scenario: Bookmarked filters to bookmarks
- **WHEN** a user selects Bookmarked
- **THEN** only Findings they bookmarked render, and the other positions behave as before

