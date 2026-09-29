## REMOVED Requirements

### Requirement: The public topic route serves meta tags in the HTML the server sends

**Reason**: The topic route declares its own head, and the server renders it with the page.

**Migration**: See the added requirement, The topic route renders its meta tags with the page.

### Requirement: A profile page carries its own preview tags

**Reason**: The profile route declares its own head, and a missing user is a 404 instead of the plain shell.

**Migration**: See the added requirement, The profile route renders its preview tags with the page.

## ADDED Requirements

### Requirement: The topic route renders its meta tags with the page

The Topic route SHALL declare `og:title`, `og:description`, `og:image`, `twitter:card`, the title, and the structured data for a public Topic, and its canonical once the Topic has at least `MINIMUM_SHOWN_FINDINGS` Findings, and the server SHALL render them with the page. A Topic that is not public SHALL render its card tags and no findings, and visibility SHALL be decided before any Finding's title, url, or relevance explanation is read. A Topic that is not public reveals only its count of Findings. Every value the route renders into the head SHALL be HTML-escaped, so a Topic title cannot write markup into the page. A visitor's request SHALL be served the same HTML whatever its user agent.

#### Scenario: A crawler receives the tags in the first response

- **WHEN** a request for a public Topic's path is served
- **THEN** the returned HTML already includes `og:title`, `og:description`, `og:image`, and `twitter:card`, before any script runs

#### Scenario: No user-agent sniffing

- **WHEN** the same public topic path is requested by a crawler and by a browser
- **THEN** both receive identical HTML

#### Scenario: A private topic renders no findings

- **WHEN** a private or invite-only Topic page is rendered
- **THEN** it has its card tags and no findings, for any visitor

### Requirement: A public topic's findings are visible HTML

A public Topic's findings SHALL render as visible HTML: a heading with the Topic's name, its description, and its ranked findings as links, each with its relevance explanation, never in a `noscript` block.

#### Scenario: A public topic's findings are in the page

- **WHEN** a client with no JavaScript loads a public Topic page
- **THEN** the page includes the Topic's name as a heading, its description, and its findings as links with their relevance explanations

### Requirement: The profile route renders its preview tags with the page

The profile route SHALL declare the username as the title, a description naming the user's public topics and followers, and the OG and Twitter tags naming the profile's own rendered card, and its canonical url when the user has a public Topic, and the server SHALL render them with the page. A missing user SHALL respond 404 with the page's own missing message.

#### Scenario: A shared profile link unfurls as the person

- **WHEN** a profile URL is fetched by a crawler or a link unfurler
- **THEN** the response's head names the username in the title, and the card tags name the profile's own card

#### Scenario: A missing user is a 404

- **WHEN** the userId matches nobody
- **THEN** the response status is 404, and the page shows its missing-profile message
