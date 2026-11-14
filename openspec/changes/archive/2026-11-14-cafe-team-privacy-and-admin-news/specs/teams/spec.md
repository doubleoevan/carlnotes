## ADDED Requirements

### Requirement: The Team field marks the default team, and a save names it

The Team field on the web and in the mobile app SHALL label the default team's option with "(default)" after its name.
A save that adds a Topic to the default team SHALL show a message that names the Team as the default team. A save that
leaves the Topic's Teams as they were, or adds only other Teams, SHALL show no such message.

#### Scenario: A new public Topic

- **WHEN** a user who leads a Team saves a new public Topic with the Team field left on the default team
- **THEN** the message says the Topic was added to that Team, the user's default team

#### Scenario: An edit that keeps the Team

- **WHEN** the user edits a Topic already on the default team and saves
- **THEN** no default team message shows
