## MODIFIED Requirements

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

## ADDED Requirements

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
