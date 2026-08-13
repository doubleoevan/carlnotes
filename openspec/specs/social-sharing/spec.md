# social-sharing Specification

## Purpose
TBD - created by archiving change social-profiles-and-sharing. Update Purpose after archive.
## Requirements
### Requirement: The public topic route serves meta tags in the HTML the server sends

Crawlers do not execute JavaScript, so the SPA cannot supply link-preview metadata. A route SHALL intercept the public topic path ahead of the static handler, read the app shell's `index.html`, and inject `og:title`, `og:description`, `og:image`, and `twitter:card` before serving it.

The route SHALL resolve the Topic's visibility first, and a private, invite, or unknown Topic SHALL be served the plain app shell with the site's own tags. Every injected value SHALL be HTML-escaped, so a Topic title cannot write markup into the shell.

The same HTML SHALL be served to every requester. The route SHALL NOT vary its response by user agent.

#### Scenario: A crawler receives the tags in the first response

- **WHEN** a request for a public Topic's path is served
- **THEN** the returned HTML already carries `og:title`, `og:description`, `og:image`, and `twitter:card`, before any script runs

#### Scenario: No user-agent sniffing

- **WHEN** the same public topic path is requested by a crawler and by a browser
- **THEN** both receive identical HTML

#### Scenario: The app still boots from the injected shell

- **WHEN** a reader opens a public Topic's path
- **THEN** the injected HTML is still the app shell, and the client router renders the topic page as before

### Requirement: The card image is generated on demand and cached in object storage

The preview image SHALL be served from its own route. That route SHALL check object storage first and, on a miss, render JSX to SVG with Satori and SVG to PNG at 1200×630 with resvg, write the result to storage, and stream it.

Satori has no access to system fonts, so the font files SHALL be committed to the repository and passed as buffers.

The card SHALL carry the wordmark, the Topic title, the owner byline, and the Finding counts. The byline's avatar SHALL be the owner's initials on their tint, redrawn in the card's own layout. The card deliberately never fetches an uploaded or provider photo, so it stays a render of committed inputs.

#### Scenario: A cached card is served from storage

- **WHEN** a card image is requested for a Topic whose card is already stored
- **THEN** the stored object is streamed and nothing is re-rendered

#### Scenario: A miss renders, stores, and streams

- **WHEN** a card image is requested and no stored object matches
- **THEN** it is rendered to a 1200×630 PNG, written to storage, and streamed in the same request

#### Scenario: Fonts come from the repository

- **WHEN** the card renders
- **THEN** its fonts are read from committed files passed as buffers, not from system fonts

### Requirement: The card's storage key carries content and a template version

The stored object's key SHALL cover the Topic id, a hash of the title, the owner username, the owner's published avatar, and the counts, and a template version segment, so a renamed Topic, a renamed owner, or a changed avatar gets a new card url.

The key SHALL name the avatar rather than its bytes: an uploaded avatar's stored key already carries its own stamp, and a provider photo's url changes when the photo does, so either one moving is enough to land the card on a new url. Hashing the image itself would mean fetching it on every request, including the cache hits the key exists to serve.

Slack and X cache preview images aggressively and ignore cache headers, so a key that changes only with the Topic id would leave the first card ever rendered in place permanently. The template version segment SHALL be bumped whenever the card template changes; without it, a template change leaves every existing card frozen at the old design with no error raised anywhere.

#### Scenario: A retitled Topic gets a new card URL

- **WHEN** a Topic's title or counts change
- **THEN** the card's key changes, so the platforms fetch a new image rather than serving their cached copy

#### Scenario: A changed avatar gets a new card URL

- **WHEN** a Topic owner changes the image they publish
- **THEN** the card's key changes, so the platforms fetch a card drawn with the new image

#### Scenario: A cache hit does not fetch the image

- **WHEN** a card already stored under its key is requested
- **THEN** it is served from storage without reading or fetching the owner's image

#### Scenario: A template change is carried by the version segment

- **WHEN** the card template changes and its version segment is bumped
- **THEN** every Topic's card key changes and every cached card is replaced

### Requirement: Each public Topic serves an RSS feed

Each public Topic SHALL expose an RSS feed at a feed path beneath its existing Topic path. The feed SHALL be rejected for a Topic that is not public: unlike the card, a feed carries the Topic's Findings, not just its title, so the route keeps its own visibility check regardless of what the card route does.

#### Scenario: A public Topic's feed is readable

- **WHEN** a reader requests the feed path under a public Topic's path
- **THEN** an RSS feed of that Topic's Findings is returned

#### Scenario: A private Topic has no feed

- **WHEN** the feed path is requested for a Topic that is not public
- **THEN** the request is refused without disclosing the Topic's title

### Requirement: The card draws the Topic owner's published avatar

The card's byline SHALL draw whatever image the owner publishes, resolved when the card is rendered: their uploaded avatar, or the photo from their sign-in provider when they have opted into publishing it. An owner who publishes neither SHALL keep the username initials on their own tint, which is what the app itself draws.

Satori has no network of its own, so the image SHALL be read and inlined before the card is drawn. A provider photo lives at somebody else's url, so fetching it SHALL be bounded by both a timeout and the same size an uploaded avatar is capped at, and SHALL stop reading rather than buffer a response past that size. An image that cannot be read SHALL fall back to the initials, since a card drawn with initials beats no card at all.

#### Scenario: An uploaded avatar is drawn

- **WHEN** a public Topic's owner publishes an uploaded avatar and the card is rendered
- **THEN** that image is drawn in the byline

#### Scenario: An opted-in provider photo is drawn

- **WHEN** a public Topic's owner publishes their sign-in provider's photo and the card is rendered
- **THEN** that photo is fetched, inlined, and drawn in the byline

#### Scenario: An owner with no published image keeps their initials

- **WHEN** a public Topic's owner publishes no image
- **THEN** the card draws their username initials on their own tint

#### Scenario: An unreachable image falls back to the initials

- **WHEN** the owner's published image cannot be read or does not answer in time
- **THEN** the card is still rendered, with the initials in place of the image

#### Scenario: An oversized provider photo is not buffered

- **WHEN** a provider photo's response runs past the size an avatar is capped at
- **THEN** the read stops there, nothing further is held, and the card draws the initials

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

