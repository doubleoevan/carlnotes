# Spec Delta

## ADDED Requirements

### Requirement: A plan card states its hot takes per podcast

Each pricing card SHALL list one line after its podcast line that states how many Comments the plan shares with
Carl and Vienna per Podcast Episode. The free card SHALL read "3 hot takes per podcast", and the Plus and Premium
cards SHALL read "5 hot takes per podcast". The numbers SHALL come from the same constants that set a Topic's share
shared comment slots. The line SHALL show on the web and in the mobile app.

#### Scenario: The free card

- **WHEN** the free card renders
- **THEN** the line after its podcast line reads "3 hot takes per podcast"

#### Scenario: The paid cards

- **WHEN** the Plus and Premium cards render
- **THEN** each reads "5 hot takes per podcast" after its podcast line

#### Scenario: The card and the shared comment slots agree

- **WHEN** the shared comment slot counts change in the contracts
- **THEN** the plan card lines and a Topic's shared comment slot count change with them
