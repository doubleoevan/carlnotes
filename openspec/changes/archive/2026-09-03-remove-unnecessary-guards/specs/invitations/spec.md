## ADDED Requirements

### Requirement: Reusing a live link spends no invite slot

A link creation that returns the caller's existing live link for the target SHALL spend no slot from
the daily limit, since nothing was written and no new bearer token exists.

#### Scenario: Re-sharing a topic all day costs one slot

- **WHEN** an owner clicks create-link for the same topic repeatedly in one day
- **THEN** one row exists, one slot was spent, and every click returned the same link
