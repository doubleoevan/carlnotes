## ADDED Requirements

### Requirement: Setting a daily frequency is gated by the plan's daily topic limit

Every path that sets a Topic's frequency SHALL enforce the daily topic limit from `authorization`: both creating a Topic and changing an existing Topic's frequency. The edit path is the one that gets missed, and missing it makes the limit meaningless — a user held to one daily Topic at creation could otherwise create three weekly ones and switch them over.

The check SHALL run before the Topic is written, so a refused change leaves the Topic exactly as it was.

Only a save that **moves** a Topic onto a daily frequency SHALL claim a slot. A Topic already on one SHALL keep the slot it holds and SHALL be saveable regardless of how many daily Topics its owner has, including more than their plan allows. An owner can hold more than their limit — by downgrading, or by having had the Topics before the limit existed — and counting a Topic that already holds a slot as claiming a new one would lock such an owner out of editing their own Topics at all, down to a rename.

Moving between the two daily frequencies SHALL claim nothing either, since both draw on the same slot.

#### Scenario: Creating past the limit is refused

- **GIVEN** a user whose daily Topics already fill their limit
- **WHEN** they create a Topic with a daily or weekdays frequency
- **THEN** the creation is refused and no Topic row is written

#### Scenario: Switching an existing topic past the limit is refused

- **GIVEN** the same user, with a weekly Topic
- **WHEN** they change that Topic's frequency to daily
- **THEN** the change is refused and the Topic keeps its weekly frequency

#### Scenario: Editing a topic that is already daily still saves

- **GIVEN** a user at their daily topic limit
- **WHEN** they edit one of those daily Topics without changing its frequency
- **THEN** the save succeeds, since it claims no new daily slot

#### Scenario: An owner past their limit can still edit the Topics they hold

- **GIVEN** an owner holding more daily Topics than their plan allows, after a downgrade
- **WHEN** they rename one of those Topics, leaving its daily frequency alone
- **THEN** the save succeeds, and only a Topic moving onto a daily frequency is ever refused

#### Scenario: Moving between the two daily frequencies claims nothing

- **GIVEN** a user at their daily topic limit
- **WHEN** they change one of those Topics from `daily` to `weekdays`
- **THEN** the save succeeds, since both frequencies draw on the slot it already holds

#### Scenario: Moving a topic off a daily frequency frees a slot

- **GIVEN** a user at their daily topic limit
- **WHEN** they change one of those Topics to weekly and then set another to daily
- **THEN** both changes succeed

### Requirement: A refused daily frequency explains itself and offers the way up

A refusal SHALL be surfaced to the user in the product's own voice, SHALL name the limit as a number rather than gesturing at it, and SHALL offer a path to the pricing page.

The user is being told they cannot have something, at the moment they asked for it, so it SHALL say what the ceiling is and what would raise it.

#### Scenario: The refusal names the number

- **WHEN** a user is refused a daily frequency
- **THEN** the message states how many Topics their plan runs on a daily schedule, and links to pricing

#### Scenario: The refusal does not read as an error

- **WHEN** the refusal is shown
- **THEN** it reads as the product speaking, not as a validation failure or a stack trace
