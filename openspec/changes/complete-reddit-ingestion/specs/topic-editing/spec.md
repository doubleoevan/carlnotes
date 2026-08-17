## MODIFIED Requirements

### Requirement: Editing happens in a modal, not a route
The ✎ icon SHALL open a centered edit modal over the dimmed topic page with an `Edit topic` title and a ✕ close. The same modal SHALL serve topic creation (titled `Add topic`) with empty fields, private daily defaults, and every Source the registry preselects switched on. The modal SHALL present, top to bottom: Title (text input), Carl's Prompt (textarea), Tags (pill editor with per-pill ✕ and a "+" that opens a search-and-create picker in the style of GitHub's label menu — a filter input over the tags known from the loaded feed, click-to-add rows, and a Create row for a typed tag that matches nothing), Frequency and Visibility as two side-by-side selects (daily/weekly; private/public/invite), Invitees (only when visibility is invite), Sources, Attachments, and a right-aligned Cancel/Save footer. The Sources field SHALL split into a default group — one line per preselected kind, each carrying the registry's label for that kind, removable when on and offered as a turn-on control when off — and a custom group listing the other sources with ✕ and an add picker limited to rss, reddit, and youtube. Both groups SHALL take their labels and their per-kind config placeholders from the shared source registry rather than from literals held in the modal. The `/topics/:id/edit` route SHALL NOT exist.

#### Scenario: The modal opens from the pencil
- **WHEN** the owner activates ✎
- **THEN** the modal opens over the dimmed page pre-filled with the Topic's current fields, with the Title input focused and its text not selected

#### Scenario: Creation starts with the preselected Sources on
- **WHEN** the owner opens the modal to add a Topic
- **THEN** the default group shows every preselected kind switched on, and saving creates one configless Source for each that is still on

#### Scenario: Cancel discards everything
- **WHEN** the owner edits fields, stages an upload, and then cancels
- **THEN** nothing is persisted and the page payload is unchanged
