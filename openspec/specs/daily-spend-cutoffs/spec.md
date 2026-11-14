# daily-spend-cutoffs Specification

## Purpose
Bounds a day's free-plan spend with three cutoffs that pause the least important free spending first and chat last, slow
new Topics' first Scans under a dispatch limit without ever skipping one, and clear on their own when the UTC day turns.

## Requirements

### Requirement: Free-plan spend is the UTC day's spend billed to free users

The free-plan spend SHALL be the spend recorded since midnight UTC that bills a user whose plan is free and who is not
an admin. It SHALL sum the same kinds of spend as the day's spend report, read by each user's current plan and role. A
paid user's or an admin's spend SHALL NOT count toward it.

#### Scenario: A paid user's spend does not count

- **GIVEN** a free user who spent 30 dollars today and a paid user who spent 200 dollars today
- **WHEN** the free-plan spend is read
- **THEN** it is 30 dollars

#### Scenario: An admin's spend does not count

- **GIVEN** an admin on the free plan who spent 80 dollars today
- **WHEN** the free-plan spend is read
- **THEN** the admin's 80 dollars are left out

#### Scenario: Yesterday's spend does not count

- **GIVEN** a free user who spent 120 dollars before midnight UTC and nothing since
- **WHEN** the free-plan spend is read after midnight UTC
- **THEN** it is zero

### Requirement: Each daily spend cutoff is passed at its dollar amount

There SHALL be three daily spend cutoffs: the podcast episodes cutoff, 65 dollars by default, the scheduled scans
cutoff, 100 dollars by default, and the chat cutoff, 150 dollars by default. A cutoff SHALL be passed while the
free-plan spend is at or above its amount, and SHALL NOT be passed below it. When the UTC day turns, each SHALL clear
with no action from anyone.

#### Scenario: A cutoff passes at its amount

- **GIVEN** the default podcast episodes cutoff of 65 dollars
- **WHEN** the free-plan spend reaches 65 dollars
- **THEN** the podcast episodes cutoff is passed and the scheduled scans and chat cutoffs are not

#### Scenario: Spend under a cutoff leaves it unpassed

- **WHEN** the free-plan spend is 64.99 dollars
- **THEN** no cutoff is passed

#### Scenario: Every cutoff clears when the day turns

- **GIVEN** every cutoff passed at 23:50 UTC
- **WHEN** the cutoff state is read after midnight UTC with no spend recorded since
- **THEN** no cutoff is passed

### Requirement: The cutoff state is derived, cached briefly, and unpassed when unavailable

Whether each cutoff is passed SHALL be derived from the free-plan spend and the settings on each read, and never stored
on a Topic, a Scan, or a user. It SHALL be read through a cache of at most one minute that never outlives its UTC day.
If the spend or the settings cannot be read, every cutoff SHALL count as unpassed, and the failure SHALL be reported.

#### Scenario: A failed spend read pauses nothing

- **GIVEN** a free-plan spend of 150 dollars and a database read that fails
- **WHEN** the sweep reads the cutoff state
- **THEN** every cutoff counts as unpassed, the failure is reported, and the sweep starts free users' scheduled Scans

#### Scenario: A failed read is not cached

- **GIVEN** a cutoff state read that failed
- **WHEN** the cutoff state is read again within the minute
- **THEN** the spend and the settings are read again instead of reusing the unpassed result

#### Scenario: A new spend shows within a minute

- **GIVEN** a free-plan spend that crosses the scheduled scans cutoff
- **WHEN** a minute has passed
- **THEN** every reader sees the scheduled scans cutoff as passed

### Requirement: Past the podcast episodes cutoff, a free user's repeat Podcast Episodes are skipped

While the podcast episodes cutoff is passed, a new Podcast Episode that bills a free, non-admin user SHALL be skipped
before it spends, the way a monthly budget cutoff skips one, if its Topic already has a published or removed Podcast
Episode. A Topic's first Podcast Episode SHALL still record, even if its first Scan kept nothing.

#### Scenario: A repeat Podcast Episode is skipped

- **GIVEN** the podcast episodes cutoff is passed and a free user's Topic with a published Podcast Episode
- **WHEN** a Scan of that Topic succeeds with new Findings
- **THEN** no Podcast Episode row is created, and the Scan's Findings are kept

#### Scenario: A Topic's first Podcast Episode records

- **GIVEN** the podcast episodes cutoff is passed and a free user's new Topic with no Podcast Episode
- **WHEN** its first Scan succeeds with Findings
- **THEN** its Podcast Episode records on the standard speech tier

#### Scenario: A first Scan that kept nothing leaves the first Podcast Episode for later

- **GIVEN** a free user's Topic whose first Scan kept no Finding, so it recorded no Podcast Episode
- **WHEN** its next Scan succeeds with Findings while the podcast episodes cutoff is passed
- **THEN** that Scan's Podcast Episode records, as the Topic's first

#### Scenario: A failed Podcast Episode does not count as the first

- **GIVEN** a free user's Topic whose only Podcast Episode failed
- **WHEN** a Scan of that Topic succeeds with Findings while the podcast episodes cutoff is passed
- **THEN** its Podcast Episode records

#### Scenario: A paid user's Podcast Episodes are untouched

- **GIVEN** the podcast episodes cutoff is passed
- **WHEN** a Scan that bills a paid user succeeds on a Topic with published Podcast Episodes
- **THEN** its Podcast Episode records as it would below the cutoff

### Requirement: Past the scheduled scans cutoff, a free user's scheduled Scans wait for the next day

While the scheduled scans cutoff is passed, the sweep SHALL start no scheduled Scan of a Topic whose owner is free and
not an admin. It SHALL save no failed Scan, send no email, and spend nothing on the Topic, which SHALL stay scheduled so
a sweep starts it once the cutoff is no longer passed. Paid owners' and admins' Topics SHALL start as before.

#### Scenario: A paused scheduled Scan leaves its Topic scheduled

- **GIVEN** the scheduled scans cutoff is passed and a free user's daily Topic that is scheduled
- **WHEN** the sweep runs
- **THEN** no Scan row is written for it, no email is sent, and it is counted as skipped past the daily spend cutoff

#### Scenario: A paused scheduled Scan starts after the day turns

- **GIVEN** a free user's Topic that a sweep skipped past the scheduled scans cutoff at 23:30 UTC
- **WHEN** the first sweep after midnight UTC runs
- **THEN** that Topic's scheduled Scan starts

#### Scenario: A paid user's scheduled Scans are untouched

- **GIVEN** the scheduled scans cutoff is passed and a paid user's Topic that is scheduled
- **WHEN** the sweep runs
- **THEN** its scheduled Scan starts

### Requirement: A Topic's first Scan is never skipped or failed by a daily spend cutoff

A Topic's first Scan is its earliest Scan row, the one written with the Topic. No daily spend cutoff SHALL skip it,
fail it, or start it without its creation trigger. The first Scan dispatch limit is the only thing that SHALL delay it.
A monthly budget or key budget that is spent SHALL still fail it before it waits, as today.

#### Scenario: A first Scan past every cutoff still runs

- **GIVEN** every cutoff is passed and a free user creates a Topic
- **WHEN** a sweep reaches the Topic's first Scan under the first Scan dispatch limit
- **THEN** the first Scan starts with the creation trigger, and its Podcast Episode records on the standard speech tier

#### Scenario: A spent monthly budget still fails the first Scan

- **GIVEN** a free user whose monthly budget is spent, while the scheduled scans cutoff is passed
- **WHEN** the user creates a Topic
- **THEN** its first Scan is failed with the budget reason, as it would be below the cutoff, and does not wait

### Requirement: The first Scan dispatch limit starts the oldest Waiting Scans each sweep

A Waiting Scan is a Scan row that is still running, was never dispatched, and that the first Scan dispatch limit
applies to. Each sweep SHALL start at most the limit's number of Waiting Scans, 5 by default, oldest first, and count
none against the scan dispatch limit. A limit of zero SHALL start none. A Waiting Scan SHALL keep its trigger.

#### Scenario: Waiting Scans start oldest first

- **GIVEN** a first Scan dispatch limit of 5 and 12 Waiting Scans
- **WHEN** a sweep runs
- **THEN** the 5 oldest start, and the other 7 stay waiting for the next sweep

#### Scenario: A limit of zero keeps every Waiting Scan waiting

- **GIVEN** a first Scan dispatch limit of zero and 3 Waiting Scans
- **WHEN** a sweep runs
- **THEN** none of them starts, and all 3 are still running and undispatched

#### Scenario: A Waiting Scan is never closed out as stale

- **GIVEN** a Waiting Scan opened six hours ago
- **WHEN** the stale scan close-out runs
- **THEN** the Waiting Scan stays running

#### Scenario: A Waiting Scan is never failed for a spent key

- **GIVEN** a Waiting first Scan whose owner's key budget was spent after the Topic was created
- **WHEN** a sweep starts it under the limit
- **THEN** it starts instead of being marked failed for the spent key

#### Scenario: A waiting Topic is not taken as a scheduled Scan

- **GIVEN** a Topic whose only Scan is a Waiting first Scan, so the Topic is scheduled
- **WHEN** a sweep's scheduled Scans run and the limit leaves that Scan waiting
- **THEN** the Topic's Scan is not started as a scheduled Scan

#### Scenario: Waiting Scans start without the limit once it no longer applies

- **GIVEN** 40 Waiting Scans left waiting under the scheduled scans cutoff
- **WHEN** the first sweep after midnight UTC runs
- **THEN** all 40 start with their triggers, since none is a Waiting Scan any longer

### Requirement: Past the scheduled scans cutoff, every free first Scan waits for the limit

While the scheduled scans cutoff is passed, the api SHALL write a free, non-admin owner's new Topic's first Scan row as
running and SHALL NOT start it, leaving it to the first Scan dispatch limit. The Topic's url Sources SHALL still be
screened. A paid owner's or an admin's first Scan SHALL start at once, as before.

#### Scenario: A free user's first Scan waits past the cutoff

- **GIVEN** the scheduled scans cutoff is passed
- **WHEN** a free user creates a Topic
- **THEN** its first Scan row is running and undispatched, and its url Sources are screened

#### Scenario: A paid user's first Scan starts at once past the cutoff

- **GIVEN** the scheduled scans cutoff is passed
- **WHEN** a paid user creates a Topic
- **THEN** its first Scan starts at once with the creation trigger

### Requirement: The unverified accounts switch limits unverified accounts' first Scans

While the unverified accounts switch is on, a first Scan whose owner signed up with a password and has not verified
their email SHALL wait under the first Scan dispatch limit, whatever the day's spend. Every other first Scan SHALL be
unaffected by the switch. The switch SHALL be off unless an admin turns it on.

#### Scenario: An unverified password account's first Scan waits

- **GIVEN** the switch is on, no cutoff is passed, and a user who signed up with a password and has not verified
- **WHEN** the user creates a Topic
- **THEN** its first Scan waits for the first Scan dispatch limit

#### Scenario: A verified account's first Scan starts at once

- **GIVEN** the switch is on and no cutoff is passed
- **WHEN** a user who signed in with Google creates a Topic
- **THEN** its first Scan starts at once

#### Scenario: The switch leaves later Scans alone

- **GIVEN** the switch is on and an unverified password account's Topic whose first Scan finished
- **WHEN** the Topic is scheduled for a Scan and no cutoff is passed
- **THEN** its scheduled Scan starts as before

### Requirement: A free user's manual Scan past the scheduled scans cutoff waits for the limit

While the scheduled scans cutoff is passed, a manual Scan that bills a free, non-admin user SHALL pass the same checks
as today and SHALL then be written as a running, undispatched manual Scan row that waits for the first Scan dispatch
limit. The request SHALL respond as started. A paid user's or an admin's manual Scan SHALL start at once. Stopping a
Topic's Scan SHALL save a Waiting Scan with no workflow as stopped, so the sweep never starts it.

#### Scenario: A free user's manual Scan waits

- **GIVEN** the scheduled scans cutoff is passed and a free user's Topic with no Scan running
- **WHEN** the user asks for a Scan by hand
- **THEN** the response says the Scan started, and its row waits for the first Scan dispatch limit

#### Scenario: A manual Scan asked for while the first Scan waits

- **GIVEN** a Topic whose first Scan is waiting
- **WHEN** its owner asks for a Scan by hand
- **THEN** the response says a Scan is already running, and the Waiting first Scan is left as it was

#### Scenario: A stopped Waiting Scan never starts

- **GIVEN** a Topic whose manual or first Scan is waiting with no workflow
- **WHEN** a user who may scan the Topic stops its Scan
- **THEN** the response says the Scan stopped, its row is saved as stopped, and no sweep starts it

### Requirement: Past the chat cutoff, a free user's chat with Carl pauses until the day turns

Past the chat cutoff, a chat turn or a voice request from a free user who is not an admin SHALL be rejected before any
model is called, on a Topic's chat, a team's chat, the new-topic chat, and a chat room's voice, with a 429 whose error
is `chat paused`. A chat room message to Carl SHALL be rejected privately in its post's response, and nothing posts. A
spent monthly budget SHALL be rejected as a spent budget first. The chat SHALL stay open. A paid user's or an
admin's chat SHALL NOT pause.

#### Scenario: A free user's chat turn pauses

- **GIVEN** a free user with budget left and a free-plan spend of 150 dollars
- **WHEN** the user asks Carl a question on a Topic's chat
- **THEN** the chat turn is rejected as paused before any model is called, and the chat says "Carl is taking a break
  until midnight UTC. Ask him again then."

#### Scenario: A chat room message to Carl pauses

- **GIVEN** a free user with budget left and a free-plan spend of 150 dollars
- **WHEN** the user mentions Carl in a team's chat room
- **THEN** the post is rejected privately as paused, nothing posts, and the chat room says Carl is taking a break until
  midnight UTC

#### Scenario: A spent budget comes first

- **GIVEN** a free user whose monthly budget is spent and a free-plan spend past the chat cutoff
- **WHEN** the user asks Carl a question
- **THEN** the chat turn is rejected as a spent budget

#### Scenario: A paid user's chat is untouched

- **GIVEN** a Plus user and a free-plan spend past the chat cutoff
- **WHEN** the user asks Carl a question
- **THEN** Carl answers

#### Scenario: The chat opens again when the day turns

- **GIVEN** a free user whose chat paused at 22:00 UTC
- **WHEN** the user asks Carl a question after midnight UTC
- **THEN** Carl answers

### Requirement: The settings default from Doppler and an admin overrides them

The three cutoffs, the first Scan dispatch limit, the signup alert threshold, and the generated chapter image limit
SHALL each default from a Doppler setting, or from the built-in default if that setting is unset, empty, or invalid.
An admin override SHALL replace a default with no deploy or restart, every reader SHALL see it within its next read,
and clearing it SHALL return to the default.

#### Scenario: An override takes effect at once

- **GIVEN** the default scheduled scans cutoff of 100 dollars and a free-plan spend of 80 dollars
- **WHEN** an admin saves a scheduled scans cutoff of 75 dollars
- **THEN** the next sweep reads the scheduled scans cutoff as passed

#### Scenario: Clearing an override returns to the default

- **GIVEN** an overridden first Scan dispatch limit of 20 and a Doppler value of 8
- **WHEN** the admin clears the override
- **THEN** the next sweep starts at most 8 Waiting Scans

#### Scenario: An image limit override reaches the next film render

- **GIVEN** a Doppler generated chapter image limit of 40
- **WHEN** an admin saves a generated chapter image limit of 0
- **THEN** the next film render draws no generated image, and no worker was restarted

### Requirement: Nobody is told about a daily spend cutoff

No notice, warning, dialog, email, push notification, or copy SHALL tell a user that a cutoff is passed or that a Scan
is waiting, except the paused chat turn's own line, which names neither spend nor a cutoff. A Waiting Scan SHALL show on
the Topic page, the Topic's cards, and the MCP scan status the way a Scan that is still under way shows today.

#### Scenario: A Waiting first Scan reads as under way

- **GIVEN** a free user's new Topic whose first Scan is waiting
- **WHEN** the user opens the Topic page
- **THEN** the page shows a Scan under way, with no message about spend or waiting

### Requirement: The spend control settings hold three switches that are off until an admin turns them on

The spend control settings SHALL hold three switches beside the unverified accounts switch: one that pauses new
podcast episodes, one that pauses new films, and one that limits the home to its pinned items. Each SHALL be off
until an admin turns it on, SHALL be saved with no deploy or restart, and SHALL reach every reader within its next
read of the settings. If the settings cannot be read, each SHALL read as off, and the failure SHALL be reported.

#### Scenario: A pause reaches the worker without a restart

- **GIVEN** the pause on new films is off
- **WHEN** an admin turns it on and the next Podcast Episode publishes
- **THEN** no film starts for that Podcast Episode, and no worker was restarted

#### Scenario: A failed settings read pauses nothing

- **GIVEN** the pause on new podcast episodes is on and a settings read that fails
- **WHEN** a Scan succeeds with Findings to narrate
- **THEN** the switch reads as off, the Podcast Episode records, and the failure is reported

#### Scenario: A new database has every switch off

- **WHEN** the settings are read from a table with no saved row
- **THEN** all three switches and the unverified accounts switch read as off

### Requirement: A missing settings field turns nothing on

A cached settings value that lacks a field SHALL read that field's switch as off and its override as unset. A posted
settings payload that lacks a field SHALL leave that field's stored value as it was. A rolling deploy and an admin
page loaded before it SHALL therefore change no setting. The admin console SHALL post only the settings its tab
changed since it loaded or last saved, and SHALL post nothing if it changed none.

#### Scenario: An older replica's cached settings turn nothing on

- **GIVEN** a cached settings value written by a replica that does not know the new switches
- **WHEN** a new replica reads it
- **THEN** both pauses and the pinned-only home read as off, and the generated chapter image limit reads its default

#### Scenario: An admin page loaded before the deploy keeps the new settings

- **GIVEN** the pause on new films saved as on
- **WHEN** an admin page loaded before the deploy saves a first Scan dispatch limit with a payload that has no pause
  field
- **THEN** the dispatch limit is saved and the pause on new films is still on

#### Scenario: An older admin tab leaves another tab's save alone

- **GIVEN** the pause on new podcast episodes saved as on from one tab, and a second tab loaded before that save
- **WHEN** the second tab saves a first Scan dispatch limit
- **THEN** its payload names the dispatch limit alone, and the pause is still on

#### Scenario: A first save of one setting

- **WHEN** a save names one setting and the table has no row
- **THEN** that setting is stored, and every other setting reads its default

### Requirement: The unverified accounts switch also limits an unverified account's chat, voice, and manual Scans

While the unverified accounts switch is on, a chat turn or a voice request from a free, non-admin user who signed up
with a password and has not verified their email SHALL be rejected before any model is called, with a line that says
to verify the address, and a manual Scan that bills that user SHALL wait under the first Scan dispatch limit as that
user's first Scan does. The line SHALL name neither spend nor a cutoff. Every other user SHALL be unaffected by the
switch.

#### Scenario: An unverified password account's chat turn is rejected

- **GIVEN** the switch is on, no cutoff is passed, and a user who signed up with a password and has not verified
- **WHEN** the user asks Carl a question on a Topic's chat
- **THEN** the chat turn is rejected before any model is called, and the chat says to verify the email address

#### Scenario: An unverified password account's manual Scan waits

- **GIVEN** the switch is on and an unverified password account's Topic with no Scan running
- **WHEN** the user asks for a Scan by hand
- **THEN** the response says the Scan started, its row waits for the first Scan dispatch limit, and the Topic page
  shows a Scan under way with no message about waiting

#### Scenario: A provider account is never affected

- **GIVEN** the switch is on
- **WHEN** a user who signed in with Google, GitHub, or Apple asks Carl a question and asks for a Scan by hand
- **THEN** Carl answers and the Scan starts at once

#### Scenario: A paid account is never affected

- **GIVEN** the switch is on
- **WHEN** a paid user who signed up with a password and has not verified asks Carl a question
- **THEN** Carl answers

#### Scenario: A verified account chats again

- **GIVEN** the switch is on and an unverified password account whose chat turn was rejected
- **WHEN** the user follows their verification link and asks again
- **THEN** Carl answers

#### Scenario: The switch off changes nothing

- **GIVEN** the switch is off
- **WHEN** an unverified password account asks Carl a question
- **THEN** Carl answers as before
