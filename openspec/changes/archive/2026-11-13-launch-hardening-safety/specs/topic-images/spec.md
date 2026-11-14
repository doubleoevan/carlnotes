## RENAMED Requirements

- FROM: `### Requirement: An upload passes the image moderation before it is stored`
- TO: `### Requirement: An upload goes through the image moderation before it is stored`

## MODIFIED Requirements

### Requirement: An image url is immutable and gated by the Topic's visibility

Each derived file SHALL be served at a url naming the Topic, the content hash, the size, and the density. A public
Topic's image SHALL be served to anyone with immutable edge headers and a cache tag naming the Topic. A non-public
Topic's image SHALL be served only to a session that may view the Topic, with private immutable headers, and never from
the edge. A Topic that stops being public SHALL purge its tag. An unchecked upload's files SHALL be served only to its
uploader's session, with the private headers, and never from the edge, whatever the Topic's visibility.

#### Scenario: A visitor reads a public image

- **WHEN** a visitor requests a public Topic's `list` file
- **THEN** it is served with immutable public headers and the edge may cache it

#### Scenario: A visitor is refused a private image

- **WHEN** a request with no session asks for a private Topic's image
- **THEN** the response is not found and no bytes are served

#### Scenario: A stale hash is not found

- **WHEN** a request names a hash that is neither the Topic's current one nor an unchecked one shown to the requester
- **THEN** the response is not found

#### Scenario: An unchecked file is served to its uploader alone

- **GIVEN** a public Topic with an image upload that is unchecked
- **WHEN** the uploader's session, another user's session, and a visitor each request the unchecked hash's `page` file
- **THEN** the uploader gets the file with private headers, and the other two get not found

### Requirement: An upload goes through the image moderation before it is stored

The cropped original of every upload SHALL go through the image moderation before anything is stored. A flagged upload
SHALL be rejected with its category, and an image the moderation cannot read SHALL be rejected as an unsupported type.
An upload whose check could not run SHALL be stored: on an invite or public Topic it SHALL be saved as unchecked on the
terms in `content-moderation`, so the Topic's image stays as it was for everyone but the uploader until the check
passes, and on a private Topic it SHALL become the Topic's image at once and be checked again by the sweep. A Podcast
Episode's image upload SHALL follow the same rule by its Topic's visibility.

#### Scenario: A flagged upload is rejected

- **WHEN** an owner uploads a photo the image moderation flags as sexual
- **THEN** the upload is rejected with that category, nothing is stored, and the image is unchanged

#### Scenario: An upload whose check could not run is saved as unchecked on a public Topic

- **WHEN** an owner uploads a photo to a public Topic and the image moderation times out
- **THEN** the upload's original and six files are saved as unchecked, the owner sees the upload in the image editor
  with its note, and every other user and visitor sees the image the Topic had before

#### Scenario: An unchecked upload becomes the image once its check passes

- **GIVEN** a public Topic with an unchecked upload
- **WHEN** a sweep's check finds it clean
- **THEN** the upload replaces the Topic's image as an upload that passed does, and the previous image's objects are
  scheduled for deletion

#### Scenario: A private Topic's upload is published at once

- **WHEN** an owner uploads a photo to a private Topic and the image moderation times out
- **THEN** the upload is the Topic's image at once, and a later sweep checks it again

#### Scenario: An unchecked Podcast Episode image leaves its cards alone

- **WHEN** an editor's upload in Edit podcast image is saved as unchecked on a public Topic
- **THEN** the editor sees the upload with its note, and the Podcast Episode's page, cards, and cover show the image
  they showed before for everyone else

## ADDED Requirements

### Requirement: An image box with no file shows a coffee mug

An image box with no file, a Topic's, a Podcast Episode's, or a Topic Post's, at every size, SHALL show a coffee mug
centered on the muted background, in a muted color and faint: at 60% of the box's height at the page size, 80% at
the list size, and the whole height at the thumbnail size. The box SHALL still pulse as it did when empty. A user
who is not the uploader SHALL see it in place of an unchecked image.

#### Scenario: A page-size box with no file shows the mug

- **WHEN** a Topic with no image shows its header image box at the page size
- **THEN** the box shows a faint coffee mug in a muted color, centered on the muted background, at 60% of the box's
  height, and the box pulses

#### Scenario: The mug fills more of a smaller box

- **WHEN** a Podcast Episode with no image shows its box at the list size, and a Topic Post at the thumbnail size
- **THEN** the mug is 80% of the list box's height and the whole height of the thumbnail box

#### Scenario: Another user sees the mug in place of an unchecked image

- **GIVEN** a Topic made public whose uploaded image went back to its uploader until its check runs
- **WHEN** another user and a visitor open the Topic
- **THEN** each sees the coffee mug in the Topic's image box, and the uploader sees the image with its note

#### Scenario: A regenerate leaves a private Topic's unchecked image to the sweep

- **GIVEN** a private Topic whose image is an upload that the sweep has not checked yet
- **WHEN** an editor regenerates its image
- **THEN** the render starts, and the unchecked upload stays recorded for the sweep until the render replaces it
