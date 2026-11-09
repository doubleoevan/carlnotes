# Spec Delta

## ADDED Requirements

### Requirement: Topic image responses and the home page carry cache tags

A public Topic's image file SHALL be sent with the immutable headers a card route sends and `Cache-Tag:
topic-image:<topicId>`, and a non-public Topic's with `private, max-age=31536000, immutable`. The home page's
rendered response SHALL carry the `home` tag beside `rendered`. A Topic leaving the public set SHALL purge its image
tag, and a feature order change SHALL purge `home`.

#### Scenario: A public image is immutable at the edge

- **WHEN** a public Topic's `page@2x` file is requested twice
- **THEN** the second response is an edge hit

#### Scenario: A Topic turning private leaves the edge

- **WHEN** an owner makes a public Topic private
- **THEN** its image tag is purged and the next request for its file without a session is not found
