## MODIFIED Requirements

### Requirement: The same people upload their own image over a Topic Post's

Whoever may regenerate a Topic Post's image SHALL be able to upload their own over it. The upload SHALL go through the
upload path a Topic's and a Podcast Episode's image use, so it SHALL pass the same size, type, and image moderation
checks and SHALL be stored at the same sizes. A rejected upload SHALL leave the image unchanged. An upload SHALL count
toward no limit, and SHALL replace the generated image until someone regenerates. An upload whose image moderation could
not run SHALL be saved as unchecked or published by its Topic's visibility, as a Topic's image upload is.

#### Scenario: An author uploads over the generated image

- **WHEN** an author uploads a png over their published Topic Post's generated image
- **THEN** the upload passes the Topic image checks, is cropped, and becomes the post's image

#### Scenario: A file of the wrong type or size is rejected

- **WHEN** an author uploads a gif, or a jpeg over the Topic image upload size
- **THEN** the upload is rejected with the reason a Topic image upload gives, and the post's image is unchanged

#### Scenario: An objectionable upload is rejected

- **WHEN** the image moderation finds an uploaded image objectionable
- **THEN** the upload is rejected as a Topic image upload is, and the post's image is unchanged

#### Scenario: An upload whose check could not run is saved as unchecked on a public Topic

- **WHEN** an author uploads an image over their Topic Post on a public Topic and the image moderation times out
- **THEN** the author sees the upload in the image editor and on the Topic Post's page with its note, and the card,
  the page, and the share image keep the old image for everyone else until the check passes

## ADDED Requirements

### Requirement: A Topic Post's unchecked image follows its Topic's visibility

An upload over a Topic Post's image whose image moderation could not run SHALL be published at once on a private
Topic and recorded for the sweep. If that Topic turns invite or public before the sweep checks the image, the image
SHALL go back to its uploader alone, the post SHALL show no image to everyone else, and the change of visibility
SHALL be saved all the same.

#### Scenario: A private Topic's upload is published by the visibility of the post's Topic

- **WHEN** an author uploads an image over their Topic Post on a private Topic and the image moderation times out
- **THEN** the upload is the post's image at once, and the sweep checks it again

#### Scenario: The unchecked image goes back if the Topic turns public

- **GIVEN** that Topic Post, whose image the sweep has not checked yet
- **WHEN** the Topic's owner makes the Topic public
- **THEN** the author sees the image on the post with its note, and everyone else sees the post with no image
