## ADDED Requirements

### Requirement: Max results is chosen in the edit modal
The edit-topic modal SHALL offer a "Max results" select with the options Carl's top 5, Carl's top 10, Carl's top 15, and Carl's top 20 — wording identical to the info card's row. A new topic defaults to Carl's top 10, an existing topic shows its stored value, and the api SHALL validate the saved value against the allowed set.

#### Scenario: The select round-trips
- **WHEN** the owner picks Carl's top 15 and saves
- **THEN** the reloaded topic stores `max_results` 15 and the modal and info card both show it

#### Scenario: An invalid value is rejected
- **WHEN** a save carries a max-results value outside 5, 10, 15, or 20
- **THEN** the api rejects the payload
