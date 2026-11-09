# Spec Delta

## ADDED Requirements

### Requirement: The Topic card draws the Topic's image

A Topic with an image SHALL have a share card that draws the image across the card's top, edge to edge from the
original's center, with the title, byline, and counts on the card under it, the way the home page's card is laid out.
A Topic with no image SHALL keep the text card. A Podcast Episode's card SHALL draw its own image the same way, or its
Topic's until it has one.

#### Scenario: A Topic with an image gets a picture card

- **WHEN** a Topic with an image has its card rendered
- **THEN** the card shows the image across its top and the title under it

## MODIFIED Requirements

### Requirement: The card's storage key carries content and a template version

The stored object's key SHALL cover the Topic id, a hash of the title, the owner username, the owner's published avatar,
the counts, and the Topic's image hash, and a template version segment, so a renamed Topic, a renamed owner, a changed
avatar, or a new image gets a new card url.

The key SHALL name the avatar rather than its bytes: an uploaded avatar's stored key already carries its own stamp, and
a provider photo's url changes when the photo does, so either one moving is enough to land the card on a new url.
Hashing the image itself would mean fetching it on every request, including the cache hits the key exists to serve.

Slack and X cache preview images aggressively and ignore cache headers, so a key that changes only with the Topic id
would leave the first card ever rendered in place permanently. The template version segment SHALL be bumped whenever the
card template changes; without it, a template change leaves every existing card frozen at the old design with no error
raised anywhere.

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

#### Scenario: A new Topic image gets a new card URL

- **WHEN** a Topic's image is regenerated or uploaded
- **THEN** the card's key changes and the next card drawn shows the new image
