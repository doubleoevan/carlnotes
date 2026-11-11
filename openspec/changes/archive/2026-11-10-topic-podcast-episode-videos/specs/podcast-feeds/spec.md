## ADDED Requirements

### Requirement: A Topic with a film has a film feed beside its audio feed

A Topic with a film SHALL have a second RSS feed with the same channel as its audio feed. It SHALL list only the Podcast
Episodes whose film rendered. Each item SHALL have the audio item's title, description, season, number, cover,
chapters file, and transcript, a GUID of its own that never changes, and an enclosure with the film's url, byte size,
and `video/mp4` type.

#### Scenario: The film feed lists only films

- **GIVEN** a Topic with three Podcast Episodes, two of them with a film
- **WHEN** a podcast app fetches the Topic's film feed
- **THEN** the feed has two items, each with a `video/mp4` enclosure

#### Scenario: The film feed keeps the chapters

- **WHEN** a podcast app fetches a film item's chapters file
- **THEN** it holds the same chapters, times, and source urls as the audio item's

#### Scenario: A failed film is never listed

- **WHEN** a Podcast Episode's film fails to render
- **THEN** the film feed has no item for it, and the audio feed still does

### Requirement: The film feed follows the audio feed's access, tokens, and caching

A public Topic's film feed SHALL be public at its own url. A private or invite Topic's film feed SHALL use the
listener's existing podcast feed token, so one reset changes both feeds. It SHALL be cached and answer conditional
requests as the audio feed does, and a publish, a removal, or a finished film SHALL clear both caches.

#### Scenario: One token, two feeds

- **GIVEN** a subscriber of an invite Topic who resets their feed link
- **WHEN** a podcast app fetches the old film feed url
- **THEN** the request is refused, and the new token reaches both feeds

#### Scenario: A finished film updates the feed

- **WHEN** a Podcast Episode's film finishes rendering
- **THEN** the next fetch of the film feed includes its item

### Requirement: The Subscribe dialog offers Films

On a Topic with a film, the podcast feed dialog SHALL offer a Films option beside the podcast feed, and every link it
offers, the app link and Copy feed link, SHALL then use the film feed's url. A Topic with no film SHALL show no Films
option.

#### Scenario: Films switches the links

- **WHEN** a listener on an iPhone chooses Films in the dialog
- **THEN** the `podcast://` link and the copied link both name the film feed

#### Scenario: No film, no option

- **WHEN** a listener opens the dialog on a Topic with no film
- **THEN** the dialog offers only the podcast feed
