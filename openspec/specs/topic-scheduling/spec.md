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

### Requirement: Setting a daily frequency is gated by the plan's daily topic limit

Every path that sets a Topic's frequency SHALL enforce the daily topic limit from `authorization`: both creating a Topic and changing an existing Topic's frequency. The edit path is the one that gets missed, and missing it makes the limit meaningless — a user held to one daily Topic at creation could otherwise create three weekly ones and switch them over.

The check SHALL run before the Topic is written, so a rejected change leaves the Topic exactly as it was.

Only a save that **moves** a Topic onto a daily frequency SHALL take a slot. A Topic already on one SHALL keep the slot it holds and SHALL be saveable regardless of how many daily Topics its owner has, including more than their plan allows. An owner can hold more than their limit — by downgrading, or by having had the Topics before the limit existed — and counting a Topic that already holds a slot as taking a new one would lock such an owner out of editing their own Topics at all, down to a rename.

Moving between the two daily frequencies SHALL take nothing either, since both draw on the same slot.

#### Scenario: Creating past the limit is rejected

- **GIVEN** a user whose daily Topics already fill their limit
- **WHEN** they create a Topic with a daily or weekdays frequency
- **THEN** the creation is rejected and no Topic row is written

#### Scenario: Switching an existing topic past the limit is rejected

- **GIVEN** the same user, with a weekly Topic
- **WHEN** they change that Topic's frequency to daily
- **THEN** the change is rejected and the Topic keeps its weekly frequency

#### Scenario: Editing a topic that is already daily still saves

- **GIVEN** a user at their daily topic limit
- **WHEN** they edit one of those daily Topics without changing its frequency
- **THEN** the save succeeds, since it takes no new daily slot

#### Scenario: An owner past their limit can still edit the Topics they hold

- **GIVEN** an owner holding more daily Topics than their plan allows, after a downgrade
- **WHEN** they rename one of those Topics, leaving its daily frequency alone
- **THEN** the save succeeds, and only a Topic moving onto a daily frequency is ever rejected

#### Scenario: Moving between the two daily frequencies takes nothing

- **GIVEN** a user at their daily topic limit
- **WHEN** they change one of those Topics from `daily` to `weekdays`
- **THEN** the save succeeds, since both frequencies draw on the slot it already holds

#### Scenario: Moving a topic off a daily frequency frees a slot

- **GIVEN** a user at their daily topic limit
- **WHEN** they change one of those Topics to weekly and then set another to daily
- **THEN** both changes succeed

### Requirement: A rejected daily frequency explains itself and offers the way up

A rejection SHALL be surfaced to the user in the product's own voice, SHALL name the limit as a number rather than gesturing at it, and SHALL offer a path to the pricing page.

The user is being told they cannot have something, at the moment they asked for it, so it SHALL say what the limit is and what would raise it.

#### Scenario: The rejection names the number

- **WHEN** a user is rejected a daily frequency
- **THEN** the message states how many Topics their plan runs on a daily schedule, and links to pricing

#### Scenario: The rejection does not read as an error

- **WHEN** the rejection is shown
- **THEN** it reads as the product speaking, not as a validation failure or a stack trace

