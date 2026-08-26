## MODIFIED Requirements

### Requirement: Closing an account takes everything it owns

Closing SHALL cancel everything that can still spend money before anything is destroyed: the user's Stripe subscription and their LiteLLM key. A failure canceling either SHALL abort the close and leave the account whole, since an abort is recoverable while a key the deleted row was the only record of is not. A user on the free plan has no subscription row and nothing to cancel.

Closing SHALL then delete each owned Topic through the Topic delete, so the stored objects and the featured position behind it are released instead of merely orphaned. It SHALL delete the stored objects behind everything the user kept in Chat, including on Topics they do not own, and their uploaded avatar. These SHALL be best-effort, since a stored object left behind costs storage and nothing else.

Closing SHALL then delete the `users` row, and every table referencing it SHALL cascade, with two exceptions that keep other people's records whole: room messages the user authored survive with the account reference cleared and the name they were posted under still shown, because deleting or unnaming them would rewrite conversations other members took part in, and a Team the user led passes the last-leader rule first — the close is refused while they are a Team's only leader, until they promote someone or delete the Team.

The system SHALL record who closed the account as an analytics event, since the row that would otherwise say so is gone.

#### Scenario: A paid account stops being billed

- **WHEN** an account holding an active Stripe subscription is closed
- **THEN** that subscription is cancelled outright before any row is deleted

#### Scenario: Billing that cannot be cancelled aborts the close

- **WHEN** cancelling the Stripe subscription throws
- **THEN** the close aborts and the account is still whole

#### Scenario: A key that cannot be retired aborts the close

- **WHEN** retiring the LiteLLM key throws
- **THEN** the close aborts with the key's row still naming it, so it can be retried

#### Scenario: Owned Topics and their stored objects go

- **WHEN** an account owning Topics is closed
- **THEN** each Topic is deleted through the Topic delete, and its attachments and featured position are released

#### Scenario: Nothing referencing the user survives

- **WHEN** an account is closed
- **THEN** its sessions, accounts, subscriptions, bookmarks, chat turns, and memberships are gone with it, while room messages it authored remain, showing the name they were posted under with the account reference cleared

#### Scenario: A sole leader's Teams are settled by the close

- **WHEN** an account that is some Team's only leader is closed
- **THEN** each such Team with other active members is handed to its longest-standing one, a Team with no other member is deleted, and the close goes through either way
