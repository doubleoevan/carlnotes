## ADDED Requirements

### Requirement: An editor edits a Topic's image from the Topic page

For a user the edit gate grants `topic:edit` on a Topic, the Topic page's image SHALL show the camera overlay on hover
or keyboard focus, and a click SHALL open the Edit topic image dialog with the topic image editor. Its changes SHALL
save on their own, and the page SHALL show the new image after each change. Any other user SHALL see the image alone.

#### Scenario: An editor opens the image dialog

- **WHEN** a Topic's editor hovers the Topic page's image and clicks it
- **THEN** the Edit topic image dialog opens with Regenerate, Upload, and the month's regeneration count

#### Scenario: A follower sees no camera

- **WHEN** a follower who may not edit the Topic hovers its image
- **THEN** no camera shows and a click opens nothing

### Requirement: An editor edits a Podcast Episode's image

A user the edit gate grants `topic:edit` on a Podcast Episode's Topic SHALL be able to regenerate its image from an
optional image prompt, upload an image, and remove an upload, which starts a fresh render, with the Topic image's
checks. A regeneration and a removal SHALL count toward the user's monthly regeneration limit. The Podcast Episode
page's image SHALL open the topic image editor, titled Edit podcast image, with the camera overlay for that user.

#### Scenario: An editor regenerates a Podcast Episode's image

- **WHEN** a Topic's editor enters an image prompt in Edit podcast image and presses Regenerate
- **THEN** the render draws a new image from the prompt, the page shows it once it lands, and the month's count rises
  by one

#### Scenario: An editor uploads a Podcast Episode's image

- **WHEN** a Topic's editor uploads a PNG in Edit podcast image
- **THEN** the Podcast Episode shows the upload at once and the editor offers Remove

#### Scenario: Someone who may not edit is turned away

- **WHEN** a follower who may not edit the Topic sends a regeneration for one of its Podcast Episodes
- **THEN** the api responds 404 and starts no render
