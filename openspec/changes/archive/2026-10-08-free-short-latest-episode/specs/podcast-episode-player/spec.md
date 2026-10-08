## ADDED Requirements

### Requirement: The edit topic modal turns the podcast on and off with the free plan's hint, and the settings card shows its state

The edit topic modal SHALL show a podcast switch at its bottom, after Attachments, for a saved Topic. A switch flipped
there SHALL save with the modal's Save through the shared settings tool, the same one that the chat and the MCP server
use. On a Topic whose owner is on the free plan, the switch SHALL show the hint "The free plan keeps each topic's latest
10-minute episode", and the owner SHALL get the upgrade link "Upgrade for 30-minute episodes, every one kept" beside the
switch. The Topic's settings card SHALL show "Podcast" right-aligned on its last row, beside Cost this month, that reads
"On" or "Off", with no control.

#### Scenario: The settings card shows the state

- **WHEN** a user views the settings card of a Topic that has a podcast
- **THEN** its last row shows "Podcast" at the right, reading "On" or "Off", with no switch

#### Scenario: The edit topic modal saves the switch with its other fields

- **WHEN** the owner opens the edit topic modal, turns the switch at its bottom off, and saves
- **THEN** the Topic's fields and the switch are both saved, and the settings card's Podcast reads "Off"

#### Scenario: A free Topic's switch shows the hint and the upgrade link

- **GIVEN** a Topic whose owner is on the free plan
- **WHEN** the owner opens the edit topic modal
- **THEN** the podcast switch shows the hint and the upgrade link to the plans page

#### Scenario: A paid Topic's switch shows no hint

- **GIVEN** a Topic whose owner is on a paid plan
- **WHEN** the owner opens the edit topic modal
- **THEN** the podcast switch shows no hint and no upgrade link

## REMOVED Requirements

### Requirement: The edit topic modal turns the podcast on and off, and the settings card shows its state

**Reason**: The free plan no longer runs out of Podcast Episodes, so the switch has no plan rejection and no used-up
state.

**Migration**: See "The edit topic modal turns the podcast on and off with the free plan's hint, and the settings card
shows its state".
