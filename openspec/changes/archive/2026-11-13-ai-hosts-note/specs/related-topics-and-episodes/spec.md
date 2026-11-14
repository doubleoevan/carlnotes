## MODIFIED Requirements

### Requirement: A podcast episode's tooltip opens on its titles and play buttons

A Podcast Episode's tooltip SHALL name the podcast over the Podcast Episode's season and number, its title, its date,
duration, and chapter count, and its description. It SHALL open on the Podcast Episode's play buttons and its linked
titles: a table's title cell, the episodes card's rows, and the player card on the Podcast Episode's page. The AI hosts
note SHALL show on the player card's details line and not in the tooltip.

#### Scenario: A table title opens the tooltip with the description

- **WHEN** a visitor hovers a Podcast Episode's title in the "Other episodes" table
- **THEN** the tooltip shows the Podcast Episode's details and its description, and no AI hosts note
