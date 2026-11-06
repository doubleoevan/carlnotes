# personal-sources Specification

## Purpose
Let editors contribute personal research context and links to Topics while keeping each sender’s private material isolated, with one encrypted Personal Source Entry lifecycle and consistent web and mobile controls.

## Requirements

### Requirement: Personal sources accept contributions on editable Topics

The system SHALL accept AI Agent sends, imports, and authenticated email on any Topic the sender can edit, regardless of visibility or Team ownership. Every item and summary SHALL remain readable only by its sender, including from the Topic owner or an administrator.

#### Scenario: An editor contributes to a shared Topic
- **WHEN** an authorized user sends to a public, invite, private, or owning-Team Topic they can edit
- **THEN** the content belongs to that sender and destination Topic and can affect its scoring
- **AND** no other sender's content is read or changed

#### Scenario: Read access does not grant sending
- **WHEN** a follower, holding-Team member, or other reader lacks Topic edit permission
- **THEN** the send creates no item or Source and an inaccessible Topic remains indistinguishable from missing

#### Scenario: A privileged reader requests another sender's item
- **WHEN** a Topic owner, Team leader, or administrator requests another sender's text, links, or summary
- **THEN** no private content, counts, or provenance are returned

### Requirement: One Personal Source Entry records each accepted destination

A Personal Source Entry SHALL identify its Source, Topic, sender account, origin (`send`, `email`, or `import`), sender, title, text, links, optional chat reference, received and summarization times. Private payload fields SHALL be encrypted at rest. Identifiers SHALL use Personal Source Entry vocabulary; customer copy may say item.

#### Scenario: A send is stored
- **WHEN** a valid delivery is accepted
- **THEN** each accepted destination records one entry with its provenance and encrypted payload
- **AND** a Source/Topic/sender mismatch cannot be stored

#### Scenario: Encryption is unavailable
- **WHEN** the encryption key is missing, invalid, or cannot decrypt stored content
- **THEN** a write fails without storing plaintext and a read never returns corrupt or fallback plaintext

### Requirement: Explicit deletion removes active context

Sends, emails, and imported conversations SHALL remain encrypted until explicit deletion. Deleted entries SHALL disappear from Personal sources reads, queued links, and usable context. Age SHALL not delete entries or existing Findings. Released read payloads SHALL preserve nullable expiry fields as null.

#### Scenario: An old item remains
- **WHEN** a send, email, or imported conversation is older than thirty days
- **THEN** it remains readable and eligible for bounded context until explicitly deleted
- **AND** newest retained entries are selected first when the model input limit is reached

#### Scenario: A sender deletes an entry
- **WHEN** deletion succeeds during an in-flight rewrite
- **THEN** the old context is invalidated and late model output cannot restore the deleted material
- **AND** existing public-link Findings retain their normal Topic visibility and contain only public explanations

#### Scenario: A parent is deleted
- **WHEN** a Source, Topic, or account is deleted
- **THEN** its entries and unused links are deleted and pending work cannot recreate them

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

### Requirement: Email requires no forwarding setup

Topic editors SHALL NOT show a Personal sources setup section, source management, connection notices, or import controls. Account controls SHALL NOT show forwarding setup or receiving addresses. AI Agent connections SHALL remain managed through account settings. The only in-app receiving-address display SHALL be one hint line with Copy in empty Personal sources content. Topics without live items SHALL retain their existing hidden-section behavior. Detailed instructions SHALL remain in the docs.

#### Scenario: The sender opens the Topic editor
- **WHEN** the sender edits a Topic
- **THEN** no Personal sources setup section, source deletion, connection notice, import action, forwarding address, or Topic hint example appears
- **AND** saved Personal sources items remain available in Topic info and Artisanal Blend

#### Scenario: Open Personal sources content becomes empty
- **WHEN** the current item list becomes empty while its content is mounted
- **THEN** its only email guidance is **Forward or reply to Carl at <configured address>.** with Copy
- **AND** Copy uses the environment's mailbox and opening the view creates no Source

### Requirement: Both placements reuse one shared expandable row

Personal sources item rows in Topic info and Artisanal Blend SHALL render `packages/core/components/ExpandableRow.tsx` on web, iPhone, and Android. The primitive SHALL have a Nightshift contract and same-name implementations and stories on both apps. Thin adapters SHALL preserve shared state, composition, formatting, and behavior.

#### Scenario: Both surfaces render on each platform
- **WHEN** the item rows in both placements are inspected
- **THEN** both use the shared ExpandableRow implementation and corresponding stories identify their web references
- **AND** keyboard/screen-reader expansion state, focus, native touch targets, both themes, and 200% text remain usable

### Requirement: New feature components share their composition

Every new Personal sources feature component SHALL keep its composition in `packages/core/components`, with same-name web and mobile wrappers where platform controls are required. Preflight SHALL enforce the Nightshift primitive contract and component reuse.

#### Scenario: Primitive and feature reuse is checked before shipping
- **WHEN** preflight checks the Personal sources components
- **THEN** `packages/nightshift/components/expandable-row.ts` has an implementation and story at `components/primitives/expandable-row` on each platform
- **AND** the new feature wrappers render their same-name core component, including the import button and dialog
- **AND** release evidence records the component parity counts and any deferred device checks

### Requirement: Personal sources controls preserve sender privacy

Every private control and response SHALL be scoped to the authenticated sender before decryption, including counts, summary, titles, details, and outcomes. Sending a chat or email creates its receiving Source without setup in the Topic editor. A former editor with Topic read access can inspect their retained items in the shared Personal sources section. Unmounting or switching accounts SHALL release private cached data and prevent stale requests from repopulating another view.

#### Scenario: Two editors read one Topic
- **WHEN** each editor opens Personal sources
- **THEN** each sees only their own items, counts, and summary, even if one owns the Topic

#### Scenario: A visitor or another sender requests private data
- **WHEN** a viewer lacks the matching sender identity
- **THEN** no private data is returned through UI, API, caches, or server-rendered markup

#### Scenario: The sender closes a view or switches accounts
- **WHEN** a view unmounts or the active account changes during a pending request
- **THEN** private pages are released and no previous-sender content appears in another view

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

### Requirement: Existing clients preserve Personal sources state

Released mobile response contracts SHALL remain compatible. Older clients that cannot represent Personal sources SHALL neither receive unsupported Source enum values nor delete hidden Personal sources when saving a Topic.

#### Scenario: An old mobile editor saves
- **WHEN** a frozen client saves a Topic after a Personal source was created
- **THEN** the response remains readable by that client and the Personal source and entries remain intact

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

### Requirement: Shared PlanCards describe Personal sources capabilities

The shared PlanCard SHALL show checkmarked “Send AI chats to Carl to read for your topics” on every plan and “Send emails to Carl to read for your topics” on Plus and Premium only. Web and mobile SHALL consume the same composition and capability rules. Cards SHALL NOT display the daily send ceiling.

#### Scenario: Plans are compared on either platform
- **WHEN** Free, Plus, and Premium cards render for monthly or yearly billing
- **THEN** every card has the exact AI-chat line with a checkmark, and only Plus/Premium have the exact email line with a checkmark
- **AND** no daily-send ceiling row is shown, while existing prices, quotas, and purchase actions retain their behavior

### Requirement: AI conversation links identify their destination

An entry with a valid conversation reference SHALL link its date, destination platform name, and mark as one body-size Nightshift link, underlined by default and followed by a launch icon, on web and mobile. Identify the platform by exact host and supported path aliases. Unknown destinations SHALL retain the authenticated sender label with a generic mark. Missing references SHALL render plain metadata. Never invent a URL or publish a chat to obtain one.

#### Scenario: A verified Codex local chat
- **WHEN** the host supplies `codex://threads/<verified-thread-id>` for an existing local chat
- **THEN** the linked metadata opens the installed Codex app
- **AND** settings, new-chat actions, malformed IDs, query parameters, and fragments are refused

#### Scenario: Regular Claude and Claude Code references
- **WHEN** a sender opens entries referencing `claude.ai/chat/example` and `claude.ai/code/example`
- **THEN** the first uses the regular Claude mark and the second uses the Claude Code mark within the linked metadata

#### Scenario: Platform examples in Nightshift
- **WHEN** a reviewer opens the conversation-platform gallery in either component browser
- **THEN** Codex, Claude, Claude Code, ChatGPT, Gemini, Grok, Perplexity, DeepSeek, Cursor, Copilot, unknown-host, and missing-URL examples use the production sender adapters
- **AND** Gemini short links, Cursor shared transcripts, and Microsoft 365 aliases preserve their destination and platform mark

### Requirement: Expanded Personal sources metadata uses date and sender identity

Web and mobile SHALL share the expanded entry metadata content. Show the received date without time or UTC. AI sends SHALL show the known conversation destination mark and name, falling back to the authenticated sender label without a recognized reference, without a “send” suffix. Email SHALL show the mail icon followed by the sender address, without an “email” suffix. Unknown AI platforms SHALL use the generic chat mark. Preserve explicit deletion controls.

#### Scenario: A sender opens an AI send and an email
- **WHEN** either platform renders their expanded entries
- **THEN** both show the same date, AI or mail icon, sender label, and Delete action, without an inline retention notice

### Requirement: Personal sources remain encrypted until deletion

AI sends, email items, and imported conversations SHALL remain encrypted until explicitly deleted through the existing entry, Source, Topic, or account lifecycle. Existing retained items SHALL follow the same rule. Content age SHALL not automatically remove items, invalidate context, or schedule deletion. Sender-only authorization and bounded private processing SHALL remain enforced.

#### Scenario: An item is older than thirty days
- **WHEN** an authorized sender reads or uses an old item
- **THEN** it remains available with its original encrypted content and eligible for bounded Topic context
- **AND** the interface shows no expiry date or retention sentence in the entry details

#### Scenario: The sender deletes an old item
- **WHEN** an item is explicitly deleted
- **THEN** its unused links are removed and its private derived context and annotations are invalidated under revision guards
- **AND** other senders' retained data remains private and unchanged

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
