# Spec Delta

## ADDED Requirements

### Requirement: A Comment reaches a model only as fenced data

Wherever a model reads a Comment's body, in a prompt or in a tool result, the text SHALL be wrapped in
untrusted-data delimiters with a nonce created for that call, and any delimiter pattern in the text itself SHALL be
removed first.

#### Scenario: A thread read through MCP is fenced

- **WHEN** a client reads a comment thread through the MCP server
- **THEN** every Comment's body is inside untrusted-data delimiters with that call's nonce, in the text result and in
  the structured content

#### Scenario: A forged delimiter is removed

- **WHEN** a Comment's body holds text shaped like a closing untrusted-data tag
- **THEN** the fenced result holds the body without that tag, and the fence closes once

### Requirement: Only a shared Comment reaches a CarlNotes model

The relevance scoring prompt SHALL hold only the Topic's five most recently shared Comments, as a labeled section
of the Topic context inside that call's untrusted-data delimiters. The podcast script prompts SHALL hold only the
shared Comments their Podcast Episode read. Besides the classification before a Comment posts, no other CarlNotes prompt
SHALL hold a Comment, and an unshared Comment SHALL reach scoring as a number only.

#### Scenario: An unshared Comment is absent from the scoring prompt

- **WHEN** a Scan scores a public Topic whose Finding holds a stranger's unshared Comment
- **THEN** the scoring prompt holds none of that text

#### Scenario: A shared Comment is fenced with the Topic context

- **WHEN** a Scan scores a Topic with two shared Comments
- **THEN** the scoring prompt holds both as `- username: text` lines after the example pages, inside the Topic
  context's untrusted-data delimiters

#### Scenario: The sixth most recent share is left out

- **WHEN** a Topic holds six shared Comments
- **THEN** the scoring prompt holds the five shared most recently

#### Scenario: The topic chat reads no Comment

- **WHEN** a user asks Carl about a Topic that has shared Comments
- **THEN** the chat's prompt holds no Comment

### Requirement: A left-out shared Comment reaches no CarlNotes model

A shared Comment SHALL reach no CarlNotes model while its Finding is rated thumbs down, or while its author is under
an admin block or in a block with the Topic's owner.

#### Scenario: A left-out shared Comment is absent from the scoring prompt

- **WHEN** a shared Comment's Finding is rated thumbs down, or its author is under an admin block or in a block with
  the Topic's owner
- **THEN** the scoring prompt holds none of its text until that changes

### Requirement: A stored Comment holds no markup or control character

A Comment's body SHALL be stored as plain text. A write SHALL reject a control character other than a line break,
and SHALL remove markup and untrusted-data delimiter patterns before storing. Both apps SHALL render the stored text
as text, with a link only on a stored mention.

#### Scenario: A control character is rejected

- **WHEN** a Comment's body holds a null character
- **THEN** the post is rejected as a validation error

#### Scenario: Markup is removed and a url stays text

- **WHEN** a user posts a Comment holding an html tag and a url
- **THEN** the stored body holds neither the tag's markup nor a link, and the thread shows the url as plain text
