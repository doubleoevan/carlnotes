## ADDED Requirements

### Requirement: An unchecked image's files stay until it is published, rejected, or replaced

An unchecked upload's files SHALL be kept while it is unchecked: saving an avatar as unchecked SHALL clear its upload's
pending row in the transaction that writes the unchecked avatar's row, so the upload's grace period never deletes it. An
unchecked image that is rejected, replaced by a newer upload, or left by a deleted subject SHALL have its keys recorded
as pending and deleted through `deleteStoredObject`. An account close SHALL record the account's unchecked avatar key
with its avatar key.

#### Scenario: An unchecked avatar outlives the upload's grace period

- **GIVEN** an avatar that has been unchecked for two hours
- **WHEN** the sweep retries its pending keys
- **THEN** no pending row names the unchecked avatar, and its object is still stored

#### Scenario: A rejected unchecked image leaves no object

- **WHEN** the sweep's check rejects an unchecked Topic image
- **THEN** the keys of its original and its derived files are recorded as pending and deleted, and a delete that
  fails is retried by the sweep

#### Scenario: A replaced unchecked image is deleted

- **WHEN** a second upload replaces an unchecked avatar
- **THEN** the earlier unchecked avatar's key is recorded as pending and its object is deleted

#### Scenario: An account closed while its avatar is unchecked

- **WHEN** an account with an unchecked avatar is closed
- **THEN** the unchecked avatar's key is recorded in the transaction that deletes the user row, and its object is
  deleted

### Requirement: An unchecked image's files are recorded as pending in the transaction that drops it

The keys of an unchecked image's files SHALL be recorded as pending deletions in the transaction that deletes or
replaces its row: an unchecked image the sweep's check rejected, one a newer upload replaced, one a regenerate or an
admin's removal dropped, and one whose subject is gone. The objects SHALL be deleted once that transaction has
committed, so the sweep retries a delete that fails. An image that goes back to its uploader because its Topic turned
invite or public SHALL keep its files.

#### Scenario: A replaced unchecked Topic image is recorded and deleted

- **WHEN** a second unchecked upload replaces an unchecked Topic image
- **THEN** the earlier upload's original and six files are recorded as pending in the transaction that writes the newer
  unchecked image's row, and deleted once it has committed

#### Scenario: A dropped unchecked image is recorded and deleted

- **GIVEN** a public Topic with an unchecked upload
- **WHEN** an editor regenerates the Topic's image
- **THEN** the unchecked upload's files are recorded as pending in the transaction that drops the unchecked upload, and
  deleted

#### Scenario: A failed delete of a rejected unchecked film image is retried

- **WHEN** the sweep's check rejects an unchecked film image and the object store fails the delete of one of its two
  files
- **THEN** that file's key stays pending, and a later sweep deletes the object

#### Scenario: A published unchecked image's files stay with its subject

- **WHEN** the sweep stops checking a private Topic's unchecked image that passed its check
- **THEN** no file of the image is recorded or deleted

#### Scenario: An image that goes back to its uploader keeps its files

- **WHEN** a private Topic turns public and its unchecked image goes back to its uploader
- **THEN** no file of the image is recorded or deleted, and the uploader still loads it
