## ADDED Requirements

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

## MODIFIED Requirements

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
