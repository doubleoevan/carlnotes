# Spec Delta

## MODIFIED Requirements

### Requirement: A shared image is screened before it posts and its description before Carl reads it

An image shared to a room SHALL be moderated as an image before anything stores, on the terms in `content-moderation`,
and a flagged image SHALL reject the whole post with Carl's rejection naming its category. The description generated
for a shared image SHALL be stored as written, with no screen of its own, and SHALL reach every room turn as data
inside the nonce fence. A room turn SHALL NOT read a failed image row, neither its description nor its bytes. With no
moderation key set, a shared image SHALL post with no moderation call and no wait.

#### Scenario: A flagged shared image rejects the post

- **WHEN** a member shares an image the moderation flags as sexual
- **THEN** the post is rejected with Carl's rejection naming sexual, and nothing is stored

#### Scenario: A flagged description never turns ready

- **WHEN** a shared image's description fails to generate
- **THEN** the row is marked failed, and no room turn reads its description or its bytes

#### Scenario: An image holding an instruction posts

- **WHEN** a member shares a clean image whose text tells Carl to ignore the room
- **THEN** the image posts, and its description reaches the next room turn inside the fence as data
