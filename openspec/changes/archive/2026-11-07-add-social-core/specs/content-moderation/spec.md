# Spec Delta

## ADDED Requirements

### Requirement: A Comment is classified before it posts

A Comment's body SHALL be classified before it is stored, on a post, a reply, and an edit, by the verdict and
categories every other classified text uses. A confirmed violation SHALL be rejected with the same 422 and the same
rejection beside the composer, with the draft kept. An unanswered classification SHALL let the text through and
report itself as it does for a note comment. A Reaction SHALL make no classification call, and neither SHALL an edit
that changes nothing.

#### Scenario: A clean Comment is stored

- **WHEN** a user posts a Comment the classification finds clean
- **THEN** the Comment is stored and shown at once, with one classification call made

#### Scenario: A rejected reply keeps its draft

- **WHEN** a reply's body is rejected as harassment
- **THEN** the composer keeps the text and shows Carl's rejection naming harassment, and nothing is stored

#### Scenario: A press on a type is not classified

- **WHEN** a user presses a reaction type
- **THEN** the Reaction is saved and no classification call is made

#### Scenario: An edit that changes nothing is not classified

- **WHEN** an author saves an edit whose body is unchanged
- **THEN** no classification call is made

#### Scenario: A timed-out classification posts the Comment

- **WHEN** the classification exceeds its timeout on a Comment
- **THEN** the Comment is stored, and the failure is reported with the subject kind and without the text
