# topic-scheduling Specification

## Purpose
TBD - created by archiving change add-topic-scheduling. Update Purpose after archive.
## Requirements
### Requirement: A topic's frequency is daily, weekdays, or weekly
A topic's `frequency` SHALL be one of `daily`, `weekdays`, or `weekly`. Every topic SHALL carry a scheduled time of day, and a topic whose frequency is weekly SHALL additionally carry a scheduled day of week. A new topic SHALL default to daily at 9:00 AM; a weekly topic SHALL default its day to Monday.

#### Scenario: A new topic gets the default schedule
- **WHEN** a user creates a topic without changing the schedule fields
- **THEN** it saves as daily, scheduled for 9:00 AM

#### Scenario: A weekly topic carries a day
- **WHEN** a user sets a topic's frequency to weekly without picking a day
- **THEN** it saves with Monday as the scheduled day

### Requirement: The edit modal offers a time picker matching the scheduled-tasks pattern
The edit-topic modal's Frequency field SHALL show, beside the frequency select, a time-of-day control showing the selected time (for example "9:00 AM") that opens a list of every 30-minute increment across the full day, closing once a time is chosen. Every option, AM and PM alike, SHALL be genuinely reachable by scrolling the open list — not just present in the markup behind a scroll container that doesn't actually respond to the user's input. A day-of-week select SHALL appear beside it only while frequency is weekly.

#### Scenario: Picking a time closes the list
- **WHEN** the user opens the time control and selects a slot
- **THEN** the control shows the new time and the list closes

#### Scenario: A PM time is reachable
- **WHEN** the user opens the time control and scrolls or navigates toward the end of the list
- **THEN** a PM option is reachable and selectable, the same as any AM option

#### Scenario: The day control appears only for weekly
- **WHEN** the user changes frequency away from weekly
- **THEN** the day-of-week select disappears, and reappears with its prior value if they switch back to weekly

### Requirement: The topic's schedule renders as a sentence
The topic detail page's Artisanal Blend card SHALL render a topic's schedule as a sentence naming the frequency, the time, and — for weekly — the day: for example "Daily at 9:00 AM" or "Weekly on Monday at 9:00 AM".

#### Scenario: A weekly topic's schedule names its day
- **WHEN** the owner opens a weekly topic's page
- **THEN** the Schedule row reads "Weekly on <day> at <time>", not just the frequency word

