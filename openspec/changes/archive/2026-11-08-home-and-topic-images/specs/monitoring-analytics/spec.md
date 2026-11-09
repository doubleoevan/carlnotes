# Spec Delta

## ADDED Requirements

### Requirement: Topic image and home events hold ids only

A create render, a Regenerate, an upload, and a removal SHALL each send one PostHog event, `topic_image_generate`,
`topic_image_regenerate`, `topic_image_upload`, and `topic_image_remove`, with the Topic id, the render kind where there
is one, and whether the actor owns the Topic, and never the scene, the image prompt, or a username. The browser SHALL
send `home_view` with the face and `featured_card_open` with the card's kind and id. With no PostHog key set, nothing
SHALL be sent.

#### Scenario: A regeneration sends one event

- **WHEN** an owner regenerates with an image prompt
- **THEN** one `topic_image_regenerate` event is sent with the Topic id and the owner flag true, and no image prompt
