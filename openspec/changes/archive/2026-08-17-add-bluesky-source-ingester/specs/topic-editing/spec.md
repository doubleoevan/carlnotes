## ADDED Requirements

### Requirement: The default Source set is one registry

The Sources a new Topic starts with SHALL be one named set of source kinds that every surface reads, rather than a source kind named individually wherever defaults are decided. A source kind joins the set by being listed in it, and a Topic created from the editor SHALL be staged with one Source of every kind in the set, each configless. Each default kind SHALL carry its own display copy — a short label and a summary of what it does — so a default Source line reads as what it does rather than as its enum value. Every editable kind outside the set SHALL be offered in the custom add picker instead, where it names what to pull from.

#### Scenario: A new Topic starts with every default Source on

- **WHEN** the owner opens the modal to create a Topic
- **THEN** one Source per default kind is staged and shown as on, and saving creates them

#### Scenario: A kind outside the default set is offered as a custom source

- **WHEN** the owner opens the custom source add picker
- **THEN** it offers every editable source kind that is not in the default set, including bluesky

## MODIFIED Requirements

### Requirement: Editing happens in a modal, not a route
The ✎ icon SHALL open a centered edit modal over the dimmed topic page with an `Edit topic` title and a ✕ close. The same modal SHALL serve topic creation (titled `Add topic`) with empty fields, private daily defaults, and every default source switched on. The modal SHALL present, top to bottom: Title (text input), Carl's Prompt (textarea), Tags (pill editor with per-pill ✕ and a "+" that opens a search-and-create picker in the style of GitHub's label menu — a filter input over the tags known from the loaded feed, click-to-add rows, and a Create row for a typed tag that matches nothing), Frequency and Visibility as two side-by-side selects (daily/weekly; private/public/invite), Invitees (only when visibility is invite), Sources, Attachments, and a right-aligned Cancel/Save footer. The Sources field SHALL split into a default group — one row per default source kind, currently Carl's built-in web scout labeled `web`, removable when on and offered as a turn-on control when off — and a custom group listing the other sources with ✕ and an add picker offering the editable kinds outside the default set (url, rss, reddit, youtube, and a Bluesky account by handle). The `/topics/:id/edit` route SHALL NOT exist.

#### Scenario: The modal opens from the pencil
- **WHEN** the owner activates ✎
- **THEN** the modal opens over the dimmed page pre-filled with the Topic's current fields, with the Title input focused and its text not selected

#### Scenario: Cancel discards everything
- **WHEN** the owner edits fields, stages an upload, and then cancels
- **THEN** nothing is persisted and the page payload is unchanged

#### Scenario: A default source turns back on after being removed
- **WHEN** the owner removes a default source and then activates its turn-on control
- **THEN** that default source is staged again and saving restores it

#### Scenario: A Bluesky account is added as a custom source
- **WHEN** the owner picks bluesky in the add picker and enters an account handle
- **THEN** it is staged as a custom Bluesky Source carrying that handle, with any leading `@` stripped

#### Scenario: A new topic starts on invite

- **WHEN** the owner opens the Add topic modal
- **THEN** visibility starts on invite with the invitee editor showing, and the owner may switch to private or public before saving

#### Scenario: A Google News source sits in the custom group
- **WHEN** the modal opens on a Topic holding a Google News Source
- **THEN** the default group shows only the web scout, and the Google News Source is listed among the custom sources as the publisher it covers

#### Scenario: Creation starts with the preselected Sources on
- **WHEN** the owner opens the modal to add a Topic
- **THEN** the default group shows every preselected kind switched on, and saving creates one configless Source for each that is still on
### Requirement: Save applies the whole edit through the gate
Save SHALL apply the edit as desired state: one update call carrying the fields, the full invitee list, and the full source list (the api reconciles stored rows — kept by id, inserted without id, deleted when missing), then staged attachment uploads, then staged attachment removals. The api SHALL validate the payload (non-empty name, enum frequency/visibility, well-formed invitee emails, source kinds limited to the editable set: url, rss, reddit, youtube, search, and bluesky) and SHALL authorize the write through `isAllowed(user, "topic:edit", topic)`, which allows the owner or an admin and rejects everyone else. These steps SHALL run in sequence and are not one transaction: the field, invitee, and source update commits first, then staged uploads and removals apply independently, so a failure partway leaves the committed update in place with some attachments not yet uploaded or removed. The modal SHALL surface the error rather than roll back; because the update and reconciled lists are desired-state, re-saving reconverges them, and Cancel always discards staged-but-unsaved attachment changes.

#### Scenario: A field and source edit round-trips
- **WHEN** the owner renames the Topic, removes a source, adds an rss source, and saves
- **THEN** the reloaded page shows the new name and the reconciled source list

#### Scenario: An admin can update any Topic
- **WHEN** an admin saves an edit to a Topic they do not own
- **THEN** the gate allows it and the edit applies

#### Scenario: A non-owner cannot update
- **WHEN** a user who is neither the owner nor an admin sends an update for the Topic
- **THEN** the api rejects it as forbidden

#### Scenario: A bluesky source is accepted by validation
- **WHEN** a save carries a source of kind bluesky naming an account handle
- **THEN** the api accepts the payload and reconciles the source row
