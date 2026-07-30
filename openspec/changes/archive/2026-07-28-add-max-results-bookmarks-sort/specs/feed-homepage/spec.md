## ADDED Requirements

### Requirement: The feed bar offers three sort modes
The feed bar SHALL offer a "Sort"-labelled menu with three modes: relevant (the default, by relevance score), newest (by resource recency), and trending (by the Resource's captured engagement signal, degrading to newest where the signal is null). Sorting SHALL be pure read-side ranking over the delivered Findings, and the chosen mode SHALL be a UI concern, never persisted.

#### Scenario: Newest reorders by recency
- **WHEN** the user switches the sort to newest
- **THEN** Findings order by resource recency without any new data being fetched

#### Scenario: Trending degrades to newest without a signal
- **WHEN** the user switches to trending on a feed where some Findings carry no engagement signal
- **THEN** Findings with a signal rank by it and the rest fall back to recency order behind them

### Requirement: The view filter lives in the search bar's Filters menu
The search bar's Filters menu SHALL offer the All, Unread, and Bookmarked views as a radio group above a divider, with the resource-kind checks below it. One view is active at a time. Bookmarked shows only the requesting user's bookmarked Findings and SHALL render only for a signed-in user; All and Unread keep their existing behavior.

#### Scenario: The menu cycles all three views
- **WHEN** the user moves the view radio through All, Unread, and Bookmarked
- **THEN** each view renders and the sort menu keeps working in every one

#### Scenario: A visitor sees no Bookmarked view
- **WHEN** a signed-out visitor opens the Filters menu
- **THEN** the view radios offer only All and Unread
