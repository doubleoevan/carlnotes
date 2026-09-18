## ADDED Requirements

### Requirement: The note dialog says where the note stands

A note saves on its own, so the dialog SHALL say where it stands rather than offering a control to save it. At the foot of the
dialog, beside the delete, it SHALL show that the note is saving while an update is in flight, that it is saved once one lands, and
that it is not saved when the provider could not post one. It SHALL NOT offer a Save button: the document is
collaborative, so there is no local draft to commit, and a button would imply that leaving without it loses work.

The status SHALL be the plain fact and nothing else. A failure already explains itself in a toast, so the status SHALL
NOT repeat the reason.

A reader without edit access SHALL see no status, since a note they cannot change is never saving. An editor who
may not delete SHALL still see it, so the two sit on that row independently.

#### Scenario: Typing shows the note saving and then saved
- **WHEN** an editor types into a note
- **THEN** the dialog shows it saving while the update is in flight, and saved once it lands

#### Scenario: A failed save says so and stays saying so
- **WHEN** the provider cannot post an update
- **THEN** the dialog shows the note is not saved, the toast explains why, and the status stays until an update lands

#### Scenario: A note nobody has touched reads as saved
- **WHEN** an editor opens a note and types nothing
- **THEN** the dialog shows it saved, since everything in it is already on the server

#### Scenario: A read-only note shows no status
- **WHEN** a visitor or a user without edit access opens a public note
- **THEN** no save status shows, since nothing about it can change

#### Scenario: No Save button is offered
- **WHEN** an editor looks for a way to save
- **THEN** the dialog offers none, because the note is already saved and a button would say otherwise
