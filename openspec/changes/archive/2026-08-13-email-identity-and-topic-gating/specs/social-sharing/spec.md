## REMOVED Requirements

### Requirement: The card route refuses a Topic that is not public

**Reason**: A card that refused to render for a private or invite Topic looked broken to exactly the owners most likely to paste that link somewhere. The product decision is that the card draws the same thing for everyone regardless of visibility; nothing about a Topic's title is treated as needing a session-less route to withhold it anymore.

**Migration**: No data migration. The route now serves a card for any Topic id that exists; see the replacement requirement below.

### Requirement: A public Topic offers a share menu

**Reason**: Restricting the share menu to public Topics took away Copy Link on an invite Topic — the one row that actually works for an invitee, since that is what an invite link is for. The menu is now offered on every Topic, with only the rows that cannot work on a given Topic disabled.

**Migration**: No data migration. See the replacement requirement below for the row-level behavior.

## ADDED Requirements

### Requirement: The card route serves every Topic regardless of visibility

The card image route SHALL render for any Topic id that exists, whatever its visibility, since a pasted link is already outside the app by the time anyone sees its card. The route SHALL still answer 404 for a Topic id that matches no row.

#### Scenario: A private or invite Topic's card renders

- **WHEN** a card image is requested for a private or invite Topic
- **THEN** the route renders and serves the card the same way it would for a public Topic

#### Scenario: An unknown Topic 404s

- **WHEN** a card image is requested for a Topic id that does not exist
- **THEN** the route answers 404

### Requirement: Every Topic offers a share menu, with rows disabled where they cannot work

Every Topic SHALL carry a share control beside its Follow control, opening a menu of the platforms a link is commonly shared to, plus a row that copies the Topic's link and a row that copies its feed url. The menu SHALL NOT be a row of always-visible per-platform buttons, since that dates a page and takes the room the Follow control needs.

A row that needs a stranger to be able to open the Topic's link — each share platform, and the RSS feed — SHALL be disabled on a Topic where that is not true, with a tooltip explaining why. Copy Link SHALL remain enabled on every Topic, since it is what an invitee opens. For the Topic's owner, activating a disabled row SHALL open the edit modal where visibility is set, rather than only naming the fix.

#### Scenario: The share menu opens

- **WHEN** a reader activates the share control on a Topic
- **THEN** a menu opens listing the share platforms, a copy-link row, and a copy-feed row, with any row that cannot work on this Topic shown disabled

#### Scenario: A copy row confirms only a copy that happened

- **WHEN** a reader activates a copy row
- **THEN** the url is written to the clipboard and the row confirms it, and the row SHALL NOT claim a copy the browser refused

#### Scenario: A disabled row explains itself

- **WHEN** a reader hovers or focuses a disabled row on an invite or private Topic
- **THEN** a tooltip explains that the Topic must be public for that row to work

#### Scenario: The owner's disabled row is a shortcut to fixing it

- **WHEN** the Topic's owner activates a disabled row
- **THEN** the edit modal opens, where they can change the Topic's visibility

## MODIFIED Requirements

### Requirement: Each public Topic serves an RSS feed

Each public Topic SHALL expose an RSS feed at a feed path beneath its existing Topic path. The feed SHALL be rejected for a Topic that is not public: unlike the card, a feed carries the Topic's Findings, not just its title, so the route keeps its own visibility check regardless of what the card route does.

#### Scenario: A public Topic's feed is readable

- **WHEN** a reader requests the feed path under a public Topic's path
- **THEN** an RSS feed of that Topic's Findings is returned

#### Scenario: A private Topic has no feed

- **WHEN** the feed path is requested for a Topic that is not public
- **THEN** the request is refused without disclosing the Topic's title
