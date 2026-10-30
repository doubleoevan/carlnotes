# content-moderation Specification

## Purpose
Every piece of user text that another user can read is classified before it posts, a confirmed violation is rejected
in Carl's voice with the draft kept, and a classification that cannot answer lets the post through and reports itself.

## Requirements

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

### Requirement: A violation is rejected in Carl's voice and the draft is kept

A confirmed violation SHALL be rejected with a 422 naming the category, and both apps SHALL show the rejection in
Carl's voice next to the composer, with the draft text left in place for editing. The rejection copy SHALL be shared
by both apps and SHALL not quote the user's text back.

#### Scenario: A rejected message stays in the composer

- **WHEN** a room message is rejected as harassment
- **THEN** the composer keeps the text, shows Carl's rejection naming harassment, and nothing is stored or streamed

#### Scenario: A rejected comment keeps its thread open

- **WHEN** a note comment is rejected
- **THEN** the thread stays open with the draft in its box and the rejection under it

### Requirement: An unanswered classification lets the post through and reports itself

If the classification route is unset, unreachable, times out, errors, or returns a verdict outside the schema, the
text SHALL be treated as clean and stored, and the failure SHALL be logged and reported with the subject kind and id
and never the text. An unset route SHALL NOT be reported per call.

#### Scenario: A timed-out classification posts the text

- **WHEN** the classification exceeds its timeout on a room message
- **THEN** the message is stored, and the failure is reported naming the subject kind and the room without the text,
  since the check runs before the message has an id

#### Scenario: A verdict outside the schema posts the text

- **WHEN** the model returns a verdict the schema does not accept
- **THEN** the text is stored and the failure is reported

#### Scenario: Development runs without the route

- **WHEN** the classification route is unset in a development stack
- **THEN** every post is stored unclassified and no per-post report is sent

### Requirement: Classification is bounded in time and in spend

A classification SHALL finish inside a fixed timeout shorter than the posting request's own, SHALL send only the
text under review with no retrieval or history, SHALL be bounded per account by the rate limit of the posting route
it runs in, SHALL be billed to the operator's key and never the user's budget, and SHALL record no input or output
text in its trace.

#### Scenario: A long note body is classified once

- **WHEN** a note body at its size limit is saved
- **THEN** one classification runs over the body's text, with the html's markup stripped, inside the timeout

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
