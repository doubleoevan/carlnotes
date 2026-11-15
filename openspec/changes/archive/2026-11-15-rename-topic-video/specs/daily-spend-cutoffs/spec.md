## MODIFIED Requirements

### Requirement: The spend control settings hold three switches that are off until an admin turns them on

The spend control settings SHALL hold three switches beside the unverified accounts switch: one that pauses new
podcast episodes, one that pauses new films, and one that limits the home to its featured items. Each SHALL be off
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
- **THEN** both pauses and the featured-only home read as off, and the generated chapter image limit reads its default

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
