## MODIFIED Requirements

### Requirement: The monthly spend meter renders on the Account page

The Account page SHALL show a horizontal progress bar of the user's month-to-date spend versus their effective monthly budget — the plan's backstop, or the per-user override when set — fed by the Activity payload. Spend SHALL be the same per-user figure the Scan budget records and the admin page reports, never a second computed cost. All figures SHALL reset with the budget period. The Account page SHALL share the Activity page's width.

The section SHALL read as the product's own fund rather than as an account balance, since the money is what the product spends serving the user and never what the user owes.

The heading SHALL NOT repeat the spend as a percentage. The money figures beside it and the bar below it already carry the proportion, and a third statement of it says nothing new.

In place of a static disclaimer, the section SHALL carry a state line keyed on the fraction of the budget spent, so the same words change as the month goes on:

- under 60% — a line saying the fund is full
- 60% to 89% — a line saying it is getting low
- 90% to 99% — a line saying it is nearly out
- at 100% — a line saying it is spent until the period resets, and that the product is still working but cannot record its results

Every line below 100% SHALL still say the spend is the product's own tab, not the user's.

The 100% line SHALL carry an inline upgrade link, since a user who has just run out is at the highest-intent moment the page offers.

The bar's two segments SHALL keep their existing labels.

#### Scenario: The bar reads the recorded spend and the effective budget
- **WHEN** the Activity payload is assembled
- **THEN** spend comes from the same per-user Scan-budget source the admin console reads, and the budget is the override when set, else the plan backstop

#### Scenario: The state line follows the spend
- **WHEN** a user's month-to-date spend crosses from under 60% to above it, and later past 90%
- **THEN** the line changes at each threshold without the figures or the bar changing meaning

#### Scenario: A spent budget offers the way up
- **WHEN** a user has spent their whole monthly budget
- **THEN** the line says so, says the product is still reading but cannot file notes, and offers an upgrade link inline

#### Scenario: The heading carries no percentage
- **WHEN** the section renders at any spend level
- **THEN** the heading names the fund and does not repeat the percentage
