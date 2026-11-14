# stored-object-deletion Specification

## Purpose
TBD - created by archiving change harden-failure-paths. Update Purpose after archive.

## Requirements

### Requirement: Every stored object is deleted through one path

The app SHALL delete a stored object through one function in `packages/db/store.ts`, and nothing else SHALL call the bucket's
delete. The function SHALL try the delete at once, SHALL remove the key's pending row on success, and on failure SHALL
log the failure, leave the pending row in place, and return without throwing an error. A delete of an object that is
already gone SHALL count as a success. Resource content, whose key is fixed per Resource and rewritten by the next
fetch, SHALL delete through the same function with no pending row. A pending row could delete a later good write.

#### Scenario: A delete that succeeds leaves nothing pending

- **WHEN** a stored object's delete succeeds
- **THEN** the object is gone and its pending row is gone

#### Scenario: A delete that fails leaves its pending row

- **WHEN** the bucket rejects or cannot be reached for a delete
- **THEN** the caller is not thrown out of its own work, and the key's pending row stays for the sweep

#### Scenario: A missing object counts as deleted

- **WHEN** the sweep retries a key whose object is already gone
- **THEN** the retry succeeds and the pending row is removed

### Requirement: A key is recorded before the row that named it goes

A `pending_object_deletions` table SHALL hold each object key that is to be deleted, with the time it was recorded, the
time the sweep may first try it, the attempt count, the last error, and the time the key was reported, keyed by the
object key with no foreign key to any user, team, or topic. A write that deletes or fails the row naming an object SHALL
record the object's key in the same transaction, before the row change commits. A row change with no transaction
SHALL get one. A delete of a Topic, of a Team, of an account, or of a chat's attachments SHALL record every key
and delete every row in one transaction, then delete the objects after the commit, inserting the keys in batches so a
Topic with thousands of attachments records them all. A Podcast Episode's audio and chapter keys SHALL be computed from
its id and its script's chapter count before the script is cleared, and recorded inside the publish or removal
transaction. An avatar replacement SHALL read the previous key and write the new key in one transaction, so two uploads
at once cannot leave an object that no row names. An account close SHALL record the account's chat attachment keys and
its avatar key in the transaction that deletes the user row.

#### Scenario: A failed delete is retried by the sweep

- **WHEN** a Topic attachment's row is deleted and its object's delete fails
- **THEN** a pending row names the key, and the next sweep deletes the object and clears the row

#### Scenario: An account close with the bucket unreachable records everything

- **WHEN** an account is closed while the bucket cannot be reached
- **THEN** every key the account owned, its avatar, its chat attachments, its Topics' attachments, room attachments, and
  Podcast Episode audio, is recorded as pending before the account's rows are gone

#### Scenario: A Topic with thousands of attachments records every key

- **WHEN** a Topic holding more keys than one insert's batch is deleted
- **THEN** every key is recorded in batches inside the deleting transaction, and every object is deleted after it

#### Scenario: Two avatar uploads at once orphan nothing

- **WHEN** a user's two avatar uploads replace the same previous key at the same moment
- **THEN** the previous key is recorded once, and the key the losing upload wrote is recorded and deleted too

### Requirement: An upload records its key before the row that will name it exists

An upload whose row write can fail, a Topic attachment, a chat attachment, and an avatar, SHALL record its key before
uploading, with a grace period before the sweep may try the key, and SHALL clear the pending row in the transaction
that writes the row. A failed attachment insert SHALL delete the object through `deleteStoredObject`, which clears the
row on success, and a failed avatar write leaves the key to the sweep. A process that dies between the upload and the
row write leaves the pending row, and the sweep deletes the object after the grace period.

#### Scenario: A failed row insert leaves a pending key

- **WHEN** an attachment's object is uploaded and its row insert fails, and the inline delete fails too
- **THEN** the key stays pending, and the sweep deletes the object once the grace period has passed

#### Scenario: A successful upload leaves nothing pending

- **WHEN** an attachment's object is uploaded and its row is inserted
- **THEN** no pending row names the key

#### Scenario: A crash between the upload and the insert

- **WHEN** the process dies after the upload and before the insert
- **THEN** the key stays pending, and the sweep deletes the object after the grace period

### Requirement: The sweep retries pending keys outside its lease and reports what stays pending

The scheduled sweep SHALL retry every pending key whose try time has passed, after it releases its lease, so no
transaction stays open across a bucket call. Each failed retry SHALL raise the attempt count and push the next try time
back with a doubling delay, up to a day. A key pending for a day SHALL be reported to Sentry once and keep being
retried.

#### Scenario: A retry runs outside the lease

- **WHEN** the sweep reaches its pending keys
- **THEN** the sweep has already released its lease, and each retry runs on its own connection

#### Scenario: A failed retry backs off

- **WHEN** a key's third retry fails
- **THEN** its attempt count is three, and its next try time is eight minutes out

#### Scenario: A key pending for a day is reported once

- **WHEN** a key has been pending for more than a day across two sweeps
- **THEN** one Sentry report names it with its attempt count, the second sweep sends no second report, and the key keeps
  being retried

#### Scenario: Two sweeps retry one key

- **WHEN** two sweeps running at once retry one key
- **THEN** both retries are harmless, and a repeated delete of a gone object succeeds

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
