## MODIFIED Requirements

### Requirement: The Bookmarked view shows only bookmarked Findings

A "Bookmarked" view SHALL join All and Unread in the search bar's Filters menu, for signed-in users only. On a Topic with no Team it SHALL show only the requesting user's bookmarked Findings. On a team Topic it SHALL split into two rows of that same menu — "My bookmarked", the requesting user's own bookmarks, and "Team bookmarked", every member's including their own. Team therefore includes Mine instead of excluding it. A Finding's row SHALL show no avatar for the teammates who saved it.

#### Scenario: Bookmarked filters to bookmarks

- **WHEN** a user selects Bookmarked on a Topic with no Team
- **THEN** only Findings they bookmarked render, and the other positions behave as before

#### Scenario: The team scopes split by saver

- **WHEN** a member selects Bookmarked on a team Topic
- **THEN** Mine returns only their own rows, Team returns every member's, and a departed member's rows appear in neither
