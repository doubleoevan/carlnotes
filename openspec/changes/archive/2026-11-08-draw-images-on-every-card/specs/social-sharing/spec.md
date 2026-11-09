## MODIFIED Requirements

### Requirement: The card route serves every Topic regardless of visibility

The card image route SHALL render for any Topic id that exists, whatever its visibility, since a pasted link is already outside the app by the time anyone sees its card. A private or invite Topic's card, and its Podcast Episodes' cards, SHALL draw the Topic's or the Podcast Episode's image the way a public one does, an upload included. The route SHALL still answer 404 for a Topic id that matches no row.

#### Scenario: A private or invite Topic's card renders

- **WHEN** a card image is requested for a private or invite Topic with an image
- **THEN** the route renders and serves the card the same way it would for a public Topic, with the Topic's image

#### Scenario: An unknown Topic 404s

- **WHEN** a card image is requested for a Topic id that does not exist
- **THEN** the route answers 404
