## ADDED Requirements

### Requirement: A shared image is screened before it posts and its description before Carl reads it

If the scanner is configured, an image shared to a room SHALL have its visible text read with text recognition and screened as a
document before anything stores, and a flagged image SHALL reject the whole post, the way a flagged shared PDF does.
The description generated for a shared image SHALL be screened as a document before its row turns ready, and a flagged
description SHALL mark the row failed. A room turn SHALL NOT read a failed image row, neither its description nor its
bytes. With `LLM_GUARD_URL` unset, a shared image SHALL post with no text recognition, no scanner call, and no wait.

#### Scenario: A flagged shared image rejects the post

- **WHEN** a member shares an image whose text holds an instruction to Carl
- **THEN** the post is rejected with the same reason a flagged shared file gets, and nothing is stored

#### Scenario: A flagged description never turns ready

- **WHEN** a shared image passes its text screen and its generated description is flagged
- **THEN** the row is marked failed, and no room turn reads its description or its bytes
