## ADDED Requirements

### Requirement: A profile page carries its own preview tags

`GET /profiles/:userId` SHALL serve the shell with server-rendered preview tags the way Topic pages do: the username as the title, a description naming their public topics and followers, the profile's canonical URL, and the OG and Twitter tags naming the profile's own rendered card. A missing user or an unbuilt bundle SHALL fall through to the plain shell.

#### Scenario: A shared profile link unfurls as the person

- **WHEN** a profile URL is fetched by a crawler or a link unfurler
- **THEN** the response's head names the username in the title and the profile's own URL as canonical

#### Scenario: A missing user falls through

- **WHEN** the userId matches nobody
- **THEN** the plain shell answers, with its fallback tags

### Requirement: A profile link renders its own preview card

`GET /api/profiles/:userId/preview.png` SHALL render a card in the topic card's format: the wordmark on top, the user's avatar and username in the slot a topic card gives its title, the public topic count bottom left, and the follower count bottom right. The card SHALL be cached and versioned the way topic cards are, so an avatar or count change lands the card on a new URL. A missing user SHALL answer 404.

#### Scenario: A profile card draws the person

- **WHEN** the card is fetched for an existing user
- **THEN** a PNG at the platform preview size draws their avatar or initials, their username, and their public topic and follower counts

#### Scenario: A missing user has no card

- **WHEN** the userId matches nobody
- **THEN** the response is a 404
