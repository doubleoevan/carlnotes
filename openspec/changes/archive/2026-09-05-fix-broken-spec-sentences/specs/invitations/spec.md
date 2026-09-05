## MODIFIED Requirements

### Requirement: An invite names a person by email or by username, one object either way

A user invite SHALL live on the same invites row every invite already is — never a second table, entity, or code path. The email column records which identifier the sender used, the invited user records the resolved recipient: a username invite has the user alone, an email invite has the address and gains the user when it resolves, and a link invite has neither. Each creation path SHALL set only its own identifier column, and per-target unique indexes on the invited user SHALL make re-inviting the same person a no-op, across modes included. Everything downstream of creation — expiry, acceptance, and display — SHALL treat the two identifiers identically apart from whether an email is sent.

Creating a username invite SHALL resolve the username first and reject an unknown one, so no invite row is ever written for a name no account holds. The invite form SHALL show each entered username as a chip, and SHALL name each rejected username when the invitations send.

#### Scenario: Both modes share one lifecycle

- **WHEN** an email invitation and a username invitation to the same Topic expire and are accepted
- **THEN** each behaves identically at every step, and only the email one ever produced mail

#### Scenario: An unknown username never becomes an invite

- **WHEN** a sender addresses an invite to a username no account holds
- **THEN** the send is refused, the refusal names the username to the sender, and no invite row exists
