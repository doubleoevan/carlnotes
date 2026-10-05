## ADDED Requirements

### Requirement: The bookmark mark's tooltip names who bookmarked the Finding

The filled bookmark mark on a bookmarked Finding's row SHALL have a tooltip that says a click removes the user's
bookmark, then lists who kept the Finding, with no heading: the user first, then each active member of the
Topic's owning team who bookmarked it, each name in bold beside that person's avatar in place of a bullet. The mark's accessible name SHALL stay "Remove bookmark".

#### Scenario: A teammate also kept the Finding

- **GIVEN** a team Topic's Finding that the user and a teammate named Silky-Brew both bookmarked
- **WHEN** the user hovers the Finding's bookmark mark
- **THEN** the tooltip reads "Remove your bookmark", then the user's username and Silky-Brew, each beside their avatar

#### Scenario: Only the user kept the Finding

- **WHEN** the user hovers the bookmark mark of a Finding that no teammate bookmarked
- **THEN** the tooltip reads "Remove your bookmark", then the user's username alone, beside the user's avatar
