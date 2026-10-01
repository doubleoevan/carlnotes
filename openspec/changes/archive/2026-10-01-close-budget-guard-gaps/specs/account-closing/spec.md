## ADDED Requirements

### Requirement: A LiteLLM key created while an account is closing is deleted
A model call made for a user can create and store a LiteLLM key after the close has read the user's row. When closing deletes the `users` row, it SHALL delete from the proxy any key that the deleted row had and that the close had not already deleted. A failure to delete that key SHALL be reported and SHALL NOT fail the close, since the row is already gone.

A key that the proxy does not know SHALL count as already deleted, so a close that is tried again after the proxy deleted the key goes on. A monthly key replacement that finds the user's row gone SHALL delete the replacement key that the replacement created.

#### Scenario: A key created during the close is deleted
- **WHEN** an account with no LiteLLM key is being closed, and a model call creates and stores a key before the `users` row is deleted
- **THEN** the close deletes that key from the proxy after it deletes the row

#### Scenario: A key that cannot be deleted does not fail the close

- **WHEN** the proxy fails to delete a key that was created during the close
- **THEN** the failure is reported, and the close still finishes

#### Scenario: A close tried again after its key was deleted
- **WHEN** a close deleted the user's key from the proxy and then failed, and the close is tried again
- **THEN** the proxy's 404 for the key counts as deleted, and the close goes on

#### Scenario: A key replacement meets a closed account
- **WHEN** the monthly reset creates a replacement key for a user whose row is deleted before the key is stored
- **THEN** the replacement key is deleted from the proxy

#### Scenario: A key that the close already deleted is not deleted twice
- **WHEN** an account's key was deleted at the start of the close and no model call created another
- **THEN** the close sends the proxy no second delete
