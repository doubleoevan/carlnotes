## MODIFIED Requirements

### Requirement: The intro and the sign-off show the film's image

The film's intro SHALL run from its start to the first chapter's start. It SHALL open on the film's own image, or the
image that the Podcast Episode shows if the film has none, cut through the first image of each chapter in chapter
order, each image once, and return to the film's image for its last shot if it has three shots or more. The sign-off
SHALL run from the last chapter's end to the film's end, cut through the same chapter images, and end on the film's
image. Their shots SHALL be cut as a chapter's montage is. If fewer than two chapter images remain, the podcast card
SHALL take turns with them, unless the film's image is the podcast card. An intro or a sign-off with no chapter image
SHALL show the film's image in every shot. The intro's lower third SHALL show the Podcast Episode's title and details
line, and the sign-off's SHALL show "Coffee Break podcast with Carl and Vienna" and "Carl and Vienna are AI hosts".
Each SHALL fade in and stay until its part ends.

#### Scenario: The intro names the Podcast Episode

- **WHEN** a viewer plays a film from the start
- **THEN** the film's image shows with the Podcast Episode's title, which stays on screen until the first chapter
  starts

#### Scenario: The sign-off says the voices are AI

- **WHEN** the film passes the last chapter's end
- **THEN** "Carl and Vienna are AI hosts" shows until the film ends, and the film's image is the last shot

#### Scenario: The intro cuts through the chapters

- **GIVEN** a film of four chapters whose first images are a photo, a chart, the photo again, and a generated image
- **WHEN** its 30-second intro plays
- **THEN** it opens on the film's image, cuts to the photo, the chart, and the generated image in that order, and
  returns to the film's image

#### Scenario: A film with no chapter image stays on its image

- **GIVEN** a film that shows the podcast card as its image, and whose chapters have no image but the podcast card
- **WHEN** its intro plays
- **THEN** every shot shows the podcast card
