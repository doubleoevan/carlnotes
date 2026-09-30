## MODIFIED Requirements

### Requirement: Departure and deletion have explicit rules

When a team Topic's creator leaves its owning Team or their plan can no longer fund it, its Scans SHALL pause instead of failing silently. The pause holds until the creator can fund it again or the Topic leaves the Team; ownership never moves.

Deleting a Team, by its leader or with the account of its only member, SHALL also delete its stored avatar image. A failed image delete SHALL be logged and SHALL NOT fail the team deletion.

#### Scenario: A departed creator's Topic pauses

- **WHEN** the creator of a team Topic leaves its owning Team
- **THEN** the Topic's Scans stop running instead of failing silently, and it stays the creator's own

#### Scenario: Deleting a Team returns its Topics

- **WHEN** a leader deletes a Team
- **THEN** every Topic it owned returns to its creator and every shared holding ends, with team access ended

#### Scenario: Deleting a Team deletes its avatar image

- **WHEN** a Team with an uploaded avatar is deleted, by its leader or with its only member's account
- **THEN** its stored avatar image is deleted too
