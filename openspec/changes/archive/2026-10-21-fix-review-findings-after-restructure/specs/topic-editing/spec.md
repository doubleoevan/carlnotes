## ADDED Requirements

### Requirement: A retried Save updates the Topic the first attempt created

If a Save that creates a Topic succeeds at the create and then fails at a staged attachment upload, the modal SHALL keep
the created Topic's id for as long as it stays open, and the next Save SHALL update that Topic and retry the upload
instead of creating a second Topic. The owner ends with one Topic however many times they press Save.

#### Scenario: A retry updates, not creates

- **WHEN** a new Topic's Save creates the Topic, the upload of a staged file fails, and the owner presses Save again
- **THEN** the second Save updates the Topic the first created, uploads the file, and the owner holds one new Topic

#### Scenario: A fresh modal starts over

- **WHEN** the modal opens for creation again after a completed Save
- **THEN** it holds no created id, and its Save creates a new Topic

### Requirement: The subscriber recount locks the Topic row

The recount that writes `topics.subscriber_count` SHALL lock the Topic row with `select ... for no key update` before
counting the active Subscriptions, the strength a Subscription insert's foreign key share does not block, and the lock,
the count, and the write SHALL run in one transaction, so two concurrent subscribe or unsubscribe writes recount one
after the other, never deadlock, and the stored count never ends on the earlier of two reads.

#### Scenario: Concurrent writes recount in turn

- **WHEN** two Subscription writes to one Topic recount at the same moment
- **THEN** the second recount waits for the first's lock, and the stored count equals the active subscriber rows after
  both

#### Scenario: The recount is one transaction

- **WHEN** the recount runs
- **THEN** the row lock, the count, and the write happen in one transaction
