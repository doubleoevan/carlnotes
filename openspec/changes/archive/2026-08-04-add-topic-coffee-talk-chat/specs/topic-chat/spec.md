## ADDED Requirements

### Requirement: Chat is read-only over a Topic's existing curation output
A chat turn SHALL NOT write to `topics`, `findings`, `resources`, or `scans`, SHALL NOT revise a Topic's context, SHALL NOT create or modify a Finding, and SHALL NOT contribute any signal to relevance scoring. The only row a turn writes is its own Chat Turn record.

#### Scenario: A turn leaves the curation pipeline untouched
- **WHEN** a user sends a chat turn about a Topic
- **THEN** no `topics`, `findings`, `resources`, or `scans` row is inserted or updated, and only a `chat_turns` row is written

#### Scenario: Chat never influences the next Scan
- **WHEN** a Scan runs on a Topic that has had chat turns
- **THEN** the Scan's relevance scoring reads the same inputs it would have read with no chat turns at all

### Requirement: A turn's retrieval context is assembled from the Topic's own material
Each turn SHALL assemble its context from the Topic's prompt, the selected Findings with their relevance scores and relevance explanations, the stored Resource content behind those Findings, and the most recent Scan summaries. Resource text SHALL come from the Resource's stored content where a content key exists and SHALL fall back to its snippet otherwise.

#### Scenario: Context carries the Topic's prompt, Findings, Resource text, and Scan summaries
- **WHEN** a turn's retrieval context is assembled for a Topic with Findings and completed Scans
- **THEN** it contains the Topic's prompt, each selected Finding's relevance score and relevance explanation, that Finding's Resource text, and the recent Scan summaries

#### Scenario: A Resource with no stored content falls back to its snippet
- **WHEN** a selected Finding's Resource has no content key
- **THEN** the assembled context uses that Resource's snippet in place of full content

### Requirement: Retrieval ranks by vector similarity over the Topic's existing Resource embeddings
The turn's question SHALL be embedded with the same embedding model that produced `resources.embedding`, and candidate Resources SHALL be ranked by vector similarity against that question vector. The system SHALL NOT build a chat-specific retrieval index; the Topic's Finding set is already trimmed to the Topic's max-results.

#### Scenario: Candidates are ranked against the question
- **WHEN** a turn's question is embedded and the Topic's Findings are ranked
- **THEN** the Findings whose Resources are most similar to the question vector are the ones selected for context

#### Scenario: No separate chat index is created
- **WHEN** the retrieval path runs
- **THEN** it reads `resources.embedding` values written by the curation pipeline, and no chat-specific embedding table or column exists

### Requirement: Retrieval is restricted to Resources embedded by the current model
Candidate Resources SHALL be filtered to rows whose `embedding_model` matches the model currently used to embed the question. Resources embedded by any other model SHALL be excluded from ranking.

#### Scenario: A stale-model Resource is excluded
- **WHEN** a Topic holds Findings whose Resources carry an `embedding_model` other than the current one
- **THEN** those Resources are excluded from ranking and contribute nothing to the turn's context

#### Scenario: A partially backfilled Topic degrades visibly
- **WHEN** every one of a Topic's Resources carries a stale or absent `embedding_model`
- **THEN** the turn's context contains no retrieved Resources, and the reply states that the Topic has nothing indexed before offering any answer from general knowledge, rather than ranking unrelated material as if it were the Topic's

### Requirement: Replies distinguish Topic material from general knowledge
A reply SHALL lead with the Topic's own material where it answers the question, MAY draw on the model's general knowledge beyond it, and SHALL mark where an answer leaves the Topic's material, so a reader always knows what came from the Topic and what came from the model. A reply MAY link, but only to URLs the retrieved material or a search result actually carries — never a URL from the model's memory, since a remembered URL is a hallucination vector.

#### Scenario: A question beyond the findings gets a labeled answer
- **WHEN** a turn asks something the Topic's Findings do not cover
- **THEN** the reply says the findings do not cover it and may answer from general knowledge, marked as coming from the model rather than the Topic

#### Scenario: A cited finding links its real URL
- **WHEN** a reply cites a Finding whose URL rides in the retrieval context
- **THEN** it may link that title to that URL, and a source the material does not carry is named in words without a link

### Requirement: A turn carries the conversation before it, older exchanges compacted
Each turn SHALL carry the conversation's prior exchanges so the reply can resolve references like "that one" across turns. The newest exchanges SHALL ride word for word up to a character budget approximating tokens — so a verbose conversation compacts sooner than a terse one and the verbatim window's cost stays flat — with the newest exchange always verbatim. Older carried exchanges SHALL ride compacted: the question whole, since questions are the intent trail, and the answer mechanically trimmed to its opening with a visible cut. Trimming keeps the opening because the chat voice is engineered answer-first, putting the thesis where the trim preserves it. One shared boundary walk SHALL serve the client's clip, the model's messages, and the panel's divider, and the history SHALL be client-carried, bounded in total depth and per-message length at the api, with retrieval ranking still running against the latest question alone.

#### Scenario: A follow-up resolves a reference
- **WHEN** a reader asks a follow-up that points back at an earlier reply, like "how long will that one take"
- **THEN** the reply resolves the reference using the carried conversation

#### Scenario: The conversation's start survives past the memory window
- **WHEN** a conversation grows past the memory window
- **THEN** the earliest carried exchanges still reach the model with whole questions and trimmed answers, rather than dropping away

#### Scenario: An oversized history is refused
- **WHEN** a request carries more history than the contract's carried bound
- **THEN** the turn is refused by validation before any retrieval or generation runs

### Requirement: Live web search is a signed-in capability
A signed-in turn MAY invoke a live web search tool a bounded number of times before answering, and each search's cost SHALL be recorded on the turn alongside its token cost. An anonymous turn SHALL NOT trigger any paid web search, so the unauthenticated side of a public Topic can never spend against a third-party API. Whether a turn may search SHALL be answered by the authorization gate.

#### Scenario: A signed-in turn's searches bill the turn
- **WHEN** a signed-in turn runs web searches on its way to an answer
- **THEN** the turn's recorded cost includes the searches at the per-search rate, drawing from the same monthly pool

#### Scenario: An anonymous turn never searches
- **WHEN** a signed-out visitor takes a turn on a public Topic
- **THEN** no web search tool is available to the turn and no search spend can occur

#### Scenario: A failed search degrades the answer, not the turn
- **WHEN** the search provider is unreachable or errors during a turn
- **THEN** the reply continues from the Topic's material and general knowledge, and the turn is not failed

### Requirement: The generation model is a LiteLLM alias at the synthesis tier and replies stream
The reply SHALL be generated through a named LiteLLM alias, not a hardcoded model name, and that alias SHALL sit at the synthesis tier rather than the cheap scoring tier. The reply SHALL be streamed to the client so time-to-first-token stays low.

#### Scenario: Generation routes through the alias
- **WHEN** a chat turn generates a reply
- **THEN** the request names the chat alias and no provider-specific model identifier appears in application code

#### Scenario: The reply streams
- **WHEN** a chat turn is sent
- **THEN** reply text reaches the client incrementally as it is generated, rather than only after generation completes

### Requirement: Chat access reuses the Topic view rule for signed-in users
A signed-in user SHALL be permitted to chat about a Topic exactly when they are permitted to view it, resolved through the existing authorization gate, with no second access rule introduced for chat. A signed-out visitor SHALL NOT be able to send a turn: the api SHALL refuse an anonymous turn outright, so no anonymous request ever spends against a model.

#### Scenario: A subscriber chats about an invite Topic
- **WHEN** a signed-in user with an active subscription to an invite Topic sends a chat turn
- **THEN** the turn is allowed

#### Scenario: A stranger is refused on a private Topic
- **WHEN** a user who cannot view a private Topic sends a chat turn about it
- **THEN** the turn is refused

#### Scenario: An anonymous turn is refused by the api
- **WHEN** a signed-out caller posts a chat turn directly to the api
- **THEN** it is refused as needing sign-up and no retrieval or generation runs

### Requirement: Attachment-derived context is owner-only
Attachment-derived context SHALL be included in a turn's retrieval context only when the requesting user is the Topic's owner, matching the existing attachment download gate. A non-owner chatting about a Topic SHALL receive its Findings, Scan summaries, and prompt, and never the owner's uploaded documents.

#### Scenario: The owner's chat sees attachment context
- **WHEN** a Topic's owner sends a chat turn on a Topic with processed attachments
- **THEN** the attachment-derived context is part of the turn's retrieval context

#### Scenario: A non-owner's chat excludes attachment context
- **WHEN** a non-owner sends a chat turn about a public Topic with processed attachments
- **THEN** the turn's retrieval context contains no attachment-derived material

### Requirement: Each turn is metered against the account's monthly spend budget
A turn's estimated cost SHALL be checked against the user's remaining monthly spend budget before generation, drawing from the same per-account pool manual-scan overage draws from. A turn that would exceed the remaining budget SHALL be refused with an upgrade prompt and SHALL NOT be billed. A completed turn's cost SHALL be recorded using the same best-effort token-cost tally curation uses.

#### Scenario: A turn within budget proceeds and records its cost
- **WHEN** a user with remaining monthly budget sends a chat turn
- **THEN** the reply is generated and the turn's estimated cost is recorded against that user

#### Scenario: A turn over budget is blocked, not billed
- **WHEN** a user's remaining monthly budget cannot cover an estimated turn
- **THEN** the turn is refused with an upgrade prompt, no generation runs, and no cost is recorded

#### Scenario: Chat spend and scan spend share one pool
- **WHEN** a user's chat spend and scan spend together reach their effective monthly budget
- **THEN** both further chat turns and further manual Scans are blocked

### Requirement: Stored chat text is encrypted at the application layer
A persisted turn's question and answer SHALL be encrypted with AES-256-GCM under a key from the environment before they reach the database, so a database console reader sees ciphertext rather than conversations. Rows written before encryption SHALL keep reading as plaintext, a value that fails to verify SHALL drop its text and never the row's cost, and an unset key SHALL store plaintext, so a self-hosted instance runs without one. A malformed key SHALL fail loudly rather than silently storing plaintext.

#### Scenario: A stored turn is ciphertext
- **WHEN** a turn persists with the encryption key configured
- **THEN** its question and answer store as marked ciphertext that contains no plaintext

#### Scenario: A pre-encryption row still reads
- **WHEN** a row stored before encryption is replayed
- **THEN** its text passes through unchanged

#### Scenario: A tampered or wrong-key row drops its text, not its cost
- **WHEN** a stored value fails to decrypt
- **THEN** the exchange is omitted from the replay while the row's cost keeps counting in every spend sum

### Requirement: Every signed-in conversation persists server-side
A signed-in reader's conversation with a Topic SHALL be kept server-side on every plan, surviving reloads, sign-outs, and devices, and SHALL be resolved through the authorization gate rather than a plan comparison at any call site. A page load SHALL replay the whole stored conversation in reading order, and the panel SHALL virtualize a long list so scrolling the full history never mounts every exchange at once. Plans SHALL differentiate on budgets, scans, and topics — the cost drivers — not on chat memory.

#### Scenario: A conversation survives across visits
- **WHEN** any signed-in user returns to a Topic page they have chatted about
- **THEN** the prior turns are shown from the server's record, on any device

#### Scenario: A page load replays the whole conversation
- **WHEN** a conversation has grown long
- **THEN** the page load carries every stored turn in reading order, and the panel scrolls the full history through a virtualized list

#### Scenario: Persistence is asked of the gate
- **WHEN** the system decides whether to store a turn's text
- **THEN** it asks the authorization gate for the persistence capability and performs no plan or tier comparison of its own

### Requirement: A conversation can be cleared without erasing its spend
A signed-in reader SHALL be able to clear their conversation with a Topic from the panel, behind a confirmation. Clearing SHALL null the stored question and answer text on the reader's own rows — everywhere they are signed in — while the rows and their recorded costs remain, so the spend ledger survives the wipe. An anonymous request to clear SHALL be refused.

#### Scenario: Clearing empties the conversation everywhere
- **WHEN** a signed-in reader confirms clearing a Topic's chat
- **THEN** the conversation shows empty on every device from then on

#### Scenario: Clearing keeps the ledger
- **WHEN** a conversation with recorded turn costs is cleared
- **THEN** every cleared turn's cost keeps counting in spend sums and admin totals

#### Scenario: An anonymous clear is refused
- **WHEN** a request to clear arrives without a signed-in user
- **THEN** the api refuses it and stores nothing

### Requirement: Chat spend renders as its own segment of the account spend meter
The account page's monthly spend meter SHALL render chat spend as a distinct colored segment from scan spend within the same bar, against the same budget.

#### Scenario: The meter separates chat spend from scan spend
- **WHEN** a user with both chat spend and scan spend this month views their account page
- **THEN** the spend bar shows two distinguishable segments against one budget total

### Requirement: A turn can carry attachments to the model without storing them
A turn MAY carry a bounded number of attachments: an image or a pdf as a data url, or text — a text file or a long paste — as raw text, each kind held to its own capped payload field under its own media type. A pdf SHALL resolve into its extracted text at the api before generation, so only its words reach the model, and an unreadable pdf SHALL refuse the turn in words. Attachments SHALL ride to the model on that turn only — images as image parts, text folded under the question by name — and SHALL never persist or ride carried history; the stored question SHALL instead carry a note naming what was attached, so the transcript and the live bubble read identically. Unsupported file types SHALL be refused with an explanation at the composer, and the api SHALL bound the request body.

#### Scenario: An image reaches the model and leaves only a note
- **WHEN** a turn sends with an attached image
- **THEN** the model receives the image as its own message part, and the stored question carries a note naming the attachment while no image bytes persist

#### Scenario: Text attachments fold under the question
- **WHEN** a turn sends with a text file or folded paste attached
- **THEN** the model receives the text under the attachment's name within the question's message, clipped to the contract's cap

#### Scenario: A mismatched attachment payload is refused
- **WHEN** a request smuggles text in an image attachment or a data url in a text one
- **THEN** the api refuses the payload
