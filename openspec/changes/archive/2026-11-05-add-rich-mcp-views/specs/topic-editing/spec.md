## MODIFIED Requirements

### Requirement: The editor explains sender-private Personal sources

The editor SHALL keep Personal sources outside the fetched Source count and show only the current sender's Sources,
items, and setup. Confirmation SHALL require normal edit permission. Personal sources SHALL not disable visibility,
Team, invitation, or podcast controls.

#### Scenario: An editor opens a shared Topic
- **WHEN** the editor reads its Source settings
- **THEN** their Personal sources are a separate group excluded from ten fetched Sources
- **AND** no other sender's item counts or provenance appear

#### Scenario: A sender removes their Source
- **WHEN** they confirm removal
- **THEN** only that sender's Source and items are removed and no other sender's data changes
