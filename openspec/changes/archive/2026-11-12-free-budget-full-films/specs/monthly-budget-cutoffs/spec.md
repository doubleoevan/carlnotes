## ADDED Requirements

### Requirement: The free plan's monthly budget is $2

The free plan's monthly budget SHALL be $2, with the same cutoff shares. The plans page, the account page's spend
meter, the admin console's estimated monthly spend and cutoff table, and the Plans and limits docs page SHALL read the
catalog's budget.

#### Scenario: The free card shows a $2 coffee fund

- **WHEN** the plans page renders the free card
- **THEN** it reads "$2 coffee fund a month" and "About 20 Brews a month"

### Requirement: An existing free key keeps its budget until it is replaced

A free user's key SHALL take the $2 budget the next time it is replaced: at the monthly reset, a plan change, or a
budget override. Until then, the key's own budget SHALL limit scheduled scans, while chat, manual scans, and the spend
meter read the $2 budget.

#### Scenario: An existing free key takes the $2 budget at the monthly reset

- **GIVEN** a free user whose key was created before the change with a $3 budget
- **WHEN** the monthly reset replaces their key
- **THEN** the new key's budget is $2

## MODIFIED Requirements

### Requirement: Podcast Episodes go short, then pause, at their cutoffs
Past the full Podcast Episodes cutoff, a Topic on a paid plan SHALL record short Podcast Episodes, which replace the
Topic's earlier short ones and never its full ones. Past the Podcast Episodes cutoff, no Podcast Episode SHALL be
recorded for the billed user until the next month. Scans SHALL keep running. A recorded Podcast Episode SHALL get its
whole film, whatever its owner's monthly spend.

#### Scenario: Past 60 percent on plus, the Podcast Episode is short
- **GIVEN** a plus user whose spend this month is $9.00 of a $15 budget
- **WHEN** their Topic's Scan succeeds with Findings to narrate
- **THEN** its Podcast Episode is recorded short

#### Scenario: Past 75 percent on plus, the Scan runs and the Podcast Episode does not
- **GIVEN** a plus user whose spend this month is $11.25 of a $15 budget
- **WHEN** their Topic's scheduled Scan succeeds
- **THEN** the Scan is saved and emailed as usual, and no Podcast Episode is recorded

#### Scenario: Past 20 percent on the free plan, the Podcast Episode is not recorded
- **GIVEN** a free user whose spend this month is $0.40 of a $2 budget
- **WHEN** their Topic's Scan succeeds
- **THEN** the Scan is saved as usual, and no Podcast Episode is recorded
