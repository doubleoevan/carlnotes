# Spec Delta

## ADDED Requirements

### Requirement: Topic results carry the image urls by size

Every Topic in a `list_topics` result and every Topic row in a `search` result SHALL include the Topic's image urls,
absolute, for each size at 1x and 2x, or null for a Topic with no image. A non-public Topic's urls SHALL serve only to a
session that may view it. No new tool SHALL be added for images.

#### Scenario: A listed topic names its image files

- **WHEN** a client lists topics
- **THEN** each Topic with an image includes `page`, `list`, and `thumbnail` urls at both densities

#### Scenario: A topic without an image says so

- **WHEN** a client lists a Topic whose render has not finished
- **THEN** its image field is null
