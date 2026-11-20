## ADDED Requirements

### Requirement: A text classification's verdict is kept for a day and its cost is recorded

A text classification's verdict SHALL be kept for a day under a hash of the text, so the same paragraph is
classified once however often it is saved. Each classification that runs SHALL record its cost as a `spends` row
with no user, so the day's total spend includes moderation, and no user's budget or the free-plan spend does.

#### Scenario: A repeated save classifies nothing new

- **GIVEN** a published Topic Post whose author saves the same body twice within a day
- **WHEN** the second save is classified
- **THEN** no model call runs for a paragraph that was already judged

#### Scenario: Moderation shows in the day's total

- **WHEN** a day's Comments, notes, and Topic Post edits are classified
- **THEN** the day's spend line holds their cost as the platform's spend, and no user's monthly spend includes it
