## RENAMED Requirements

- FROM: `### Requirement: Documentation describes shipped receipt and retention`
- TO: `### Requirement: Documentation describes shipped confirmation and retention`

## REMOVED Requirements

### Requirement: Personal sources use one customer name

**Reason**: Its scenario heading used a rejected term, and a MODIFIED block cannot rename a scenario.
**Migration**: `Every Personal sources path uses one customer name` holds the same rule.

## MODIFIED Requirements

### Requirement: Topic info and Artisanal Blend share the complete Personal sources section

Both surfaces SHALL render the same core component after fetched Sources: one collapsed **Personal sources · N items**
header in the muted Architects Daughter section-label style with **Only you can see this** on the right, enclosing
numbered newest-first item rows with independent nested disclosures and confirmed deletion. No separate summary heading,
total-count row, page opener, or Source-group disclosure SHALL be added.

#### Scenario: The sender expands an item in either placement
- **WHEN** the sender opens Personal sources within Topic info or Artisanal Blend, then expands an item
- **THEN** the same shared component reveals full stored text, sender/date, links with outcomes and Finding
  destinations, private references, and confirmed deletion inline
- **AND** the flat list appears directly below the header, with no internal scoring summary, coverage helper text,
  Source-group disclosure, or new popover
- **AND** source links show the stored page title when available, otherwise the full URL, with visual truncation and a
  complete accessible name
- **AND** Delete sits at the top right of expanded item content; queued links show **Next brew** beside an external-link
  icon; reviewed links without Findings open externally with only that icon; source links with authorized Findings open
  the existing popup or native sheet in place
- **AND** the list and item triggers have no added horizontal padding, and the section row has no outer vertical padding
- **AND** compact vertical spacing preserves minimum touch targets, and row feedback underlines the primary label
  without filling the row; keyboard focus stays visible
- **AND** the final visible item has no bottom divider but retains its bottom padding; the section adds no extra bottom
  inset
- **AND** other item rows keep their independent expansion state

#### Scenario: The sender opens and closes the entire section
- **WHEN** either containing surface opens
- **THEN** **Personal sources · N items** starts collapsed, with **Only you can see this** on the right of that same
  disclosure row
- **WHEN** the sender expands it
- **THEN** the item list or its loading/error state appears inside the section
- **AND** the header shows the current sender’s total live item count, using “1 item” for one item and “N items”
  otherwise; paging leaves that total unchanged
- **AND** loading reuses one compact **Steeping** indicator
- **WHEN** the sender closes the section
- **THEN** all contents are hidden, pending private reads are cancelled, and decrypted pages and local page selection
  are released
- **AND** only confirmation metadata may be read before opening; entry-text queries start only when the section opens;
  neither placement requests the internal scoring summary

#### Scenario: A sender no longer edits the Topic
- **WHEN** a signed-in user has retained items and Topic read access, regardless of ownership or current edit authority
- **THEN** both placements show only that user's numbered history
- **AND** new sends still require Topic edit authority

#### Scenario: The sender views Personal sources
- **WHEN** the sender expands Personal sources in either containing surface
- **THEN** items are ordered by received date descending and ID descending
- **AND** item rows start collapsed and are numbered sequentially from one, continuing on the next numbered page and
  restoring the previous numbers when paging back
- **AND** each page contains at most five items and uses the existing numbered square Pagination controls, supporting
  direct jumps and continuous row numbers
- **AND** the existing ciphertext-size bound remains, page boundaries include every item, and deletion clamps a retired
  page to the last remaining page
- **AND** expanded item content uses equal compact top and bottom padding without an added top margin
- **AND** the list starts close below the section header, and numbered pagination has equal spacing above and below its
  controls
- **AND** item titles and row numbers use muted Architects Daughter text at regular weight; row numbers have no trailing
  dots
- **AND** collapsed rows show the item title and received date without a sender badge; the sender appears in expanded
  content

#### Scenario: Internal scoring context changes
- **WHEN** a deletion or new entry invalidates the stored summary, or rebuilding fails
- **THEN** internal scoring retains its revision and coverage safeguards
- **AND** the item list remains independent of summary generation and never displays summary text or its helper states

#### Scenario: More items or text remain
- **WHEN** an entry page or long-text bound is reached
- **THEN** accessible paging reaches every live item and every stored character in stable order

#### Scenario: The sender deletes an item
- **WHEN** the sender confirms deletion on any platform
- **THEN** success removes the item, invalidates the summary, and refreshes counts and every mounted item page in both
  placements
- **AND** failure preserves the item and summary and offers retry

#### Scenario: The sender has no Personal sources items
- **WHEN** sender-only confirmation metadata contains no live items
- **THEN** Topic info and Artisanal Blend render no Personal sources section, wrapper, or added divider
- **AND** their existing layout remains unchanged
- **WHEN** live sender items exist
- **THEN** the shared section renders with the existing dotted/dashed divider above it in Topic info and below it in
  Artisanal Blend
- **AND** removing the final item hides the section and releases its decrypted content

### Requirement: Private context stays out of shared outputs

Personal sources text, sender details, private references, and annotations SHALL NOT enter public explanations, global
Resource text, public indexes, shared embeddings, shared chats, reports, other users' deliveries, or podcast narration.
Logs and telemetry SHALL contain no private payload or credentials.

#### Scenario: An entry contains a private canary
- **WHEN** confirmation, summarization, scoring, delivery, and logging complete
- **THEN** its canary exists only in encrypted sender storage and authorized private processing/output
- **AND** no prohibited destination contains it

#### Scenario: A podcast narrates a shaped Finding
- **WHEN** a podcast uses a Finding that personal text influenced
- **THEN** it narrates only the public explanation grounded in the linked page
- **AND** Personal sources do not disable podcast generation

### Requirement: A shaped Finding has public and sender-private explanations

A Finding influenced by a send SHALL have a public explanation based only on its linked page and a separate private
annotation for each contributing sender. The public explanation SHALL never quote or attribute sent material. Both
layers SHALL be written in one structured model call per sender and committed together; a failed privacy check SHALL
publish neither result. A sender SHALL read their own annotation in the expanded rows of the findings and search MCP
views, and through `read_topic_context`, and no other page or screen SHALL show it.

#### Scenario: A send changes a Finding's relevance
- **WHEN** scoring uses sent context to select or explain a linked page
- **THEN** the public note describes that page and the stored private annotation remains accessible only to its sender
- **AND** one generation call per sender selects the public page excerpts and writes that sender’s private annotation

#### Scenario: A reader opens a Finding
- **WHEN** a reader opens the Finding popover or native sheet
- **THEN** it shows the public note without a private annotation block or annotation request

#### Scenario: Multiple senders influence a Finding
- **WHEN** two senders' contexts shape the same Finding
- **THEN** each gets only their own annotation and each model call receives only that sender’s private context

#### Scenario: Private material appears in a public output
- **WHEN** a proposed public excerpt is absent from the fetched page or a sender revision is stale
- **THEN** the result is rejected without persisting unsafe public text or misaddressed annotations

#### Scenario: Context changes during generation
- **WHEN** an included sender's item is deleted or loses edit authority before the result commits
- **THEN** stale annotations and scoring output are not committed
- **AND** existing public Findings remain readable under normal Topic rules

#### Scenario: A sender expands a shaped Finding in an MCP view
- **WHEN** a sender expands a row in the findings or search MCP view
- **THEN** their own annotation shows beneath the public explanation, read in one bounded query for the page
- **AND** the annotation reaches the MCP view alone, outside the text and structured content the model reads

#### Scenario: Another reader expands the same Finding in an MCP view
- **WHEN** a reader who is not its sender expands that row
- **THEN** the result holds no annotation for them and no sign that one exists

### Requirement: Documentation describes shipped confirmation and retention

The MCP guide and privacy policy SHALL explain deliberate sends, imports, forwarding, plan limits, Topic-owner-funded
summarization with sender-private summaries, model processing, retention, deletion, key/grant revocation, and
editable-Topic routing and sender-only private content. Existing policy coverage of collection, use/storage, sharing,
retention, and contact SHALL remain intact.

#### Scenario: A reader compares docs with the product
- **WHEN** the feature ships
- **THEN** the existing MCP documentation URL covers all nineteen tools and all confirmation paths
- **AND** the policy distinguishes uploaded export text from independent access to an assistant's history or memory
- **AND** no copy claims directory approval or unverified provider retention settings

## ADDED Requirements

### Requirement: Every Personal sources path uses one customer name

All feature copy SHALL use **Personal sources**, including AI Agent controls, the section in Topic info and Artisanal
Blend, docs, and accessibility labels. A received record SHALL use Personal Source Entry in domain identifiers and may
be called an item in customer copy.

#### Scenario: A user moves between confirmation paths
- **WHEN** the sender views AI Agent setup, Topic info, the Topic page, or their guides
- **THEN** the same Personal sources name identifies the feature on web, iPhone, and Android
- **AND** AI Agent and Email remain the individual Source-kind labels

### Requirement: One Personal sources item stays open at a time

The Personal sources item rows in Topic info and Artisanal Blend SHALL keep one item open at a time on web, iPhone, and
Android. Opening an item SHALL close the open item. The section row that holds the items SHALL open and close on its
own.

#### Scenario: A sender opens a second item
- **WHEN** a sender opens an item while another item is open
- **THEN** the open item closes, and the new item shows its content
- **AND** the Personal sources section stays open

#### Scenario: A sender closes the open item
- **WHEN** a sender presses the open item
- **THEN** the item closes, and no item is open

### Requirement: Shared Topic reads leave personal Sources out

A read that lists a Topic's Sources for anyone but their sender SHALL leave out personal `ai_agent` and `email` Sources.
This covers `list_topics`, chat retrieval, and `read_topic_context`.

#### Scenario: A follower lists a Topic

- **WHEN** a follower calls `list_topics` on a Topic with a personal Source
- **THEN** its Sources hold no `ai_agent` or `email` Source

#### Scenario: A chat turn on a shared Topic

- **WHEN** a chat turn's context lists the Topic's Sources
- **THEN** no personal Source's label reaches the model
