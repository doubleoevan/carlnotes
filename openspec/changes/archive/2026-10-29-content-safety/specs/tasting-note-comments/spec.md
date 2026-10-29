# Spec Delta

## MODIFIED Requirements

### Requirement: Comment routes enforce permissions and validate bodies

The comment list SHALL take view access, a post SHALL take edit access through the same check as writing the body,
and a delete SHALL be the comment's author's or an admin's. Every rejection SHALL be a 404, as on the other note
routes. A post SHALL validate its body with the zod payload from the shared contracts, attached with the validator the
other api routes use, before any query; a body that fails validation SHALL respond 400 and store nothing. A list
SHALL leave out the comments of people the reader has blocked and the comments the reader has reported.

#### Scenario: A comment from a user without edit access is rejected

- **WHEN** someone without edit access on the note posts a comment
- **THEN** the server answers 404 and no comment is stored

#### Scenario: A team member comments on the team note

- **WHEN** a member of a team holding the page posts a comment on the team note
- **THEN** the comment is accepted and stored

#### Scenario: Only the author deletes a comment

- **WHEN** a user who did not write a comment and is not an admin tries to delete it
- **THEN** the server answers 404 and the comment stays, while the author's own delete removes it, and an admin's
  delete removes it when resolving a report

#### Scenario: A body of the wrong shape is a 400

- **WHEN** a post arrives with a body that is not an object, an empty text, or a text past the limit
- **THEN** the route responds 400 before any query, and nothing is stored

#### Scenario: A blocked person's comment is left out of the list

- **WHEN** a reader who blocked a comment's author loads the thread
- **THEN** the list omits that comment, and the author's own load still includes it
