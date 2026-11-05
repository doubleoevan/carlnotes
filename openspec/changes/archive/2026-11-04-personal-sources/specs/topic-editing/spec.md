## MODIFIED Requirements

### Requirement: A Topic holds at most ten Sources

A Topic SHALL hold at most ten fetched Sources. Receiving `ai_agent` and `email` Sources SHALL be excluded from the count and displayed in a separate sender-only Personal sources group. Topic info and Artisanal Blend SHALL share a flat item list that expands in place to full details. The condensed scoring context stays internal. Every fetched kind counts toward that limit, the built-in web search included, so a reader who turns web search off frees a slot for something else. Urls written into Carl's Prompt count too, since they become Sources on save, and leaving them out would make the prompt a way around the cap.

The limit SHALL be a flat constant in shared configuration, the same on every plan. It bounds what one Scan fetches, which is a cost every plan pays, and a Topic with fifty feeds is a worse Topic at any price.

The cap SHALL be enforced in the save validation the payload already passes through, beside its source-kind checks, so creating and updating are both covered by one rule rather than two. First sends, imports, and accepted email SHALL remain eligible when ten fetched Sources exist.

#### Scenario: A save past the cap is rejected

- **WHEN** a save arrives holding eleven fetched Sources
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


### Requirement: The custom source picker offers options, not source kinds

The picker SHALL list custom source **options** from one shared table rather than listing source kinds, because an option is not always a kind of its own. Each option SHALL name its stored kind, label, and input mode. Typed options SHALL carry a placeholder and config builder. Connected-AI Agent, import, and forwarding options SHALL invoke their dedicated authorized flow without accepting fabricated credentials or client IDs. The table SHALL be the single place a typed custom Source's config is built, so the modal carries no per-kind config branch of its own.

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


## ADDED Requirements

### Requirement: General Topic saves preserve Personal sources

A Topic form or Topic Tool save SHALL preserve Personal sources absent from its payload. Only an explicit sender-authorized Personal source removal SHALL delete one and its entries. Fetched Source editing SHALL retain its existing behavior.

#### Scenario: A send arrives after the editor opened
- **WHEN** a send creates a Source and the owner then saves an older Topic form
- **THEN** the new Source and entries remain and the requested Topic edits succeed if otherwise valid

#### Scenario: The sender removes a Personal source
- **WHEN** the sender confirms the dedicated removal action
- **THEN** their entries and pending links are removed and their context and derived annotations are invalidated
- **AND** existing Findings remain and a later accepted delivery may recreate that sender's Source

#### Scenario: Receiving at the fetched Source limit
- **WHEN** a first accepted email and an AI Agent’s first send run on a Topic with ten fetched Sources
- **THEN** both can create their receiving Sources without consuming a fetched slot
- **AND** adding an eleventh fetched Source remains refused

### Requirement: The editor explains sender-private Personal sources

The editor SHALL keep Personal sources outside the fetched Source count and show only the current sender's Sources, items, and setup. Receipt SHALL require normal edit permission. Personal sources SHALL not disable visibility, Team, invitation, or podcast controls.

#### Scenario: An editor opens a shared Topic
- **WHEN** the editor reads its Source settings
- **THEN** their Personal sources are a separate group excluded from ten fetched Sources
- **AND** no other sender's item counts or provenance appear

#### Scenario: A sender removes their Source
- **WHEN** they confirm removal
- **THEN** only that sender's Source and items are removed and no other sender's data changes
