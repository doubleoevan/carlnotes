## ADDED Requirements

### Requirement: Deleting a room message requires confirmation

Web and mobile SHALL ask for confirmation before deleting an individual room message. The confirmation SHALL explain that the message and its attachments are removed for everyone in the chat. Both clients SHALL retain existing author, leader, and admin permissions and remove local history only after server acceptance.

#### Scenario: A person confirms deletion
- **WHEN** an authorized person chooses Delete and confirms
- **THEN** the existing deletion operation runs once for that message
- **AND** accepted deletion refreshes the room

#### Scenario: A person keeps the message
- **WHEN** the person cancels or dismisses confirmation
- **THEN** no deletion request is sent and the message and attachments remain

#### Scenario: Deletion fails or permission changes
- **WHEN** the server rejects a confirmed deletion
- **THEN** the existing error notice appears and the message remains
- **AND** confirmation never bypasses server authorization
