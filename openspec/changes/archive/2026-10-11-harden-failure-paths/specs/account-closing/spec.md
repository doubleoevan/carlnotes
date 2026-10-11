## MODIFIED Requirements

### Requirement: Closing an account takes everything it owns

Closing SHALL cancel everything that can still spend money before anything is destroyed: the user's Stripe subscription
and their LiteLLM key. A failure canceling either SHALL abort the close and leave the account whole, since an abort is
recoverable while a key the deleted row was the only record of is not. A user on the free plan has no subscription row
and nothing to cancel.

Closing SHALL then delete each owned Topic through the Topic delete, so the stored objects and the featured position
behind it are released instead of merely orphaned. It SHALL record the keys of the stored objects behind everything the
user kept in Chat, including on Topics they do not own, and their uploaded avatar, in the transaction that deletes the
`users` row, and SHALL delete those objects through `deleteStoredObject` after the commit, so a delete that fails leaves
its key pending for the sweep and no object is left that no row and no pending row names.

Closing SHALL then delete the `users` row, and every table referencing it SHALL cascade, with two exceptions that keep
other people's records whole: room messages the user authored survive with the account reference cleared and the name
they were posted under still shown, because deleting or unnaming them would rewrite conversations other members took
part in, and a Team the user led alone is settled first: handed to its longest-standing other member, or deleted if it
has no other member.

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
- **THEN** its sessions, accounts, subscriptions, bookmarks, chat turns, and memberships are gone with it, while room
  messages it authored remain, showing the name they were posted under with the account reference cleared

#### Scenario: A sole leader's Teams are settled by the close

- **WHEN** an account that is some Team's only leader is closed
- **THEN** each such Team with other active members is handed to its longest-standing one, a Team with no other member
  is deleted, and the close goes through either way

#### Scenario: A close with the bucket unreachable loses no key

- **WHEN** an account is closed while the bucket cannot be reached
- **THEN** its avatar key and its chat attachment keys are pending before the `users` row is gone, and the sweep deletes
  the objects once the bucket answers

### Requirement: Closing an account deletes its Podcast Episodes' audio

Closing an account SHALL delete the audio of every Podcast Episode of every Topic that the account owns, through the
same path that deletes a Topic, which records every audio and chapter key as pending in the transaction that deletes the
Topic row and deletes the objects through `deleteStoredObject` after the commit. The user's Podcast Episode rows, listen
rows, and feed tokens SHALL be deleted with the user. Deleting one Topic on its own SHALL delete its Podcast Episodes'
audio the same way and keep the Podcast Episode rows with no Topic, so their cost stays in the owner's spend history.

#### Scenario: A closed account's audio is gone

- **GIVEN** a user who owns a Topic with published Podcast Episodes
- **WHEN** the account is closed
- **THEN** every one of those Podcast Episodes' audio objects is deleted, and no Podcast Episode, listen, or feed token
  row of the user remains

#### Scenario: A deleted Topic's audio is gone and its cost remains

- **WHEN** an owner deletes a Topic with published Podcast Episodes
- **THEN** the audio objects are deleted, the Podcast Episode rows remain with no Topic, and their feed and audio urls
  respond as missing
