## MODIFIED Requirements

### Requirement: Personal sources capabilities use the shared authority and entitlement gate

Sending and importing SHALL use the central Topic edit gate. Reading private material SHALL require its sender identity
and appropriate Topic read access. Deletion SHALL permit senders to clean up their own data. For non-admins, email SHALL
require the sender's Plus or Premium capability on each request; AI Agent API keys SHALL retain their Premium gate.
Admins SHALL bypass those plan gates while remaining subject to the shared 200-delivery ceiling and sender-only privacy.

#### Scenario: An owning-Team editor sends
- **WHEN** the user has ordinary Topic edit authority through the owning Team
- **THEN** their send may be accepted and its private content remains theirs alone

#### Scenario: A worker processes mail after downgrade or edit revocation
- **WHEN** the sender loses required entitlement or Topic edit permission after webhook confirmation
- **THEN** the worker stores no new entry and does not report successful filing

#### Scenario: Plus includes forwarding
- **WHEN** a Plus sender forwards authenticated mail with shared send allowance remaining
- **THEN** email entitlement permits normal editable-Topic filing

#### Scenario: Free has send allowance but no forwarding
- **WHEN** a Free sender forwards authenticated mail while AI Agent sends remain available
- **THEN** no email is filed or charged, and Carl replies with Plus-or-Premium upgrade guidance

#### Scenario: A downgraded sender removes content
- **WHEN** a sender without Premium requests deletion of their own item or credential revocation
- **THEN** cleanup remains permitted without exposing another sender's content
