## ADDED Requirements

### Requirement: A chat image is screened by the text it shows

If the scanner is configured, every image a private chat turn includes SHALL have its visible text read with text recognition and
screened as a document before the turn reaches the model. An image whose text is flagged SHALL be withheld from the
turn and replaced by the same withheld line a flagged text attachment gets, naming the detectors that fired. A
withheld image SHALL NOT be stored, described, or kept, whatever the user chose. A kept image's description SHALL be
screened as a document before its row is stored, and a flagged description SHALL leave no row and no object. An image
with no readable text SHALL pass. A failed text read SHALL fail open, like a failed screen, and SHALL be reported. With
`LLM_GUARD_URL` unset, the image path SHALL load no text recognition code, make no call, cost nothing, and add no wait.

#### Scenario: A flagged image never reaches the model

- **WHEN** a user sends an image whose text tells Carl to make the topic public
- **THEN** the scanner flags its text, the model receives the withheld line in its place, and the image is not stored

#### Scenario: A benign screenshot passes

- **WHEN** a user sends a screenshot of an article that discusses prompt injection
- **THEN** the image reaches the model as an image part, as it did before

#### Scenario: An unset scanner url skips the image path entirely

- **WHEN** `LLM_GUARD_URL` is unset and a user sends an image
- **THEN** no text recognition runs, no scanner call is made, and the image reaches the model unchanged

#### Scenario: A flagged kept-image description is not stored

- **WHEN** a kept image passes its text screen and its generated description is flagged
- **THEN** no chat attachment row or stored object remains for it

### Requirement: The local stack keeps the scanner running, and production runs without it

The local compose stack SHALL run the scanner container with a restart policy, so a container the host kills comes
back without a hand restart. The dev startup script SHALL start it with the rest of the dev infrastructure and SHALL
NOT wait for its model download, since every caller fails open while it loads. The production deployment SHALL keep
`LLM_GUARD_URL` unset, and every screen SHALL keep returning skipped there with no network call.

#### Scenario: A killed scanner comes back

- **WHEN** the local scanner container is killed for memory
- **THEN** it restarts on its own, and screens pass unscreened only until it answers again

#### Scenario: Startup does not wait for the scanner

- **WHEN** a developer runs the dev startup script with the scanner still downloading its models
- **THEN** the script finishes without waiting, and the scanner answers once its models load
