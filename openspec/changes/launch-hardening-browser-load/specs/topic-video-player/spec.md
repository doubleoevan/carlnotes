## ADDED Requirements

### Requirement: A film's image loads at the size its place shows

A film card SHALL load the film image's `page` size, and the Topic roast's Coffee Break film row its `list` size, each
at 1x or 2x as the shared image component picks. The film player's poster SHALL load a size that fills its frame, and
SHALL NOT load the 1280 by 720 copy where a smaller size fills it. A film with no image of its own SHALL keep showing
the podcast episode image.

#### Scenario: A film card loads the page size

- **WHEN** a home film card renders on a 2x display
- **THEN** the browser loads the film image's `page@2x` file, 768 by 432, and not the 1280 by 720 copy

#### Scenario: The Topic roast's film row loads the list size

- **WHEN** the Topic roast shows its Coffee Break film part
- **THEN** the row's poster loads the film image's `list` size

#### Scenario: A phone's film player loads a sized poster

- **WHEN** a phone opens a topic page whose latest Podcast Episode has a ready film
- **THEN** the film player's poster loads the film image's `page` size at the display's density, and not the 1280 by
  720 copy

#### Scenario: A film that is not yet backfilled still shows its image

- **WHEN** a card asks for the `page` size of a film whose sizes are not stored yet
- **THEN** the card shows the film's image, served from its 1280 by 720 copy

#### Scenario: A film without its own image shows the podcast episode image

- **WHEN** a film card renders for a film whose own image was never drawn
- **THEN** it shows the podcast episode image at its `page` size, as before
