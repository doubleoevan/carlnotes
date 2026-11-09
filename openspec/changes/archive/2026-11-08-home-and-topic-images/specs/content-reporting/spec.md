# Spec Delta

## ADDED Requirements

### Requirement: A Topic's image is a report subject

`topicImage` SHALL be a report subject kind. A signed-in user who can see a Topic SHALL be able to report its image
from the topic page's report menu, with the Topic's name as the subject text and the Topic's page as the subject path.
The Reports view SHALL show the image on such a report and offer Regenerate beside Clear and Block, and Regenerate
SHALL resolve the report as removed. The report email SHALL keep its one button into the console.

#### Scenario: A user reports an image

- **WHEN** a user picks Report image on a Topic
- **THEN** a report of kind `topicImage` is written and mailed, and the user no longer sees the image until it changes

#### Scenario: Regenerate resolves the report

- **WHEN** an admin presses Regenerate on an image report
- **THEN** a fresh image renders, an upload is dropped, and the report reads removed
