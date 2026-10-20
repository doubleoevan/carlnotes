## MODIFIED Requirements

### Requirement: The monthly spend meter renders on the Account page

The Account page SHALL show a horizontal progress bar of the user's month-to-date spend versus their effective monthly
budget — the plan's backstop, or the per-user override when set — fed by the Activity payload. Spend SHALL be the same
per-user figure the Scan budget records and the admin page reports, never a second computed cost. All figures SHALL
reset with the budget period. The Account page SHALL share the Activity page's width.

The section SHALL read as the product's own fund rather than as an account balance, since the money is what the product
spends serving the user and never what the user owes.

The heading SHALL NOT repeat the spend as a percentage. The money figures beside it and the bar below it already carry
the proportion, and a third statement of it says nothing new.

The Activity payload SHALL include the user's monthly budget cutoffs, lowest share first. Each cutoff SHALL show as a
circle above the bar that holds its percent, with a line from the circle down through the bar that stops at the bar's
bottom edge. A cutoff closer than 9 percentage points to the circle before it SHALL share that circle. Each circle SHALL
have a tooltip with a heading per cutoff, such as "At 75%: new podcast episodes pause", over bullets that say what it
stops. A circle SHALL fade once the spend passes its first cutoff. A circle that marks the daily Scans cutoff alone,
which moves each day, SHALL have a dashed edge. A list under the bar SHALL give each cutoff's percent and line, end with
"Every brew pauses until the 1st" at 100%, and strike through each cutoff the spend has passed. The daily Scans cutoff's
line SHALL say "(this cutoff moves each day)", and the spoken questions cutoff's line SHALL add "You can still text
Carl" as its own sentence. A budget with no cutoffs, an admin's with no override, SHALL show no circles and no list.

In place of a static disclaimer, the section SHALL show a state line that changes as the month goes on. While a cutoff
is still ahead, it SHALL name the next one, such as "Next at 75%: new podcast episodes pause." Once every cutoff is
passed, or for a budget with none, it SHALL be keyed on the fraction of the budget spent:

- under 60% — a line saying the fund is full
- 60% to 89% — a line saying it is getting low
- 90% to 99% — a line saying it is nearly out
- at 100% — a line saying it is spent until the period resets, and that the product is still working but cannot record
  its results

The 100% line SHALL carry an inline upgrade link, since a user who has just run out is at the highest-intent moment the
page offers.

The bar's segments SHALL keep their labels: Brews, Coffee Break podcast, and Coffee Talk.

#### Scenario: The bar reads the recorded spend and the effective budget
- **WHEN** the Activity payload is assembled
- **THEN** spend comes from the same per-user Scan-budget source the admin console reads, and the budget is the override
  when set, else the plan backstop

#### Scenario: The state line follows the spend
- **WHEN** a plus user's month-to-date spend crosses 40 percent, and later every cutoff
- **THEN** the line names each next cutoff in turn, then says the fund is nearly out, without the figures or the bar
  changing meaning

#### Scenario: A spent budget offers the way up
- **WHEN** a user has spent their whole monthly budget
- **THEN** the line says so, says the product is still reading but cannot file notes, and offers an upgrade link inline

#### Scenario: The heading carries no percentage
- **WHEN** the section renders at any spend level
- **THEN** the heading names the fund and does not repeat the percentage

#### Scenario: Each cutoff is a circle above the bar
- **GIVEN** a free user at 57 percent of their budget, with a daily Scans cutoff at 58 percent
- **WHEN** the Account page renders
- **THEN** the 15 and 20 percent cutoffs share one faded circle at 15 percent, a dashed circle sits at 58 percent, a
  circle sits at 90 percent, and the state line says "Next at 58%: daily brews go weekly."

#### Scenario: An admin with no budget override sees no cutoffs
- **GIVEN** an admin with no budget override
- **WHEN** the Account page renders
- **THEN** the bar has no circles and no list, and the state line is keyed on the fraction spent
