## MODIFIED Requirements

### Requirement: Finding rows match the web's compact list

A compact row SHALL show its rank or own-bookmark mark, title or URL fallback, source, and age, with no Resource kind
icon. Consecutive rows SHALL share one card background, border, rounded outline, and Nightshift shadow. Individual rows
SHALL have no shadow. Read Findings SHALL be muted. Images SHALL have a fallback when absent or unsuccessful.

#### Scenario: Optional metadata is absent

- **WHEN** the title, source, publication date, or image is absent
- **THEN** the row retains its title fallback, shows the source and publication age only when delivered, skips absent
  decorations, and keeps its details reachable; Fetched remains available in details
