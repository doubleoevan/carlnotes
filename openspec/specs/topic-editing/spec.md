# topic-editing Specification

## Purpose
TBD - created by archiving change add-topic-detail-and-edit-pages. Update Purpose after archive.
## Requirements
### Requirement: Editing happens in a modal, not a route
The ✎ icon SHALL open a centered edit modal over the dimmed topic page with an `Edit topic` title and a ✕ close. The same modal SHALL serve topic creation (titled `Add topic`) with empty fields, private daily defaults, and the default web source switched on. The modal SHALL present, top to bottom: Title (text input), Carl's Prompt (textarea), Tags (pill editor with per-pill ✕ and a "+" that opens a search-and-create picker in the style of GitHub's label menu — a filter input over the tags known from the loaded feed, click-to-add rows, and a Create row for a typed tag that matches nothing), Frequency and Visibility as two side-by-side selects (daily/weekly; private/public/invite), Invitees (only when visibility is invite), Sources, Attachments, and a right-aligned Cancel/Save footer. The Sources field SHALL split into a default group — Carl's built-in web search, labeled `web`, removable when on and offered as a turn-on control when off — and a custom group listing the other sources with ✕, an add picker limited to rss, reddit, and youtube, and a Suggest sources control. The `/topics/:id/edit` route SHALL NOT exist.

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

### Requirement: Invitees are editable only for invite visibility
The Invitees field SHALL render only while the modal's visibility is invite: email pills with ✕, an "add by email…" input with an Invite button, and a helper line explaining that invitees are asked to subscribe and choose for themselves. Saved invitees SHALL be stored in `topic_invites`. An invited email SHALL grant topic-page view access and a pending invite the invitee must accept before any subscription exists — saving an invitee SHALL never subscribe them or place the Topic in their view.

#### Scenario: Switching visibility reveals the invitee editor
- **WHEN** the owner switches visibility from private to invite
- **THEN** the invitee editor appears, and saved emails persist to the invite list

#### Scenario: Saving an invitee does not subscribe them
- **WHEN** the owner saves a new invitee email
- **THEN** the invite is pending for that email's user, and no subscription row exists until they accept

### Requirement: Attachments are managed from the modal and downloadable from the page
The modal SHALL list the Topic's attachments each on its own row with a ✕ remove control, and offer controls to upload a file or add a url; uploads and url ingestion run the real pipeline (size/type validation, object storage, context generation — a url is fetched to markdown first) and removals delete the row plus best-effort the stored object. On the topic page, the info card SHALL offer attachment downloads only to the owner, streaming the stored object with its original filename.

A `ready` attachment's row SHALL also expose its generated context as editable text, since that context steers every later Scan for the Topic. Saving the modal SHALL persist an edited context, and a `pending` or `failed` attachment SHALL show its status instead of an editor, because it has no settled context to edit.

#### Scenario: Upload and removal apply on save
- **WHEN** the owner stages a PDF upload and removes an existing attachment, then saves
- **THEN** the new attachment appears on the page, the removed one is gone, and its object is deleted from storage

#### Scenario: An edited context is saved
- **WHEN** the owner edits a ready attachment's context text and saves the modal
- **THEN** the attachment's stored context is the edited text and the Topic's next Scan uses it

#### Scenario: A pending attachment offers no editor
- **WHEN** the modal lists an attachment still being processed or one that failed
- **THEN** its row shows that status rather than an editable context field

### Requirement: Deletion is its own confirmation dialog
The 🗑 icon SHALL open a small confirmation dialog separate from the edit modal, with the copy "Delete this topic? '{name}' and its {N} findings and {M} scans go with it." and Keep it / Delete topic (destructive) buttons. Confirming SHALL delete the Topic through the api authorized by `isAllowed(user, "topic:delete", topic)` — the owner or an admin (rows cascade, stored attachment objects best-effort deleted) — and return the user to the homepage.

#### Scenario: Delete confirms and navigates home
- **WHEN** the owner confirms the delete dialog
- **THEN** the Topic and its dependents are gone and the app navigates to the homepage

#### Scenario: An admin can delete any Topic
- **WHEN** an admin confirms deletion of a Topic they do not own
- **THEN** the gate allows it and the Topic and its dependents are gone

### Requirement: Max results is chosen in the edit modal
The edit-topic modal SHALL offer a "Max results" select with the options Carl's top 5, Carl's top 10, Carl's top 15, and Carl's top 20 — wording identical to the info card's row. A new topic defaults to Carl's top 10, an existing topic shows its stored value, and the api SHALL validate the saved value against the allowed set.

#### Scenario: The select round-trips
- **WHEN** the owner picks Carl's top 15 and saves
- **THEN** the reloaded topic stores `max_results` 15 and the modal and info card both show it

#### Scenario: An invalid value is rejected
- **WHEN** a save carries a max-results value outside 5, 10, 15, or 20
- **THEN** the api rejects the payload

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

### Requirement: A Topic holds at most ten Sources

A Topic SHALL hold at most ten Sources. Every kind counts toward that limit, the built-in web search included, so a reader who turns web search off frees a slot for something else. Urls written into Carl's Prompt count too, since they become Sources on save, and leaving them out would make the prompt a way around the cap.

The limit SHALL be a flat constant in shared configuration, the same on every plan. It bounds what one Scan fetches, which is a cost every plan pays, and a Topic with fifty feeds is a worse Topic at any price.

The cap SHALL be enforced in the save validation the payload already passes through, beside its source-kind checks, so creating and updating are both covered by one rule rather than two.

#### Scenario: A save past the cap is rejected

- **WHEN** a save arrives holding eleven Sources
- **THEN** it is rejected and nothing about the Topic changes

#### Scenario: Web search occupies a slot

- **GIVEN** a Topic holding nine custom Sources and the built-in web search
- **WHEN** the reader turns web search off
- **THEN** the Topic has a free slot and one more Source may be added

#### Scenario: Prompt urls count toward the cap

- **GIVEN** a Topic at the cap
- **WHEN** the reader writes another url into Carl's Prompt and saves
- **THEN** the save is rejected, since that url would become a Source

#### Scenario: The cap does not vary by plan

- **WHEN** the cap is read for a free reader and for a premium one
- **THEN** it is the same number

### Requirement: The editor proposes Sources and shows when it is full

The edit modal SHALL offer a **Suggest sources** control that reads the Title and Carl's Prompt as they stand and adds what comes back straight to the staged-source list, each row removable with the ✕ already on it. Nothing SHALL be persisted until Save, so a suggestion the reader does not want costs them one click to drop.

The control SHALL be disabled until the Title or the Prompt has text, since neither the reader nor a model can propose Sources for a Topic that describes nothing yet.

While suggestions are on their way the control SHALL be replaced by a moving line drawn from the same set the chat shows while a reply is coming, so waiting reads as the product thinking instead of as a stalled button.

The modal SHALL ask only for the headroom the Topic has left — the lesser of three and the free slots — so it never offers what the Topic cannot hold.

At the cap, both **+ add a source** and **Suggest sources** SHALL be disabled and SHALL explain why in the product's own voice, in the treatment the frequency picker already uses for a limit, without its link to pricing. The cap is the same on every plan, so there is nothing to upgrade to and offering it would be a false promise.

When suggestions come back empty, the modal SHALL say so plainly rather than leaving the reader looking at an unchanged list wondering whether the click registered.

#### Scenario: A suggestion lands as a removable row

- **WHEN** the reader activates Suggest sources and the route returns two Sources
- **THEN** both appear in the staged-source list with their ✕, and neither is persisted until Save

#### Scenario: An empty Topic cannot ask

- **WHEN** the modal is open for a new Topic with no Title and no Prompt
- **THEN** Suggest sources is disabled

#### Scenario: Waiting reads as thinking

- **WHEN** suggestions are being fetched
- **THEN** the control is replaced by a moving line, and it returns when the suggestions arrive

#### Scenario: A nearly full Topic asks for what fits

- **GIVEN** a Topic holding nine Sources
- **WHEN** the reader asks for suggestions
- **THEN** at most one is requested and at most one is added

#### Scenario: A full Topic explains itself

- **GIVEN** a Topic at the cap
- **WHEN** the reader looks at the Sources field
- **THEN** both + add a source and Suggest sources are disabled and say why in the product's voice, with no link to pricing

#### Scenario: No suggestions says so

- **WHEN** every candidate was filtered or failed verification
- **THEN** the modal tells the reader nothing new was found, and the staged list is unchanged

