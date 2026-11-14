## ADDED Requirements

### Requirement: The Limits section holds the pauses, the pinned-only home, and the image limit

The Limits section SHALL show a switch that pauses new podcast episodes, a switch that pauses new films, a switch
that limits the home to its pinned items, and a field for the generated chapter image limit with its default as its
placeholder. An admin SHALL save each through `isAllowed(user, "admin:console")`, a switch as it is flipped and the
field as it loses focus, and a save SHALL drop the cached settings. Each switch SHALL show off, and the field empty,
until an admin changes it.

#### Scenario: An admin pauses new films

- **WHEN** an admin flips the switch that pauses new films
- **THEN** the pause is saved as on with who saved it and when, and the cached settings are dropped

#### Scenario: An admin overrides the image limit

- **GIVEN** a default generated chapter image limit of 40
- **WHEN** an admin types 10 in the field and leaves it
- **THEN** the field shows 10 as its value, and emptying it later shows 40 as its placeholder

#### Scenario: An invalid image limit is rejected

- **WHEN** an admin saves a generated chapter image limit below zero
- **THEN** the save is rejected with a validation error, and the stored settings are unchanged

#### Scenario: A non-admin cannot flip a switch

- **WHEN** a non-admin posts a pause
- **THEN** the request is rejected through the gate, and nothing is saved
