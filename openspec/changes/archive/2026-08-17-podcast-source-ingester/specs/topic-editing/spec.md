## MODIFIED Requirements

### Requirement: Editing happens in a modal, not a route
The ✎ icon SHALL open a centered edit modal over the dimmed topic page with an `Edit topic` title and a ✕ close. The same modal SHALL serve topic creation (titled `Add topic`) with empty fields, private daily defaults, and every registered default source switched on. The modal SHALL present, top to bottom: Title (text input), Carl's Prompt (textarea), Tags (pill editor with per-pill ✕ and a "+" that opens a search-and-create picker in the style of GitHub's label menu — a filter input over the tags known from the loaded feed, click-to-add rows, and a Create row for a typed tag that matches nothing), Frequency and Visibility as two side-by-side selects (daily/weekly; private/public/invite), Invitees (only when visibility is invite), Sources, Attachments, and a right-aligned Cancel/Save footer. The Sources field SHALL split into a default group — one row per kind in the shared default-Source registry, each labeled from that registry, removable when on and offered as a turn-on control when off, Carl's built-in web scout (`web`) among them — and a custom group listing the other sources with ✕ and an add picker offering the editable source kinds, including `podcast`, which takes a show's podcast id. The `/topics/:id/edit` route SHALL NOT exist.

#### Scenario: The modal opens from the pencil
- **WHEN** the owner activates ✎
- **THEN** the modal opens over the dimmed page pre-filled with the Topic's current fields, with the Title input focused and its text not selected

#### Scenario: Cancel discards everything
- **WHEN** the owner edits fields, stages an upload, and then cancels
- **THEN** nothing is persisted and the page payload is unchanged

#### Scenario: Creation stages every default source
- **WHEN** the modal opens for creation
- **THEN** the default group shows one row per registered default kind, web among them, each switched on

#### Scenario: A podcast is added by its podcast id
- **WHEN** the owner adds a `podcast` source and types a show's podcast id
- **THEN** it is staged as a custom source carrying that id, and the default group is unaffected

#### Scenario: A new topic starts on invite

- **WHEN** the owner opens the Add topic modal
- **THEN** visibility starts on invite with the invitee editor showing, and the owner may switch to private or public before saving

#### Scenario: A Google News source sits in the custom group
- **WHEN** the modal opens on a Topic holding a Google News Source
- **THEN** the default group shows only the web scout, and the Google News Source is listed among the custom sources as the publisher it covers

#### Scenario: Creation starts with the preselected Sources on
- **WHEN** the owner opens the modal to add a Topic
- **THEN** the default group shows every preselected kind switched on, and saving creates one configless Source for each that is still on

#### Scenario: A default source turns back on after being removed
- **WHEN** the owner removes a default source and then activates its turn-on control
- **THEN** that default source is staged again and saving restores it

#### Scenario: A Bluesky account is added as a custom source
- **WHEN** the owner picks bluesky in the add picker and enters an account handle
- **THEN** it is staged as a custom Bluesky Source carrying that handle, with any leading `@` stripped

#### Scenario: A new Topic is created with every default Source on
- **WHEN** the owner opens `Add topic` and saves without touching the Sources field
- **THEN** the created Topic holds one Source per member of the default Source set, and no `x` Source

#### Scenario: An X source is added by handle from the custom picker
- **WHEN** the owner opens the add picker, chooses `x`, and types a handle
- **THEN** a custom `x` Source is staged carrying that handle, with any leading `@` stripped, and it renders in the custom group with its `@handle` summary

#### Scenario: Turning one default Source off leaves the others on
- **WHEN** the owner removes a row from the default group and saves
- **THEN** the Topic keeps its other default Sources, holds no Source of the removed kind, and that row is offered as a turn-on control
