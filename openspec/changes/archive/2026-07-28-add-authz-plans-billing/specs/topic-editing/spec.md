## RENAMED Requirements

- FROM: `### Requirement: Save applies the whole edit through the owner-only api`
- TO: `### Requirement: Save applies the whole edit through the gate`

## MODIFIED Requirements

### Requirement: Save applies the whole edit through the gate
Save SHALL apply the edit as desired state: one update call carrying the fields, the full invitee list, and the full source list (the api reconciles stored rows — kept by id, inserted without id, deleted when missing), then staged attachment uploads, then staged attachment removals. The api SHALL validate the payload (non-empty name, enum frequency/visibility, well-formed invitee emails, source kinds limited to rss/reddit/youtube/search) and SHALL authorize the write through `isAllowed(user, "topic:edit", topic)`, which allows the owner or an admin and rejects everyone else. These steps SHALL run in sequence and are not one transaction: the field, invitee, and source update commits first, then staged uploads and removals apply independently, so a failure partway leaves the committed update in place with some attachments not yet uploaded or removed. The modal SHALL surface the error rather than roll back; because the update and reconciled lists are desired-state, re-saving reconverges them, and Cancel always discards staged-but-unsaved attachment changes.

#### Scenario: A field and source edit round-trips
- **WHEN** the owner renames the Topic, removes a source, adds an rss source, and saves
- **THEN** the reloaded page shows the new name and the reconciled source list

#### Scenario: An admin can update any Topic
- **WHEN** an admin saves an edit to a Topic they do not own
- **THEN** the gate allows it and the edit applies

#### Scenario: A non-owner cannot update
- **WHEN** a user who is neither the owner nor an admin sends an update for the Topic
- **THEN** the api rejects it as forbidden

### Requirement: Deletion is its own confirmation dialog
The 🗑 icon SHALL open a small confirmation dialog separate from the edit modal, with the copy "Delete this topic? '{name}' and its {N} findings and {M} scans go with it." and Keep it / Delete topic (destructive) buttons. Confirming SHALL delete the Topic through the api authorized by `isAllowed(user, "topic:delete", topic)` — the owner or an admin (rows cascade, stored attachment objects best-effort deleted) — and return the user to the homepage.

#### Scenario: Delete confirms and navigates home
- **WHEN** the owner confirms the delete dialog
- **THEN** the Topic and its dependents are gone and the app navigates to the homepage

#### Scenario: An admin can delete any Topic
- **WHEN** an admin confirms deletion of a Topic they do not own
- **THEN** the gate allows it and the Topic and its dependents are gone
