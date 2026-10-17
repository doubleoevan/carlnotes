## ADDED Requirements

### Requirement: The budget reset stops once it loses its claim

The budget reset SHALL run under the same lease claim the sweep takes, under its own claim name. It SHALL check the
claim's abort signal before each user's key replacement, so a reset whose lease expired or was taken over replaces no
further key. A reset that stops this way SHALL exit non-zero, and the keys it did not reach SHALL stay due for the next
day's reset.

#### Scenario: A reset that lost its claim replaces no further key

- **WHEN** a reset's lease renewal fails while users are still due
- **THEN** no further key is replaced, the job exits non-zero, and the next day's reset replaces the keys still due
