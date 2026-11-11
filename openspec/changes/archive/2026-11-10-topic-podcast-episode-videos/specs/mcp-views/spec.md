## ADDED Requirements

### Requirement: The findings view's podcast player links to the film

If the Podcast Episode in the findings MCP view's podcast player has a film, the player SHALL show a link that reads
"Watch on CarlNotes". The link SHALL ask the host to open that Podcast Episode's page on carlnotes.com at its film
player. A Podcast Episode with no film SHALL show no such link. The MCP view SHALL NOT play the film itself.

#### Scenario: Watch on CarlNotes opens the film on the site

- **WHEN** a user presses "Watch on CarlNotes" in the findings view's podcast player
- **THEN** the host is asked to open the Podcast Episode's page at `#film`

#### Scenario: No film, no link

- **WHEN** the findings view's Podcast Episode has no film
- **THEN** the player shows no "Watch on CarlNotes" link
