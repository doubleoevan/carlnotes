## ADDED Requirements

### Requirement: The account page's header shows the plan

The account page's header row SHALL show the current plan at its right, its billing interval after a middle dot on a
paid plan, and the plan button right after it, once for the page. The budget cards SHALL not repeat the plan. While
the plan loads, a placeholder SHALL hold the header row at the plan button's height. An admin's read-only view of
another user's account SHALL show the plan with no plan button.

#### Scenario: The plan sits at the right of the header

- **GIVEN** a user on the Plus plan billed yearly
- **WHEN** the user opens the account page
- **THEN** the header row ends with "Plan Plus · billed yearly" and the plan button after it, and neither budget card
  shows the plan

#### Scenario: An admin's view shows the plan with no button

- **WHEN** an admin opens another user's account page
- **THEN** the header row shows that user's plan with no plan button

## REMOVED Requirements

### Requirement: Each budget card ends with the plan

**Reason**: Both budget cards ended with the same plan and plan button. The plan now shows once, at the right of the
account page's header row, as "The account page's header shows the plan" adds above.

**Migration**: None. Only the account page shows the plan.
