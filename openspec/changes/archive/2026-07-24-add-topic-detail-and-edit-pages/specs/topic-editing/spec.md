## ADDED Requirements

### Requirement: Editing happens in a modal, not a route
The ✎ icon SHALL open a centered edit modal over the dimmed topic page with an `Edit topic` title and a ✕ close. The same modal SHALL serve topic creation (titled `Add topic`) with empty fields, private daily defaults, and the default web source switched on. The modal SHALL present, top to bottom: Title (text input), Carl's Prompt (textarea), Tags (pill editor with per-pill ✕ and a "+" that opens a search-and-create picker in the style of GitHub's label menu — a filter input over the tags known from the loaded feed, click-to-add rows, and a Create row for a typed tag that matches nothing), Frequency and Visibility as two side-by-side selects (daily/weekly; private/public/invite), Invitees (only when visibility is invite), Sources, Attachments, and a right-aligned Cancel/Save footer. The Sources field SHALL split into a default group — Carl's built-in web scout, labeled `web`, removable when on and offered as a turn-on control when off — and a custom group listing the other sources with ✕ and an add picker limited to rss, reddit, and youtube. The `/topics/:id/edit` route SHALL NOT exist.

#### Scenario: The modal opens from the pencil
- **WHEN** the owner activates ✎
- **THEN** the modal opens over the dimmed page pre-filled with the Topic's current fields, with the Title input focused and its text not selected

#### Scenario: Cancel discards everything
- **WHEN** the owner edits fields, stages an upload, and then cancels
- **THEN** nothing is persisted and the page payload is unchanged

### Requirement: Topic creation is capped per user
The api SHALL create a topic owned by the current user from the same validated payload as an update, inserting its invitees and sources, capped at the caller's billing-plan topic limit (Free 3, Plus 10, Premium 25) — the cap counts owned topics, so deleting one frees a slot. Requests past the cap SHALL be rejected, and the modal's staged attachments SHALL upload against the new topic's id after creation.

#### Scenario: A create past the topic cap is rejected
- **WHEN** a user already holding as many topics as their plan allows submits another
- **THEN** the api rejects it and no topic is created

### Requirement: Save applies the whole edit through the owner-only api
Save SHALL apply the edit as desired state: one update call carrying the fields, the full invitee list, and the full source list (the api reconciles stored rows — kept by id, inserted without id, deleted when missing), then staged attachment uploads, then staged attachment removals. The api SHALL validate the payload (non-empty name, enum frequency/visibility, well-formed invitee emails, source kinds limited to rss/reddit/youtube/search) and reject writes from anyone but the owner. These steps SHALL run in sequence and are not one transaction: the field, invitee, and source update commits first, then staged uploads and removals apply independently, so a failure partway leaves the committed update in place with some attachments not yet uploaded or removed. The modal SHALL surface the error rather than roll back; because the update and reconciled lists are desired-state, re-saving reconverges them, and Cancel always discards staged-but-unsaved attachment changes.

#### Scenario: A field and source edit round-trips
- **WHEN** the owner renames the Topic, removes a source, adds an rss source, and saves
- **THEN** the reloaded page shows the new name and the reconciled source list

#### Scenario: A non-owner cannot update
- **WHEN** a non-owner sends an update for the Topic
- **THEN** the api rejects it as forbidden

### Requirement: Invitees are editable only for invite visibility
The Invitees field SHALL render only while the modal's visibility is invite: email pills with ✕, an "add by email…" input with an Invite button, and the helper line explaining invitees can view and subscribe. Saved invitees SHALL be stored in `topic_invites`, and an invited user's email SHALL grant view and subscribe access to that Topic.

#### Scenario: Switching visibility reveals the invitee editor
- **WHEN** the owner switches visibility from private to invite
- **THEN** the invitee editor appears, and saved emails persist to the invite list

### Requirement: Attachments are managed from the modal and downloadable from the page
The modal SHALL list the Topic's attachments each on its own row with a ✕ remove control, and offer controls to upload a file or add a url; uploads and url ingestion run the real pipeline (size/type validation, object storage, context generation — a url is fetched to markdown first) and removals delete the row plus best-effort the stored object. On the topic page, the info card SHALL offer attachment downloads only to the owner, streaming the stored object with its original filename.

#### Scenario: Upload and removal apply on save
- **WHEN** the owner stages a PDF upload and removes an existing attachment, then saves
- **THEN** the new attachment appears on the page, the removed one is gone, and its object is deleted from storage

### Requirement: Deletion is its own confirmation dialog
The 🗑 icon SHALL open a small confirmation dialog separate from the edit modal, with the copy "Delete this topic? '{name}' and its {N} findings and {M} scans go with it." and Keep it / Delete topic (destructive) buttons. Confirming SHALL delete the Topic through the owner-only api (rows cascade, stored attachment objects best-effort deleted) and return the user to the homepage.

#### Scenario: Delete confirms and navigates home
- **WHEN** the owner confirms the delete dialog
- **THEN** the Topic and its dependents are gone and the app navigates to the homepage
