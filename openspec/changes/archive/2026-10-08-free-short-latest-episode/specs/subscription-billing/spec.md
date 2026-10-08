## MODIFIED Requirements


### Requirement: A plan card describes its limits in scans, not dollars

Each pricing card SHALL describe its plan in the units a reader can reason about, and SHALL NOT show the monthly spend
backstop. That figure is our cost limit, not the reader's price, and on a page about what things cost it reads as a
second charge.

Each card SHALL list, in this order: how many Topics the plan allows, how many of them run on a daily schedule, how many
manual scans a day, an approximate monthly scan total, and the plan's podcast line. The order matters: each line answers
the question the line above it raises. The podcast line SHALL read "Short podcast for latest brew only" on
the free plan and "Full podcasts for every brew" on a paid plan.

The monthly scan total SHALL be stated as approximate, since it depends on how the user schedules their Topics. It SHALL
be derived from the plan's monthly budget and the average cost of one scan, rounded up to the next ten.

#### Scenario: A card reads in scans

- **WHEN** a pricing card renders
- **THEN** it lists topics, daily-scheduled topics, manual scans a day, an approximate monthly scan total, and its
  podcast line, and shows no dollar budget

#### Scenario: The free card

- **WHEN** the free card renders at the monthly interval
- **THEN** it reads 3 topics, 1 on a daily schedule, 5 manual scans a day, about 30 scans a month, and its podcast
  line reads "Short podcast for latest brew only"

#### Scenario: The paid cards

- **WHEN** the plus and premium cards render at the monthly interval
- **THEN** plus reads 10, 3, 15, and about 150, and premium reads 25, 6, 30, and about 350, and each podcast line
  reads "Full podcasts for every brew"

