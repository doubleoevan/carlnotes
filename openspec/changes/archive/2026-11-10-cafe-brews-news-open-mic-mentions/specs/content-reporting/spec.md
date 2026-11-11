# Spec Delta

## ADDED Requirements

### Requirement: A Topic Post's image is a report subject

`topicPostImage` SHALL be a report subject kind. A signed-in user who may open a Topic Post SHALL be able to report
its image from the Topic Post page's report menu, with the Topic Post's title as the subject text and the Topic Post's
page as the subject path. The Reports view SHALL show the image on such a report and offer Regenerate beside Clear and
Block, and Regenerate SHALL resolve the report as removed. The report email SHALL keep its one button into the
console.

#### Scenario: A user reports a Topic Post's image

- **WHEN** a user picks Report image on a Topic Post
- **THEN** a report of kind `topicPostImage` is written and mailed, and the user no longer sees the image until it
  changes

#### Scenario: Regenerate resolves the report

- **WHEN** an admin presses Regenerate on a Topic Post image report
- **THEN** a fresh image renders on the platform's budget, an upload is dropped, and the report reads removed
