## ADDED Requirements

### Requirement: Default Sources come from one registry

The default Source set SHALL be one shared registry rather than a comparison against the `search` kind. Each entry SHALL name its key, the Source kind it saves as, the label and summary the UI shows for it, and how its config is built. The registry SHALL hold Carl's web scout (kind `search`, labeled `web`, configless) and SHALL be the single place both the edit modal and the topic info card read the default set from, so adding a default Source means adding an entry. A stored Source SHALL match a registry entry by its kind.

Google News SHALL NOT be a registry entry: it is a custom Source, because it needs a publisher that only its owner — or a later change that suggests news sources — can name.

#### Scenario: A new Topic preselects every default Source

- **WHEN** the modal opens to create a Topic
- **THEN** every registry entry is switched on, so the new Topic saves with the web scout and no other Source

#### Scenario: A default Source is removable

- **WHEN** the owner removes the web scout and saves a Topic that has other Sources
- **THEN** no `search` Source is stored and the default group offers it as a turn-on control

#### Scenario: The last remaining Source cannot be removed

- **WHEN** the owner removes the only Source the Topic has left, default or custom
- **THEN** the removal is refused with the same warning the editor already gives

#### Scenario: Saving writes one row per switched-on entry

- **WHEN** a Topic is saved with a registry entry switched on
- **THEN** exactly one Source of that entry's kind is stored, holding the config the entry builds

### Requirement: The custom source picker offers options, not source kinds

The picker SHALL list custom source **options** from one shared table rather than listing source kinds, because an option is not always a kind of its own. Each option SHALL name the kind it saves as, the label the picker and the staged row show, the placeholder its value input carries, and how it turns the typed value into a Source config. The table SHALL be the single place a custom Source's config is built, so the modal carries no per-kind config branch of its own.

The picker SHALL offer a `google news` option whose input is a publisher domain and whose kind is `rss`, alongside the `url`, `rss`, `reddit`, and `youtube` options. An option that cannot build a config from what was typed SHALL stage no Source.

#### Scenario: Google News is added from the picker

- **WHEN** the owner picks `google news`, types `techcrunch.com`, and saves
- **THEN** an `rss` Source is stored whose url is the Google News feed for that publisher, and the editor lists it as a custom Source

#### Scenario: The picker names what each option wants

- **WHEN** the owner selects an option in the picker
- **THEN** the value input carries that option's own placeholder, such as `publisher domain…` for `google news` and `feed url…` for `rss`

#### Scenario: A value the option cannot build from stages nothing

- **WHEN** the owner picks `google news` and types a value with no domain in it
- **THEN** no Source is staged and the rest of the save is unaffected

## MODIFIED Requirements

### Requirement: Editing happens in a modal, not a route
The ✎ icon SHALL open a centered edit modal over the dimmed topic page with an `Edit topic` title and a ✕ close. The same modal SHALL serve topic creation (titled `Add topic`) with empty fields, private daily defaults, and every default source switched on. The modal SHALL present, top to bottom: Title (text input), Carl's Prompt (textarea), Tags (pill editor with per-pill ✕ and a "+" that opens a search-and-create picker in the style of GitHub's label menu — a filter input over the tags known from the loaded feed, click-to-add rows, and a Create row for a typed tag that matches nothing), Frequency and Visibility as two side-by-side selects (daily/weekly; private/public/invite), Invitees (only when visibility is invite), Sources, Attachments, and a right-aligned Cancel/Save footer. The Sources field SHALL split into a default group — one row per registry entry, Carl's built-in web scout labeled `web`, removable when on and offered as a turn-on control when off — and a custom group listing the other sources with ✕ and an add picker offering the custom source options: url, rss, google news, reddit, and youtube. The `/topics/:id/edit` route SHALL NOT exist.

#### Scenario: The modal opens from the pencil
- **WHEN** the owner activates ✎
- **THEN** the modal opens over the dimmed page pre-filled with the Topic's current fields, with the Title input focused and its text not selected

#### Scenario: Cancel discards everything
- **WHEN** the owner edits fields, stages an upload, and then cancels
- **THEN** nothing is persisted and the page payload is unchanged

#### Scenario: A Google News source sits in the custom group
- **WHEN** the modal opens on a Topic holding a Google News Source
- **THEN** the default group shows only the web scout, and the Google News Source is listed among the custom sources as the publisher it covers
