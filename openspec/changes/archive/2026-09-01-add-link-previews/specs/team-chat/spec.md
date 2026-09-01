## MODIFIED Requirements

### Requirement: Messages render phone-shaped, through one component, in a wider panel

Every message SHALL render with the author's avatar beside the bubble and their display name above it, in both the solo Coffee talk and the team room, never collapsed on consecutive messages from the same author — one component serves both rooms with no participant-count branching, and no bubble's author is ever inferred from position. Carl's avatar SHALL be the raccoon, the same art as the social avatar, bundled under the application source and imported by the component so the bundler hashes and caches it — never fetched per message or read from object storage. His display name is Carl.

A message whose first url has a stored preview SHALL render that card below the bubble and above the shared files, showing the page's title, description, and proxied image. The card is an addition and never a replacement: the url SHALL stay in the message text exactly as it was written, so a reader always sees where a link actually goes. A message with no url, or one whose url has no stored preview, renders as it did before.

The Coffee talk panel SHALL keep its docked width, with the expand toggle as the large-view control and the message column limited so a line of text stays in a comfortable reading range. A substantially wider docked panel was tried and rejected for covering too much of the page.

#### Scenario: Consecutive messages keep their author

- **WHEN** one member posts three messages in a row in either room
- **THEN** each shows the avatar and display name

#### Scenario: Carl's face is bundled

- **WHEN** Carl's messages render
- **THEN** his raccoon avatar loads as a hashed bundled asset with no per-message fetch

#### Scenario: A link renders a card without losing the url

- **WHEN** a message holding a previewed url renders
- **THEN** the card shows below the bubble with the page's title, description, and an image served from this origin, and the message text still shows the url as written

#### Scenario: Wide screens read comfortably

- **WHEN** the panel opens at a large viewport
- **THEN** the panel keeps its docked width with the expand toggle available, the message column stays limited, and small viewports render as before
