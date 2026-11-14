## ADDED Requirements

### Requirement: An unchecked film image stores its file and rebuilds nothing until it passes

A film image upload that is saved as unchecked, because its image moderation could not run on an invite or public Topic,
SHALL store its file alone: the film's poster, intro, and sign-off SHALL stay as they were for everyone else, and no
rebuild SHALL start. Once the sweep's check passes, the upload SHALL become the film's image and SHALL start the rebuild
an upload starts. An unchecked upload the check rejects SHALL be deleted, and no rebuild SHALL start for it.

#### Scenario: An unchecked film image starts no rebuild

- **WHEN** an editor uploads a film's image on a public Topic and the image moderation times out
- **THEN** the upload is saved as unchecked, the poster and the playing film are unchanged, and no rebuild starts

#### Scenario: The uploader sees the unchecked film image

- **WHEN** that editor opens the film's image editor
- **THEN** it shows the unchecked upload with "Only you can see this image until Carl finishes checking it."

#### Scenario: A passed check rebuilds the intro and the sign-off

- **GIVEN** an unchecked film image
- **WHEN** a sweep's check finds it clean
- **THEN** the poster shows the upload, the intro and the sign-off render again from it, and the chapters part is
  reused unchanged

#### Scenario: A rejected unchecked film image leaves the film alone

- **WHEN** a sweep's check flags an unchecked film image
- **THEN** the unchecked file is deleted, and the film keeps its poster, intro, and sign-off

### Requirement: A flagged film image that was published unchecked is removed with no new image

If the sweep's check flags a film image that was published unchecked on a private Topic and is still the film's
image, the upload SHALL be removed and no image SHALL be drawn in its place: the poster SHALL show the Podcast
Episode's image, and the film's next play SHALL start the rebuild of its intro and sign-off from that image.

#### Scenario: A flagged private film image is removed

- **GIVEN** a private Topic's film whose uploaded image was published with its check still to run
- **WHEN** a later sweep's check flags the image
- **THEN** the film's image is removed, its poster shows the Podcast Episode's image, and no image render starts

#### Scenario: The film's next play rebuilds its intro and sign-off

- **GIVEN** that film
- **WHEN** the film is played next
- **THEN** a rebuild of the intro and the sign-off starts from the Podcast Episode's image

### Requirement: A film stops showing an unchecked image once its Topic turns invite or public

If a private Topic turns invite or public while a film's uploaded image is published with its check still to run,
the image SHALL go back to its uploader alone, the poster SHALL show the Podcast Episode's image, and the rebuild of
the film's intro and sign-off SHALL start at once. The same rebuild SHALL start for each film that shows a Podcast
Episode's image or a Topic's image that went back to its uploader in that change.

#### Scenario: A film's own unchecked image leaves the film

- **GIVEN** a private Topic's film whose uploaded image was published with its check still to run
- **WHEN** the Topic turns public
- **THEN** the poster shows the Podcast Episode's image for everyone but the uploader, and one rebuild of the intro
  and the sign-off starts

#### Scenario: A film that shows the Topic's unchecked image is rebuilt

- **GIVEN** a private Topic with an unchecked image, and a film with no image of its own or of its Podcast Episode
- **WHEN** the Topic turns public
- **THEN** the film's rebuild starts, and its intro and sign-off stop showing the Topic's unchecked image

#### Scenario: The film's image comes back once its check passes

- **GIVEN** a film image that went back to its uploader
- **WHEN** a sweep's check finds it clean
- **THEN** the upload becomes the film's image again, and the intro and the sign-off rebuild from it
