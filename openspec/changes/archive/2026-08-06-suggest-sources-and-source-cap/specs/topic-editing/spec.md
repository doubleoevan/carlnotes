## ADDED Requirements

### Requirement: A Topic holds at most ten Sources

A Topic SHALL hold at most ten Sources. Every kind counts toward that ceiling, the built-in web search included, so a reader who turns web search off frees a slot for something else. Urls written into Carl's Prompt count too, since they become Sources on save, and leaving them out would make the prompt a way around the cap.

The ceiling SHALL be a flat constant in shared configuration, the same on every plan. It bounds what one Scan fetches, which is a cost every plan pays, and a Topic with fifty feeds is a worse Topic at any price.

The cap SHALL be enforced in the save validation the payload already passes through, beside its source-kind checks, so creating and updating are both covered by one rule rather than two.

#### Scenario: A save past the cap is refused

- **WHEN** a save arrives holding eleven Sources
- **THEN** it is rejected and nothing about the Topic changes

#### Scenario: Web search occupies a slot

- **GIVEN** a Topic holding nine custom Sources and the built-in web search
- **WHEN** the reader turns web search off
- **THEN** the Topic has a free slot and one more Source may be added

#### Scenario: Prompt urls count toward the cap

- **GIVEN** a Topic at the cap
- **WHEN** the reader writes another url into Carl's Prompt and saves
- **THEN** the save is refused, since that url would become a Source

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

## MODIFIED Requirements

### Requirement: Editing happens in a modal, not a route
The ✎ icon SHALL open a centered edit modal over the dimmed topic page with an `Edit topic` title and a ✕ close. The same modal SHALL serve topic creation (titled `Add topic`) with empty fields, private daily defaults, and the default web source switched on. The modal SHALL present, top to bottom: Title (text input), Carl's Prompt (textarea), Tags (pill editor with per-pill ✕ and a "+" that opens a search-and-create picker in the style of GitHub's label menu — a filter input over the tags known from the loaded feed, click-to-add rows, and a Create row for a typed tag that matches nothing), Frequency and Visibility as two side-by-side selects (daily/weekly; private/public/invite), Invitees (only when visibility is invite), Sources, Attachments, and a right-aligned Cancel/Save footer. The Sources field SHALL split into a default group — Carl's built-in web search, labeled `web`, removable when on and offered as a turn-on control when off — and a custom group listing the other sources with ✕, an add picker limited to rss, reddit, and youtube, and a Suggest sources control. The `/topics/:id/edit` route SHALL NOT exist.

#### Scenario: The modal opens from the pencil
- **WHEN** the owner activates ✎
- **THEN** the modal opens over the dimmed page pre-filled with the Topic's current fields, with the Title input focused and its text not selected

#### Scenario: Cancel discards everything
- **WHEN** the owner edits fields, stages an upload, and then cancels
- **THEN** nothing is persisted and the page payload is unchanged
