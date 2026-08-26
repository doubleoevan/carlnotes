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

### Requirement: A bookmarked Finding survives the max-results prune

A Finding SHALL be exempt from the topic's `max_results` prune, and from any prune that follows it, while at least one holder of a bookmark on it still has access to the Topic through the permission helper, so it persists across later scans and appears in addition to the auto-kept top `max_results`. A bookmark whose holder has lost access SHALL no longer exempt anything: a departed member's saves stop holding Findings past the prune.

#### Scenario: Bookmarks add to the kept set

- **WHEN** a topic is set to top 5 and eight of its Findings are bookmarked by members with access
- **THEN** after a scan the topic shows the five auto-kept Findings plus the eight bookmarked ones

#### Scenario: A departed member's bookmarks stop exempting

- **WHEN** the only bookmark on a Finding belongs to someone who lost access, and the prune next runs
- **THEN** that Finding may be pruned like any other

### Requirement: Bookmarked Findings pin above the auto-kept feed

The requesting user's own bookmarked Findings SHALL render pinned above the auto-kept Findings, each marked with a bookmark icon; a teammate's bookmarks pin nothing in another member's feed and appear only through the Team scope. The pinned Findings SHALL hold their position in every sort mode: the active sort orders the pinned Findings among themselves and the auto-kept Findings among themselves, never interleaving the two.

The control that toggles a bookmark SHALL live in the Finding's note popover, beside the read toggle, instead of on the Finding row. The row SHALL show the bookmark only as a mark — shown once the requesting user has bookmarked it, absent otherwise — which clears that user's own bookmark when activated and never a teammate's. Keeping the row to a single mark leaves the row itself to its title and source, and puts the two per-reader toggles together in one place instead of splitting them across the row and the popover.

#### Scenario: Pinned stays on top under any sort

- **WHEN** a user switches the sort mode with bookmarked Findings present
- **THEN** their bookmarked Findings stay above the auto-kept Findings, and each side re-orders internally

#### Scenario: An unbookmarked Finding is bookmarked from its popover

- **WHEN** a signed-in user with access opens an unbookmarked Finding's note popover
- **THEN** a bookmark control sits beside the read toggle and adds the bookmark, and the row itself offers no such control

#### Scenario: A bookmarked row's mark clears the bookmark

- **WHEN** a signed-in user activates the mark on a Finding they bookmarked
- **THEN** their bookmark is removed and the mark disappears, with any teammate's bookmark on the same Finding untouched

### Requirement: The Bookmarked view shows only bookmarked Findings

A "Bookmarked" view SHALL join All and Unread in the search bar's Filters menu, for signed-in users only. On a Topic with no Team it SHALL show only the requesting user's bookmarked Findings. On a team Topic it SHALL split into two rows of that same menu — "My bookmarked", the requesting user's own bookmarks, and "Team bookmarked", every member's including their own, with each row showing the avatar of whoever saved it. Team therefore includes Mine instead of excluding it.

#### Scenario: Bookmarked filters to bookmarks

- **WHEN** a user selects Bookmarked on a Topic with no Team
- **THEN** only Findings they bookmarked render, and the other positions behave as before

#### Scenario: The team scopes split by saver

- **WHEN** a member selects Bookmarked on a team Topic
- **THEN** Mine returns only their own rows, Team returns every member's with the saver's avatar on each, and a departed member's rows appear in neither

### Requirement: The bookmark route toggles the user's own bookmark

`POST /api/topic-findings/:id/bookmark` SHALL take `isBookmarked` and create or remove the calling user's bookmark row, guarded by the permission helper: a user may bookmark Findings on a Topic the helper grants them access to — the owner, and every member of any holding team, the owning team and the teams the Topic is shared into alike. Removing SHALL always act on the user's own row alone, so no one can destroy another member's save. Every topic finding in feed and topic-page payloads SHALL include `isBookmarked` resolved for the requesting user.

#### Scenario: A bookmark round-trips

- **WHEN** a user the helper grants access bookmarks a Finding and reloads
- **THEN** the Finding returns with `isBookmarked` true, and unbookmarking clears it

#### Scenario: An invisible finding cannot be bookmarked

- **WHEN** a user calls the bookmark route for a Finding they cannot see
- **THEN** the api rejects it and writes nothing

#### Scenario: A member bookmarks a team Topic's Finding

- **WHEN** a team member bookmarks a Finding on their Team's Topic
- **THEN** the bookmark is written, keyed to that member

#### Scenario: Removal only ever reaches the user's row

- **WHEN** two members bookmark one Finding and one of them unbookmarks it
- **THEN** only the acting member's row is deleted and the other's survives

