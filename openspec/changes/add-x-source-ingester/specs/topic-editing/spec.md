## MODIFIED Requirements

### Requirement: Editing happens in a modal, not a route
The ✎ icon SHALL open a centered edit modal over the dimmed topic page with an `Edit topic` title and a ✕ close. The same modal SHALL serve topic creation (titled `Add topic`) with empty fields, private daily defaults, and every member of the default Source set switched on. The modal SHALL present, top to bottom: Title (text input), Carl's Prompt (textarea), Tags (pill editor with per-pill ✕ and a "+" that opens a search-and-create picker in the style of GitHub's label menu — a filter input over the tags known from the loaded feed, click-to-add rows, and a Create row for a typed tag that matches nothing), Frequency and Visibility as two side-by-side selects (daily/weekly; private/public/invite), Invitees (only when visibility is invite), Sources, Attachments, and a right-aligned Cancel/Save footer. The Sources field SHALL split into a default group — one row per member of the default Source set, each labeled by its own display copy, removable when on and offered as a turn-on control when off — and a custom group listing the other sources with ✕ and an add picker offering every editable source kind that is not a default one: url, rss, reddit, youtube, and x. A default Source SHALL be removable and re-addable individually, so turning one off leaves the others on. The `/topics/:id/edit` route SHALL NOT exist.

#### Scenario: The modal opens from the pencil
- **WHEN** the owner activates ✎
- **THEN** the modal opens over the dimmed page pre-filled with the Topic's current fields, with the Title input focused and its text not selected

#### Scenario: Cancel discards everything
- **WHEN** the owner edits fields, stages an upload, and then cancels
- **THEN** nothing is persisted and the page payload is unchanged

#### Scenario: A new Topic is created with every default Source on
- **WHEN** the owner opens `Add topic` and saves without touching the Sources field
- **THEN** the created Topic holds one Source per member of the default Source set, and no `x` Source

#### Scenario: An X source is added by handle from the custom picker
- **WHEN** the owner opens the add picker, chooses `x`, and types a handle
- **THEN** a custom `x` Source is staged carrying that handle, with any leading `@` stripped, and it renders in the custom group with its `@handle` summary

#### Scenario: Turning one default Source off leaves the others on
- **WHEN** the owner removes a row from the default group and saves
- **THEN** the Topic keeps its other default Sources, holds no Source of the removed kind, and that row is offered as a turn-on control
