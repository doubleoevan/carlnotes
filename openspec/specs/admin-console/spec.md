# admin-console Specification

## Purpose
TBD - created by archiving change add-authz-plans-billing. Update Purpose after archive.
## Requirements
### Requirement: The admin console is an admin-only route
An admin console route SHALL render a users table and a totals summary, authorized through `isAllowed(user, "admin:console")`. A non-admin SHALL be refused the route and its data.

#### Scenario: An admin opens the console
- **WHEN** an admin navigates to the console route
- **THEN** the users table and totals summary render

#### Scenario: A non-admin is refused
- **WHEN** a non-admin requests the console route or its api
- **THEN** the request is refused through the gate

### Requirement: The users table shows each user's standing and cost against budget
Each row SHALL show email, role, current plan, signup date, topic count, attributed storage, and month-to-date variable cost shown against that user's effective budget, so an outlier is visible at a glance.

#### Scenario: A row renders the columns
- **WHEN** the console loads
- **THEN** each user row shows email, role, current plan, signup date, topic count, attributed storage, and month-to-date variable cost

#### Scenario: Cost shows against the effective budget
- **WHEN** a user's month-to-date variable cost is rendered
- **THEN** it is shown against their effective budget (the override when set, else the plan backstop)

### Requirement: Attributed storage is a labelled attribution, not a chargeback
Attributed storage SHALL sum the bytes the user's Topics hold — resource content byte counts plus attachment byte counts plus embedding width times row count — and SHALL be labelled "Storage", never storage cost, because Resources are global and deduplicated across users, so the figure is an attribution for spotting heavy accounts, not a chargeback.

#### Scenario: Attributed storage sums the three byte sources
- **WHEN** a user's attributed storage is computed
- **THEN** it equals resource content bytes plus attachment bytes plus embedding width times embedded-row count across the user's Topics

#### Scenario: It is labelled Storage
- **WHEN** the figure renders
- **THEN** it is labelled "Storage", never "storage cost"

### Requirement: Month-to-date variable cost is observed from the Scan budget
Month-to-date variable cost SHALL be read from the same per-user spend the Scan budget records — observed, not estimated — covering only what flows through the budget (models, Firecrawl, and, once ingestion tracking lands, Exa and the paid sources), and SHALL be labelled "Cost this month", never presented as the user's full cost to serve.

#### Scenario: Cost matches the budget spend
- **WHEN** a user's month-to-date variable cost is rendered
- **THEN** it equals the per-user spend the Scan budget recorded this month, labelled "Cost this month"

### Requirement: The totals summary reports storage, cost, revenue, and contribution
The totals summary SHALL show total attributed storage, total month-to-date variable cost, total net revenue pulled from Stripe (the reporting / balance figure that already nets refunds, proration, and fees, not a naive sum of subscription prices), and a contribution figure computed on the page as net revenue minus total tracked variable cost. Contribution SHALL be labelled contribution, not profit, because the tracked cost omits fixed infrastructure and Stripe fees; an optional flat monthly fixed-cost constant MAY be subtracted to bring it closer to the true bottom line.

#### Scenario: Contribution is net revenue minus tracked variable cost
- **WHEN** the totals summary renders
- **THEN** contribution equals Stripe net revenue minus total tracked variable cost, less the optional fixed-cost constant when configured

#### Scenario: Contribution is labelled, not profit
- **WHEN** the contribution figure renders
- **THEN** it is labelled "contribution", never "profit", and net revenue is the Stripe reporting figure rather than a sum of list prices

### Requirement: Admins change role and set budget overrides through the gate
An admin SHALL change a user's role and set a per-user budget override inline, and both writes SHALL go through `isAllowed`. A budget override SHALL take precedence over the plan's monthly backstop in both directions — raising it for a trusted user or lowering it for an abusive one — and a null override SHALL mean the plan value applies. Setting or clearing an override SHALL resize that user's LiteLLM key budget to the resulting effective budget.

#### Scenario: An override raises a trusted user's budget
- **WHEN** an admin sets a budget override above the user's plan backstop
- **THEN** the override becomes the effective budget and the user's key budget is resized up

#### Scenario: An override lowers an abusive user's budget
- **WHEN** an admin sets a budget override below the user's plan backstop
- **THEN** the override becomes the effective budget and the user's key budget is resized down

#### Scenario: A null override falls back to the plan value
- **WHEN** an admin clears a user's budget override
- **THEN** the plan's monthly backstop becomes the effective budget again

### Requirement: An admin cannot remove their own admin role
The system SHALL refuse to remove an admin's own admin role, so the platform can never be locked out of its last admin. Other role changes SHALL be permitted through the gate.

#### Scenario: An admin cannot demote themselves
- **WHEN** an admin attempts to change their own role away from admin
- **THEN** the change is refused and their role stays admin

#### Scenario: An admin can change another user's role
- **WHEN** an admin changes a different user's role
- **THEN** the change is applied through the gate

