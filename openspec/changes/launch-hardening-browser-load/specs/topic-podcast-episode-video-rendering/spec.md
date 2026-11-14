## ADDED Requirements

### Requirement: A film's image is stored in page, list, and thumbnail sizes

Every write that sets a film's own image, its first draw, a regeneration, and an upload, SHALL also derive the
`page`, `list`, and `thumbnail` sizes from it at 16:9, each at 1x and 2x: 384 by 216, 120 by 68, and 48 by 27 at 1x.
The six files SHALL be stored in the film's folder under the image's content hash, served at that hash to whoever may
see the film's Topic, replaced with the image, and deleted with it. The 1280 by 720 copy SHALL stay.

#### Scenario: A new film image stores its sizes

- **WHEN** a film's own image is drawn, regenerated, or uploaded
- **THEN** object storage holds its original, its 1280 by 720 copy, and six sized files under the image's content hash

#### Scenario: The sizes keep the film's shape

- **WHEN** a film image's sizes are derived
- **THEN** `page` is 384 by 216 and 768 by 432, `list` is 120 by 68 and 240 by 136, and `thumbnail` is 48 by 27 and
  96 by 54, and none is drawn at the Topic image's 3:2

#### Scenario: A replaced image's sizes go with it

- **WHEN** an editor uploads a new image for a film
- **THEN** the new image's sizes are stored with it, and the replaced image's sized files are deleted after the same
  grace as its 1280 by 720 copy

#### Scenario: A removed film's sizes are deleted

- **WHEN** a Topic's owner removes a Podcast Episode that has a film
- **THEN** the film image's sized files are deleted with the film's own image, and their urls no longer serve

#### Scenario: A released app keeps the poster

- **WHEN** a mobile build released before the sizes requests a film's poster
- **THEN** the 1280 by 720 copy is served at the same url as before

### Requirement: A missing size serves the 1280 by 720 copy under a short cache

A request for a size of a film's current image whose file is not stored SHALL be served the image's 1280 by 720 copy
with a short cache lifetime, never an immutable one, so a film that has not been backfilled still shows its image and
loads the sized file once it is stored. A stored size SHALL be served with the headers the poster has.

#### Scenario: A film not yet backfilled falls back to the poster

- **GIVEN** a film whose own image was stored before the sizes shipped
- **WHEN** a card requests that image's `page` size
- **THEN** the 1280 by 720 copy is served with a short cache lifetime, and the same url serves the `page` file once
  the backfill has stored it

#### Scenario: A stored size is served as the poster is

- **WHEN** a request names a stored size at the film's current image hash
- **THEN** the file is served with the immutable headers the poster has for that Topic's visibility

#### Scenario: A stale hash is not found

- **WHEN** a request names a size at a hash that is not the film's current image hash
- **THEN** the response is not found

### Requirement: A backfill derives the sizes of every film that has its own image

A one-off backfill SHALL derive the three sizes for every film that has an image of its own, from the film's stored
image. It SHALL call no model, render no film, and leave every film's render version as it is. It SHALL skip a film
with no image of its own, and running it again SHALL leave a film that already has its sizes as it is.

#### Scenario: An existing film gets its sizes

- **GIVEN** a film whose own image was stored before the sizes shipped
- **WHEN** the backfill runs
- **THEN** the film image's six sized files are stored under its content hash, and its cards load the `page` size

#### Scenario: No film is rendered again

- **WHEN** the backfill runs
- **THEN** no film's render version changes, no re-render starts, and no image model is called

#### Scenario: A film without its own image is skipped

- **WHEN** the backfill reaches a film that shows its Podcast Episode's image
- **THEN** it stores nothing for that film

## MODIFIED Requirements

### Requirement: Each film gets its own cinematic image

The first time a film renders, before its intro and sign-off, the worker SHALL draw the film's own image: 16:9 at 2752
by 1536, full frame with no paper edge or border, in film lighting and the app's palette, painted to every edge with no
dark band along the bottom. The lower third's espresso plate SHALL keep the title readable over any image. The topic
image's scene writer SHALL write its scene, and an image model that draws at that size SHALL draw it from a film house
style prompt. It SHALL be stored under the film's folder as that original and as a 1280 by 720 copy, which the poster
shows, and in the `page`, `list`, and `thumbnail` sizes, which a smaller frame loads in its place. Its cost SHALL add
to the film's cost.

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

### Requirement: An editor regenerates or uploads a film's image

A user who may edit a Podcast Episode's image, and an admin, SHALL be able to regenerate its film's image from an
optional image prompt, and to upload a jpeg, png, or webp up to the image upload limit, center-cropped to 16:9 at the
film's frame size, with the origin `uploaded`. A regeneration SHALL count against the user's monthly image regeneration
limit, the one the Topic, Podcast Episode, and Topic Post images share. An upload SHALL NOT count.

#### Scenario: A regeneration counts against the shared limit

- **GIVEN** an editor on a plan of 15 regenerations who has used 14 on Topic images
- **WHEN** they regenerate a film's image
- **THEN** the render starts, the count reads 15 of 15, and a further regeneration of any image is rejected

#### Scenario: An upload is cropped to the frame

- **WHEN** an editor uploads a tall PNG as a film's image
- **THEN** its center is stored at 1280 by 720 with the origin `uploaded`, its three sizes are derived from it, and the
  month's count does not change

#### Scenario: Someone who may not edit is turned away

- **WHEN** a follower who may not edit the Topic sends a regeneration or an upload for one of its films
- **THEN** the api responds 404, and nothing is drawn or stored

#### Scenario: A Podcast Episode with no film has no film image

- **WHEN** an editor sends a regeneration for a Podcast Episode whose film is not ready
- **THEN** the api responds 404
