# Spec Delta

## MODIFIED Requirements

### Requirement: Bookmarked Findings pin above the auto-kept feed

The requesting user's own bookmarked Findings SHALL render pinned above the auto-kept Findings, each marked with a
bookmark icon; a teammate's bookmarks pin nothing in another member's feed and appear only through the Team scope.
The pinned Findings SHALL hold their position in every sort mode: the active sort orders the pinned Findings among
themselves and the auto-kept Findings among themselves, never interleaving the two.

On web, the control that toggles a bookmark SHALL live in the Finding's note popover, beside the read toggle, instead
of on the Finding row. The web row SHALL show the bookmark only as a mark — shown once the requesting user has
bookmarked it, absent otherwise — which clears that user's own bookmark when activated and never a teammate's.
Keeping the web row to a single mark leaves the row itself to its title and source, and puts the two per-reader
toggles together in one place instead of splitting them across the row and the popover.

Mobile Finding details sheets SHALL show the permitted bookmark control beside their read controls. This native
exception SHALL retain the same permission rules, own-bookmark ownership, accessible labels, and pinned ordering.

#### Scenario: Pinned stays on top under any sort

- **WHEN** a user switches the sort mode with bookmarked Findings present
- **THEN** their bookmarked Findings stay above the auto-kept Findings, and each side re-orders internally

#### Scenario: An unbookmarked Finding is bookmarked from its popover

- **WHEN** a signed-in web user with access opens an unbookmarked Finding's note popover
- **THEN** a bookmark control sits beside the read toggle and adds the bookmark, and the web row itself offers no such control

#### Scenario: A bookmarked row's mark clears the bookmark

- **WHEN** a signed-in user activates the mark on a Finding they bookmarked
- **THEN** their bookmark is removed and the mark disappears, with any teammate's bookmark on the same Finding untouched

#### Scenario: Mobile details expose the permitted bookmark action

- **WHEN** a signed-in owner or eligible Team member opens an unbookmarked Finding's details
- **THEN** the sheet's Bookmark control adds their own bookmark and does not also open the source

### Requirement: The Bookmarked view shows only bookmarked Findings

A "Bookmarked" view SHALL join All and Unread in the web search bar's Filters menu, for signed-in users only.
Mobile SHALL offer the same choices in its finding-filter bottom sheet. On a Topic with no Team it SHALL show only
the requesting user's bookmarked Findings. On a team Topic it SHALL split into two choices — "My bookmarked", the
requesting user's own bookmarks, and "Team bookmarked", every member's including their own. Team therefore includes
Mine instead of excluding it. A Finding's row SHALL show no avatar for the teammates who saved it.

#### Scenario: Bookmarked filters to bookmarks

- **WHEN** a user selects Bookmarked on a Topic with no Team
- **THEN** only Findings they bookmarked render, and the other positions behave as before

#### Scenario: The team scopes split by saver

- **WHEN** a member selects Bookmarked on a team Topic
- **THEN** Mine returns only their own rows, Team returns every member's, and a departed member's rows appear in neither

#### Scenario: Mobile uses the same bookmark scopes

- **WHEN** a Team member changes between My bookmarked and Team bookmarked in the mobile sheet
- **THEN** the displayed Findings match the web's corresponding choice, with no extra request

### Requirement: The bookmark mark's tooltip names who bookmarked the Finding

On web, the filled bookmark mark on a bookmarked Finding's row SHALL have a tooltip that says a click removes the
user's bookmark, then lists who kept the Finding, with no heading: the user first, then each active member of the
Topic's owning team who bookmarked it, each name in bold beside that person's avatar in place of a bullet. The
mark's accessible name SHALL stay "Remove bookmark". Mobile's details-sheet remove control SHALL keep that accessible
name and SHALL use the guide's native label or long-press convention instead of requiring hover.

#### Scenario: A teammate also kept the Finding

- **GIVEN** a team Topic's Finding that the user and a teammate named Silky-Brew both bookmarked
- **WHEN** the web user hovers the Finding's bookmark mark
- **THEN** the tooltip reads "Remove your bookmark", then the user's username and Silky-Brew, each beside their avatar

#### Scenario: Only the user kept the Finding

- **WHEN** the web user hovers the bookmark mark of a Finding that no teammate bookmarked
- **THEN** the tooltip reads "Remove your bookmark", then the user's username alone, beside the user's avatar

#### Scenario: A mobile user identifies the remove action

- **WHEN** a user opens the details of their bookmarked Finding on mobile
- **THEN** "Remove bookmark" identifies the control without needing a hover interaction
