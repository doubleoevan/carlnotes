## MODIFIED Requirements

### Requirement: Bookmarked Findings pin above the auto-kept feed

Bookmarked Findings SHALL render pinned above the auto-kept Findings, each marked with a bookmark icon. The pinned Findings SHALL hold their position in every sort mode: the active sort orders the pinned Findings among themselves and the auto-kept Findings among themselves, never interleaving the two.

The control that toggles a bookmark SHALL live in the Finding's note popover, beside the read toggle, rather than on the Finding row. The row SHALL carry the bookmark only as a mark — shown once bookmarked, absent otherwise — which clears the bookmark when activated. Keeping the row to a single mark leaves the row itself to its title and source, and puts the two per-reader toggles together in one place instead of splitting them across the row and the popover.

#### Scenario: Pinned stays on top under any sort
- **WHEN** a user switches the sort mode with bookmarked Findings present
- **THEN** the bookmarked Findings stay above the auto-kept Findings, and each side re-orders internally

#### Scenario: An unbookmarked Finding is bookmarked from its popover
- **WHEN** a signed-in user opens an unbookmarked Finding's note popover
- **THEN** a bookmark control sits beside the read toggle and adds the bookmark, and the row itself offers no such control

#### Scenario: A bookmarked row's mark clears the bookmark
- **WHEN** a signed-in user activates the mark on a bookmarked Finding's row
- **THEN** the bookmark is removed and the mark disappears
