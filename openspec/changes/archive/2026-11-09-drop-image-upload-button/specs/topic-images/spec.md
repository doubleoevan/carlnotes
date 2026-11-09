## MODIFIED Requirements

### Requirement: An editor edits a Topic's image from the Topic page

For a user the edit gate grants `topic:edit` on a Topic, the Topic page's image SHALL show the camera overlay on hover
or keyboard focus, and a click SHALL open the Edit topic image dialog with the topic image editor. Its changes SHALL
save on their own, and the page SHALL show the new image after each change. Any other user SHALL see the image alone.

#### Scenario: An editor opens the image dialog

- **WHEN** a Topic's editor hovers the Topic page's image and clicks it
- **THEN** the Edit topic image dialog opens with the image, which uploads on a click, Regenerate, and the month's
  regeneration count

#### Scenario: A follower sees no camera

- **WHEN** a follower who may not edit the Topic hovers its image
- **THEN** no camera shows and a click opens nothing
