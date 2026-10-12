## ADDED Requirements

### Requirement: A signed-out chat post is rejected before its body is read

A post to a topic chat, a team chat, or the new-topic chat by a request with no session SHALL get a 401 with "sign up
required" before its body is read, and a post to a chat room by such a request SHALL get a 404, as a missing chat room
is, before its body is read, so an anonymous request never holds a chat body's attachments in memory. A signed-in post
SHALL then pass the route's own body limit and its authorization.

#### Scenario: An anonymous post with large attachments

- **WHEN** a signed-out caller posts a chat turn with two megabytes of attachments
- **THEN** it gets a 401 at once, and its body is never read

#### Scenario: An anonymous chat room post

- **WHEN** a signed-out caller posts a chat room message with two megabytes of attachments
- **THEN** it gets a 404 at once, as a missing chat room is, and its body is never read
