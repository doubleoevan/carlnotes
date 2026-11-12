## MODIFIED Requirements

### Requirement: The intro and the sign-off show the film's image

The film's intro SHALL run from its start to the first chapter's start. It SHALL open on the film's own image, or the
image that the Podcast Episode shows if the film has none, cut through the first image of each chapter in chapter
order, each image once, and return to the film's image for its last shot if it has three shots or more. The sign-off
SHALL run from the last chapter's end to the film's end, cut through the same chapter images, and end on the film's
image. Their shots SHALL be cut as a chapter's montage is. If fewer than two chapter images remain, the podcast card
SHALL take turns with them, unless the film's image is the podcast card. An intro or a sign-off with no chapter image
SHALL show the film's image in every shot. The intro's lower third SHALL show the Podcast Episode's title and details
line, and the sign-off's SHALL show "Coffee Break podcast with Carl and Vienna" and "Carl and Vienna are AI voices".
Each SHALL fade in and stay until its part ends.

#### Scenario: The intro names the Podcast Episode

- **WHEN** a viewer plays a film from the start
- **THEN** the film's image shows with the Podcast Episode's title, which stays on screen until the first chapter
  starts

#### Scenario: The sign-off says the voices are AI

- **WHEN** the film passes the last chapter's end
- **THEN** "Carl and Vienna are AI voices" shows until the film ends, and the film's image is the last shot

#### Scenario: The intro cuts through the chapters

- **GIVEN** a film of four chapters whose first images are a photo, a chart, the photo again, and a generated image
- **WHEN** its 30-second intro plays
- **THEN** it opens on the film's image, cuts to the photo, the chart, and the generated image in that order, and
  returns to the film's image

#### Scenario: A film with no chapter image stays on its image

- **GIVEN** a film that shows the podcast card as its image, and whose chapters have no image but the podcast card
- **WHEN** its intro plays
- **THEN** every shot shows the podcast card

### Requirement: Each film gets its own cinematic image

The first time a film renders, before its intro and sign-off, the worker SHALL draw the film's own image: 16:9 at 2752
by 1536, full frame with no paper edge or border, in film lighting and the app's palette, painted to every edge with no
dark band along the bottom. The lower third's espresso plate SHALL keep the title readable over any image. The topic
image's scene writer SHALL write its scene, and an image model that draws at that size SHALL draw it from a film house
style prompt. It SHALL be stored under the film's folder as that original and as a 1280 by 720 copy, which the poster
shows. Its cost SHALL add to the film's cost.

#### Scenario: A new film opens on its own image

- **WHEN** a Podcast Episode's film renders for the first time
- **THEN** a wide image is drawn from the Podcast Episode's title, description, and chapter titles, and the intro, the
  sign-off, and the poster show it

#### Scenario: The image fills the frame

- **WHEN** the film's image is drawn
- **THEN** its original is 2752 by 1536, its poster copy is 1280 by 720, neither has a border, and the house style asks
  for a scene painted to the bottom edge with no dark band, curtain, or empty shadow along it

#### Scenario: A second attempt draws no second image

- **GIVEN** a render whose first attempt drew the film's image and then failed
- **WHEN** the render's second attempt runs
- **THEN** it reuses the stored image and makes no image call

#### Scenario: An existing film keeps its image

- **GIVEN** a film whose own image was stored at 1280 by 720 before this size shipped
- **WHEN** the film re-renders
- **THEN** its intro and sign-off show that image, and no image is drawn

### Requirement: A film's image keeps the film frame after an image prompt

A film's image drawn from an editor's image prompt SHALL still be drawn in the film house style: the image prompt is
the scene, and the film house style follows it. The image of a Topic, a Podcast Episode, and a Topic Post is drawn
from an image prompt alone.

#### Scenario: An image prompt still fills the frame

- **WHEN** an editor regenerates a film's image with the image prompt "a foggy morning over a bridge"
- **THEN** the image model is sent that scene followed by the film house style, and the image has no paper edge and no
  dark band along the bottom

### Requirement: An imagined image bills like the film and never blocks it

A draw SHALL bill the Topic owner's key and add its cost to the film's cost, and the backfill's draws SHALL bill the
platform. A draw SHALL NOT check the owner's spend cutoff. If the owner's budget is spent, a draw fails, or a drawn
image does not pass the image moderation, the chapter SHALL go on with the images it has, and the render SHALL go on. A
render that is stopped SHALL start no further draw. A generated image SHALL be stored in the film's folder. A render's
second attempt and a re-render SHALL reuse a stored image drawn in the current film house style, and it SHALL be
deleted with the film. A re-render SHALL draw again the images a chapter has in an older style, and once the film is
saved it SHALL delete them. Until then the api SHALL serve a chapter's image in the older style.

#### Scenario: A draw is billed to the owner

- **WHEN** a film renders for a Topic owner's Podcast Episode and draws two generated images
- **THEN** both draws run on the owner's key, and the film's cost includes both

#### Scenario: A spent budget leaves the podcast card

- **GIVEN** an owner whose model budget is spent
- **WHEN** their Podcast Episode's film renders
- **THEN** each chapter with no Resource Image shows the podcast card and the image the intro shows in turn, and the
  film renders

#### Scenario: A failed draw never fails the film

- **WHEN** the image model rejects one of a chapter's generated images
- **THEN** that chapter shows its other images, the failure is reported, and the film renders

#### Scenario: A second attempt reuses the stored image

- **GIVEN** a render whose first attempt drew and stored a chapter's generated image and then failed
- **WHEN** the render's second attempt runs
- **THEN** it shows the stored image and makes no image call for that chapter

#### Scenario: The backfill bills the platform

- **WHEN** the backfill renders a film with a long chapter that lacks images
- **THEN** the generated images are drawn on the platform's key, and the film's cost does not rise

#### Scenario: An owner past the spend cutoff gets every generated image

- **GIVEN** an owner who passed the podcast episode spend cutoff while their Podcast Episode recorded
- **WHEN** its film renders with chapters that lack images
- **THEN** every generated image the chapters need is drawn on the owner's key, and the film's cost includes them

#### Scenario: A re-render draws again the images of an older style

- **GIVEN** a ready film whose chapter has two generated images drawn in an older film house style
- **WHEN** the film renders again
- **THEN** the chapter's images are drawn again in the current style, and once the film is saved the two older images
  are deleted

### Requirement: The intro zooms in and the sign-off zooms out

The intro's first shot SHALL zoom in on the film's image, and the sign-off's last shot SHALL zoom out from it to the
full frame as the film fades out. Their other shots SHALL move as a chapter's shots do, and no shot SHALL make the move
of the shot before it. The Carl and Vienna podcast card SHALL cover the frame as a 16:9 band of its illustration, with
no blurred fill.

#### Scenario: The film opens moving in and closes moving out

- **WHEN** a film with an intro and a sign-off of 40 seconds each plays from its start to its end
- **THEN** the intro's first shot comes toward the film's image at 8 percent a second
- **AND** the sign-off's last shot pulls back from the film's image to its full frame as it fades out

#### Scenario: A chapter with no image fills the frame

- **WHEN** a chapter's Resource has no image
- **THEN** the chapter's podcast card shots show both hosts' mugs and the microphone across the whole frame

#### Scenario: A short intro is the push alone

- **WHEN** a film's intro runs 5 seconds
- **THEN** it is one shot that zooms in on the film's image at 8 percent a second
