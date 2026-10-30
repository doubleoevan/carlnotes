# Spec Delta

## MODIFIED Requirements

### Requirement: User text that others read is classified before it posts

A chat room message, a note's name and body, a note comment, a username, a Team's name and description, and an
invite or public Topic's name, prompt, and tags SHALL be classified before they are stored, by a verdict that names
whether the text is a violation and which category: harassment, hate, sexual, violence, self-harm, or child safety. A
private Topic's name, prompt, and tags SHALL be classified when the Topic becomes invite or public.

#### Scenario: A clean post is stored

- **WHEN** a user posts a room message the classification finds clean
- **THEN** the message is stored and delivered as before, with one classification call made

#### Scenario: A topic going public is checked then

- **WHEN** an owner changes a private Topic with an objectionable prompt to public
- **THEN** the visibility change is rejected in Carl's voice and the Topic stays private

#### Scenario: A username is checked at save

- **WHEN** a user saves a username the classification rejects
- **THEN** the username form shows the rejection and the previous username stays

#### Scenario: A public topic's tags are checked with its name and prompt

- **WHEN** an owner saves a public Topic whose tags hold a slur
- **THEN** the save is rejected in Carl's voice naming hate, and the Topic is not saved

## ADDED Requirements

### Requirement: An image others see is moderated before it posts

An uploaded avatar and an image shared to a team room SHALL be moderated as an image before anything is stored. A
flagged image SHALL get the same 422 in Carl's voice that violating text gets, naming one of the six categories, and
nothing SHALL be stored. The check SHALL read only the image, SHALL cost the user nothing, and SHALL bill no budget.

#### Scenario: A flagged avatar is rejected

- **WHEN** a user uploads an avatar the moderation flags as sexual
- **THEN** the upload is rejected with Carl's rejection naming sexual, and the previous avatar stays

#### Scenario: A flagged room image rejects the post

- **WHEN** a member shares an image to a room that the moderation flags as graphic violence
- **THEN** the post is rejected with Carl's rejection naming violence, the composer keeps the draft, and nothing is
  stored

#### Scenario: A clean image posts

- **WHEN** a member shares a photo the moderation finds clean
- **THEN** the image is stored and posts as before

### Requirement: An unanswered image moderation lets the image through and reports itself

If the moderation key is unset, or the call is unreachable, times out, is rate limited, errors on the service's side,
or returns a response outside its schema, the image SHALL be treated as clean and stored. A rejection of the image
itself SHALL reject the upload instead. A failure SHALL be logged and reported with the subject kind
and id, never the image. An unset key SHALL NOT be reported per call.

#### Scenario: A timed-out moderation posts the image

- **WHEN** the image moderation exceeds its timeout on an avatar upload
- **THEN** the avatar is stored, and the failure is reported naming the avatar subject without the image

#### Scenario: An image the moderation cannot read is not posted

- **WHEN** the moderation rejects an image itself, as it does a format it does not take
- **THEN** the upload or post is rejected as an unreadable file, nothing is stored, and the image never posts unchecked

#### Scenario: Development runs without the key

- **WHEN** the moderation key is unset in a development stack
- **THEN** every image posts unmoderated, and nothing is reported per image
