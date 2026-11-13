## ADDED Requirements

### Requirement: A Topic Post's body image is a report subject

`topicPostBodyImage` SHALL be a report subject kind. A signed-in user who may read a Topic Post SHALL be able to report
one of its body images from that image's report option, with the post's title as the subject text and the post's page
as the subject path. The reporter SHALL no longer see that image. The Reports view SHALL show the image and offer
Remove beside Clear and Block.

#### Scenario: A user reports a body image

- **WHEN** a user picks Report image on an image in a Topic Post's body
- **THEN** a report of kind `topicPostBodyImage` is written and mailed, and the user no longer sees that image

#### Scenario: Remove takes the image out of the body

- **WHEN** an admin presses Remove on a body image report
- **THEN** the image is taken out of the post's body, its files are queued for deletion, and the report resolves as
  removed

#### Scenario: An image already gone leaves nothing to remove

- **WHEN** an admin presses Remove on a body image report whose image or post was already deleted
- **THEN** nothing else changes, and the report resolves as removed
