## ADDED Requirements

### Requirement: Deleting a chat file asks first

The web and mobile apps SHALL open a confirmation that names the file before they delete a shared chat room file or a
saved file in the Chat files list. Cancelling the confirmation SHALL keep the file.

#### Scenario: A user deletes a shared file

- **WHEN** a user presses delete on a chat room file or a saved chat file
- **THEN** the app asks whether to delete that file, and the file stays until the user confirms
