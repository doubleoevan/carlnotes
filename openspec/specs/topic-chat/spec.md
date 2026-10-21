# topic-chat Specification

## Purpose
TBD - created by archiving change add-topic-coffee-talk-chat. Update Purpose after archive.
## Requirements
### Requirement: A turn's retrieval context is assembled from the Topic's own material
Each turn SHALL assemble its context from the Topic's prompt, the selected Findings with their relevance scores and relevance explanations, the stored Resource content behind those Findings, and the most recent Scan summaries. Resource text SHALL come from the Resource's stored content where a content key exists and SHALL fall back to its snippet otherwise.

#### Scenario: Context carries the Topic's prompt, Findings, Resource text, and Scan summaries
- **WHEN** a turn's retrieval context is assembled for a Topic with Findings and completed Scans
- **THEN** it contains the Topic's prompt, each selected Finding's relevance score and relevance explanation, that Finding's Resource text, and the recent Scan summaries

#### Scenario: A Resource with no stored content falls back to its snippet
- **WHEN** a selected Finding's Resource has no content key
- **THEN** the assembled context uses that Resource's snippet in place of full content

### Requirement: Retrieval ranks by vector similarity over the Topic's existing Resource embeddings
The turn's question SHALL be embedded with the same embedding model that produced `resources.embedding`, and candidate
Resources SHALL be ranked by vector similarity against that question vector. The ranking SHALL be exact: the query SHALL
first collect the Topics' shown Findings with their Resources in a materialized common table expression and then order
that set by distance, so the planner never serves it from the global HNSW index, whose approximate walk returns the
nearest Resources of the whole table before the Topic filter and can leave a Topic's results short or empty. This covers
the single-Topic ranking that chat and the MCP search tool use and the multi-Topic ranking a Team's chat uses. The
global duplicate check keeps the HNSW index, which is the right use of it. The system SHALL NOT build a chat-specific
retrieval index; the Topic's Finding set is already trimmed to the Topic's max-results.

#### Scenario: Candidates are ranked against the question
- **WHEN** a turn's question is embedded and the Topic's Findings are ranked
- **THEN** the Findings whose Resources are most similar to the question vector are the ones selected for context

#### Scenario: No separate chat index is created
- **WHEN** the retrieval path runs
- **THEN** it reads `resources.embedding` values written by the review pipeline, and no chat-specific embedding table
  or column exists

#### Scenario: A topic's findings all come back
- **WHEN** a Topic holds eight shown Findings and thousands of other Topics' Resources sit closer to the question
- **THEN** the ranking returns all eight, up to the limit, ordered by distance

#### Scenario: The ranking uses no HNSW scan
- **WHEN** `explain` runs on the Topic ranking query
- **THEN** the plan holds no index scan on `resources_embedding_hnsw`

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

#### Scenario: An oversized history is rejected
- **WHEN** a request carries more history than the contract's carried bound
- **THEN** the turn is rejected by validation before any retrieval or generation runs

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
A signed-in user SHALL be permitted to chat about a Topic exactly when they are permitted to view it, resolved through
the existing authorization gate, with no second access rule introduced for chat. A signed-out visitor SHALL NOT be able
to send a turn: the api SHALL reject an anonymous turn outright, so no anonymous request ever spends against a model.

The transcription and speech routes SHALL ask the same gate for the page they name, so a user may talk to Carl exactly
where they may chat. The spoken events route SHALL ask the page's access alone, with no spend check. An anonymous
request to any of the voice routes SHALL be rejected outright.

#### Scenario: A subscriber chats about an invite Topic
- **WHEN** a signed-in user with an active subscription to an invite Topic sends a chat turn
- **THEN** the turn is allowed

#### Scenario: A stranger is rejected on a private Topic
- **WHEN** a user who cannot view a private Topic sends a chat turn about it
- **THEN** the turn is rejected

#### Scenario: An anonymous turn is rejected by the api
- **WHEN** a signed-out caller posts a chat turn directly to the api
- **THEN** it is rejected as needing sign-up and no retrieval or generation runs

#### Scenario: A stranger's recording is rejected
- **WHEN** a signed-in user who may not view a private Topic posts a recording for it
- **THEN** the route rejects it as the chat turn would, and no model is called

### Requirement: Attachment-derived context is owner-only
Attachment-derived context SHALL be included in a turn's retrieval context only when the requesting user is the Topic's owner, matching the existing attachment download gate. A non-owner chatting about a Topic SHALL receive its Findings, Scan summaries, and prompt, and never the owner's uploaded documents.

#### Scenario: The owner's chat sees attachment context
- **WHEN** a Topic's owner sends a chat turn on a Topic with processed attachments
- **THEN** the attachment-derived context is part of the turn's retrieval context

#### Scenario: A non-owner's chat excludes attachment context
- **WHEN** a non-owner sends a chat turn about a public Topic with processed attachments
- **THEN** the turn's retrieval context contains no attachment-derived material

### Requirement: Each turn is metered against the account's monthly spend budget
A turn's estimated cost SHALL be checked against the user's remaining monthly spend budget before generation, drawing
from the same per-account pool manual-scan overage draws from. A turn that would exceed the remaining budget SHALL be
rejected with an upgrade prompt and SHALL NOT be billed. Every private chat SHALL count that rejection as a
`chat_budget_reached` event: a Topic's chat, a Team's chat, and the new-topic chat. A completed turn's cost SHALL be
recorded beside its token total, using the same best-effort token-cost tally a scan's review uses.

A transcription and each spoken part of a reply SHALL be recorded as their own chat spend rows, with no text, so they
draw from the same pool and count toward it. A spent budget SHALL reject a recording and a spoken part with the same
upgrade prompt, before any model is called.

#### Scenario: A turn within budget proceeds and records its cost
- **WHEN** a user with remaining monthly budget sends a chat turn
- **THEN** the reply is generated, and the turn's estimated cost and its token total are recorded against that user

#### Scenario: A turn over budget is blocked, not billed
- **WHEN** a user's remaining monthly budget cannot cover an estimated turn
- **THEN** the turn is rejected with an upgrade prompt, no generation runs, no cost is recorded, and one
  `chat_budget_reached` event is counted for that user

#### Scenario: Every private chat counts a budget rejection
- **WHEN** a user whose monthly budget is spent sends a turn in a Team's chat or in the new-topic chat
- **THEN** the turn is rejected as a Topic chat turn would be, and one `chat_budget_reached` event is counted for that
  user

#### Scenario: Chat spend and scan spend share one pool
- **WHEN** a user's chat spend and scan spend together reach their effective monthly budget
- **THEN** both further chat turns and further manual Scans are blocked

#### Scenario: Voice spend counts as chat spend
- **WHEN** a user sends a spoken question and Carl's reply is spoken in two spoken parts
- **THEN** three chat spend rows are written beside the turn's own row, and the monthly spend sum includes them

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
A signed-in reader's conversation with a Topic SHALL be kept server-side on every plan, surviving reloads, sign-outs,
and devices, and SHALL be resolved through the authorization gate rather than a plan comparison at any call site. A page
load SHALL replay the whole stored conversation in reading order, and the panel SHALL virtualize a long list so
scrolling the full history never mounts every exchange at once. Plans SHALL differentiate on budgets, scans, and topics
— the cost drivers — not on chat memory.

A stored turn SHALL keep whether its question was spoken, and the replay SHALL carry it, so a reload and another device
still read the turn as spoken. The replay SHALL read only the rows with question and answer text, so a voice spend row
never becomes an exchange.

#### Scenario: A conversation survives across visits
- **WHEN** any signed-in user returns to a Topic page they have chatted about
- **THEN** the prior turns are shown from the server's record, on any device

#### Scenario: A page load replays the whole conversation
- **WHEN** a conversation has grown long
- **THEN** the page load carries every stored turn in reading order, and the panel scrolls the full history through a
  virtualized list

#### Scenario: Persistence is asked of the gate
- **WHEN** the system decides whether to store a turn's text
- **THEN** it asks the authorization gate for the persistence capability and performs no plan or tier comparison of its
  own

#### Scenario: A spoken turn replays spoken
- **WHEN** a conversation with one spoken turn reloads
- **THEN** the replay carries that turn as spoken and the others as not, and no message shows a mic icon

### Requirement: A conversation can be cleared without erasing its spend
A signed-in reader SHALL be able to clear their conversation with a Topic from the panel, behind a confirmation. Clearing SHALL null the stored question and answer text on the reader's own rows — everywhere they are signed in — while the rows and their recorded costs remain as spend rows, so the month's spend survives the wipe. An anonymous request to clear SHALL be rejected.

#### Scenario: Clearing empties the conversation everywhere
- **WHEN** a signed-in reader confirms clearing a Topic's chat
- **THEN** the conversation shows empty on every device from then on

#### Scenario: Clearing keeps the spend rows
- **WHEN** a conversation with recorded turn costs is cleared
- **THEN** every cleared turn's cost keeps counting in spend sums and admin totals

#### Scenario: An anonymous clear is rejected
- **WHEN** a request to clear arrives without a signed-in user
- **THEN** the api rejects it and stores nothing

### Requirement: Chat spend renders as its own segment of the account spend meter
The account page's monthly spend meter SHALL render chat spend as a distinct colored segment from scan spend within the same bar, against the same budget.

#### Scenario: The meter separates chat spend from scan spend
- **WHEN** a user with both chat spend and scan spend this month views their account page
- **THEN** the spend bar shows two distinguishable segments against one budget total

### Requirement: A reader can keep a chat attachment as durable per-topic memory

A signed-in reader's chat attachments SHALL default to kept, with a per-chip toggle to make any of them
ride the turn only — remembering is the expectation attaching sets, so opting out is the deliberate act,
not opting in. A kept attachment SHALL persist independently of that turn and of conversation history:
its original content stored (encrypted for text, object storage for image, pdf, document, and video), and
a compact summary generated once — except a video, whose stored context SHALL be a fixed line naming the
file, since there is nothing to read or describe. That summary SHALL ride into every future turn the same
reader takes on the same topic, scoped to that (reader, topic) pair only — never shared into another
reader's conversation, and never gated by topic ownership. Persistence SHALL be best-effort and SHALL NOT
block or fail the turn it was attached to.

#### Scenario: A kept attachment survives conversation compaction
- **WHEN** a reader keeps an attachment and the conversation later grows well past the verbatim memory window
- **THEN** the kept attachment's summary still rides into the reader's next turn, unaffected by history compaction

#### Scenario: A non-owner's kept attachment is scoped to them alone
- **WHEN** a signed-in reader who does not own the topic keeps an attachment
- **THEN** it feeds only that reader's own future turns on the topic, and neither the owner's nor any other reader's turns include it

#### Scenario: A kept item's ongoing cost stays bounded
- **WHEN** a large document is kept
- **THEN** future turns include its one-time-generated summary, never the original document's full text

#### Scenario: A kept video stores its bytes and a fixed line
- **WHEN** a reader keeps a video
- **THEN** its bytes store by object key and download back, its context is a fixed line naming the file, and no description model call runs

#### Scenario: A kept document summarizes once

- **WHEN** a reader keeps a Word file or workbook attached to a chat turn
- **THEN** its extracted words are screened and summarized once, and that summary rides their later turns on the topic

### Requirement: Kept attachments are capped and bounded per reader per topic

A reader MAY hold at most a fixed number of kept attachments per topic. The composer SHALL reject the keep toggle at the limit and say why, so the bookmark never promises a memory that will not persist — never evicting an existing kept attachment to make room, since silently forgetting something deliberately kept is worse than rejecting something new. The server SHALL enforce the same limit as a backstop, without blocking or erroring the turn that included the attempt. Only kept attachments SHALL count against the limit; an image stored for a question's bubble alone SHALL NOT take a slot.

#### Scenario: The keep toggle rejects at the cap with a reason
- **WHEN** a reader at the limit tries to mark another attachment to keep
- **THEN** the toggle does not flip and a message says the topic's kept memory is full

#### Scenario: At the cap, a new attachment falls back to this turn only
- **WHEN** a reader at the limit attaches something new
- **THEN** it attaches with keep off and a message says it rides this turn only

#### Scenario: A cap-exceeding keep that reaches the server is skipped, never evicting
- **WHEN** a keep past the limit arrives at the server anyway
- **THEN** the turn completes normally, no existing kept attachment is removed, and the new attachment is not kept — stored against its turn if it is an image, and stored not at all otherwise

#### Scenario: Images stored for the transcript leave the cap alone
- **WHEN** a reader sends many unkept images on one topic
- **THEN** their kept attachment count is unchanged and the keep toggle still accepts

### Requirement: A reader can delete their own kept attachments

The composer SHALL offer a manage control, present only when the reader keeps at least one attachment for the topic,
listing their kept attachments by name with a per-item delete. Deleting SHALL remove the row and its stored object,
free a slot under the limit, and SHALL be scoped to the keeper — one reader can never delete another reader's kept
attachment. A delete naming a kept attachment the reader does not own, or an id no kept attachment has, SHALL respond
404, so the route never confirms that another reader's attachment exists.

#### Scenario: Deleting a kept attachment frees its slot
- **WHEN** a reader at the limit deletes a kept attachment and marks a new one to keep
- **THEN** the delete succeeds, the keep toggle accepts, and the new attachment persists

#### Scenario: The manage control hides with nothing to manage
- **WHEN** a reader keeps nothing for the topic
- **THEN** the composer shows no manage control

#### Scenario: A delete is scoped to its keeper
- **WHEN** a request tries to delete a kept attachment belonging to another reader
- **THEN** the api responds 404 and the attachment remains

#### Scenario: An unknown id responds 404
- **WHEN** a request tries to delete an id no kept attachment has
- **THEN** the api responds 404, the same as for another reader's attachment

### Requirement: Kept attachments cascade with their owning topic or account

Deleting a topic SHALL delete every kept attachment associated with it. Deleting an account SHALL delete every kept attachment that reader holds. Clearing a chat conversation SHALL delete that reader's kept attachments for that topic, since a kept file is conversation memory and clearing the conversation is a request to forget it. Each of these SHALL delete the stored object as well as its row, so nothing is left billing storage that no row accounts for.

#### Scenario: A deleted topic takes its readers' kept attachments with it
- **WHEN** a topic with readers' kept attachments is deleted
- **THEN** every kept attachment tied to that topic is deleted, for every reader who held one, objects as well as rows

#### Scenario: Clearing chat forgets what it kept
- **WHEN** a reader clears their conversation with a topic
- **THEN** the attachments they had kept for that topic are deleted and stop feeding future turns, while another reader's kept attachments on the same topic are untouched

### Requirement: A turn carries attachments to the model, and its images are stored

A turn MAY include a bounded number of attachments: an image, a pdf, or a document — a Word file or a
workbook — as a data url, or text, a text file or a long paste, as raw text, each kind held to its own
limited payload field under its own media type. A pdf and a document SHALL each resolve into extracted
text at the api before generation, read through the media type the data url itself declares, so only
their words reach the model, and an unreadable one SHALL reject the turn in words. Attachments SHALL
reach the model on that turn only — images as image parts, text folded under the question by name — and
SHALL never ride stored history; the stored question SHALL include a note naming what was attached, so
the transcript and the live bubble read identically. Unsupported file types SHALL be rejected with an
explanation at the composer, and the api SHALL bound the request body.

The composer's file picker SHALL offer exactly the types this path takes, and a test SHALL hold the two
in step, so widening the picker can never offer a file the turn then rejects.

Every image a turn includes SHALL be stored against that turn, whether or not the reader kept it, so the question can show it again later. An image the reader did not keep SHALL be stored with no generated summary and SHALL NOT reach the model on any later turn, so an unkept image costs no tokens beyond the turn that sent it. A pdf or text attachment the reader did not keep SHALL NOT be stored. Storing SHALL be best-effort and SHALL NOT block or fail the turn that included the attachment.

#### Scenario: An image reaches the model and is stored against its turn
- **WHEN** a turn sends with an attached image
- **THEN** the model receives the image as its own message part, the stored question includes a note naming the attachment, and the image is stored against that turn

#### Scenario: An unkept image never reaches a later turn
- **WHEN** a reader sends an image with keep off and then takes another turn on the same topic
- **THEN** the later turn's context includes nothing derived from that image

#### Scenario: An unkept pdf leaves nothing stored
- **WHEN** a turn sends with a pdf attached and keep off
- **THEN** the pdf's words reach the model on that turn and no pdf bytes are stored

#### Scenario: A turn that stores no text stores no unkept image
- **WHEN** a reader whose turns do not persist sends a question with an unkept image
- **THEN** the turn records its spend, stores no question text, and stores no image

#### Scenario: Text attachments fold under the question
- **WHEN** a turn sends with a text file or folded paste attached
- **THEN** the model receives the text under the attachment's name within the question's message, clipped to the contract's limit

#### Scenario: A mismatched attachment payload is rejected
- **WHEN** a request smuggles text in an image attachment or a data url in a text one
- **THEN** the api rejects the payload

#### Scenario: A Word file's words reach the model

- **WHEN** a reader attaches a `.docx` or `.xlsx` to a chat turn
- **THEN** its text is extracted at the api and folded under the question, and the file itself never reaches the model

#### Scenario: An unreadable document rejects the turn

- **WHEN** a document attachment cannot be read
- **THEN** the turn is rejected in words instead of being sent without it

### Requirement: A stored question shows the images it was sent with

A stored question SHALL show every image sent with it, in its own bubble, read from the reader's stored copy instead of from the browser that sent it. The images SHALL appear on a fresh page load and on any other device the same reader signs in from. Each image SHALL be shown at a size that keeps the bubble readable and SHALL link to the full file, opened away from the app so the client router never claims the api path as one of its own routes. An attachment of any other kind SHALL NOT be shown in place, since the stored question already names it.

The conversation load SHALL return each stored turn's attachments as an id, a kind, and a name, the same shape a room message has, ordered as they were stored. A turn that included nothing SHALL return an empty list.

#### Scenario: An image reappears after a full reload
- **WHEN** a reader sends a question with an image and later reloads the topic page
- **THEN** the question's bubble shows that image, and clicking it opens the full file away from the app

#### Scenario: The conversation reads the same on another device
- **WHEN** the same reader opens that topic's conversation signed in on another device
- **THEN** the question's bubble shows the same image

#### Scenario: A pdf sent with a question is named, not shown
- **WHEN** a reader sends a question with a pdf attached
- **THEN** the question's note names the pdf and the bubble shows no image for it

#### Scenario: A turn that carried nothing shows nothing
- **WHEN** a stored turn carried no attachments
- **THEN** its bubble shows the question and no attachment of any kind

### Requirement: A chat attachment downloads to the reader who sent it, kept or not

The chat attachment download route SHALL serve a stored attachment to the signed-in reader who sent it, whether or not they kept it, and SHALL answer not found to every other reader. An image of a media type a browser renders safely SHALL be served in place, so a question's bubble can show it. Every other stored file, SVG included, SHALL be served as a download.

#### Scenario: An unkept image serves to its sender
- **WHEN** the reader who sent an image they did not keep requests it
- **THEN** the file is served in place

#### Scenario: Another reader is refused
- **WHEN** a different signed-in reader requests that attachment by its id
- **THEN** the api answers not found and serves no bytes

#### Scenario: An SVG is never served in place
- **WHEN** a stored attachment's media type is SVG
- **THEN** it is served as a download instead of shown in place

### Requirement: Chat writes to a Topic only through the Topic Tools
A chat turn for a user who may not edit the Topic SHALL NOT write to `topics`, `sources`, `findings`, `resources`, or `scans`, SHALL NOT revise a Topic's context, SHALL NOT create or modify a Finding, and SHALL NOT contribute any signal to relevance scoring. The only row such a turn writes is its own Chat Turn save. A chat turn for a user who may edit the Topic MAY write `topics.prompt` with its Prompt Version, and `sources`, through the Topic Tools alone. It SHALL still never write a Finding, a Resource, or a Scan, and never feed relevance scoring.

#### Scenario: A turn from a user who may not edit leaves the Scan pipeline untouched
- **WHEN** a user who may not edit the Topic sends a chat turn
- **THEN** no `topics`, `findings`, `resources`, `sources`, or `scans` row is inserted or updated, and only a `chat_turns` row is written

#### Scenario: An editor's turn writes only through the Topic Tools
- **WHEN** a user who may edit the Topic sends a chat turn in which a Topic Tool fires
- **THEN** beyond its `chat_turns` row the turn writes only `topics.prompt` with a new Prompt Version, or a `sources` row. No `findings`, `resources`, or `scans` row changes

#### Scenario: Chat never influences the next Scan
- **WHEN** a Scan starts on a Topic that has had chat turns
- **THEN** the Scan's relevance scoring reads the same inputs it would have read with no chat turns at all, apart from a prompt or Source saved through a Topic Tool

### Requirement: A turn in which a Topic Tool fired keeps its text and costs what it used
A chat turn in which a Topic Tool fired SHALL keep its question and answer text even when the gate denies the user `chat:persist`. Its spend SHALL count every model step's tokens and SHALL be saved as a chat turn row, in the same budget pool a read-only turn uses.

#### Scenario: A turn in which a Topic Tool fired keeps its text
- **WHEN** a Topic Tool fires in a turn
- **THEN** its `chat_turns` row holds the question and answer, encrypted like any kept text

#### Scenario: A turn in which a Topic Tool fired costs what it used
- **WHEN** a turn runs several model steps to propose and then save an edit
- **THEN** the saved cost covers every step's tokens and counts toward the user's monthly budget

### Requirement: The edit chat changes the topic's settings

The edit chat's `proposeTopicEdit` SHALL take the settings fields beside the prompt and the Sources, the private
chat's edit block prompt SHALL name them, and an agreed settings change SHALL be applied through `updateTopicFields`
and SHALL toast like the prompt's save. The topic chat prompt's settings section SHALL say that a settings change goes
through `proposeTopicEdit`, the preview flow the edit block describes, and SHALL name no tool the chat does not have.

#### Scenario: Carl changes the tags on a yes

- **WHEN** an editor agrees to tags Carl previewed
- **THEN** the server writes them through `updateTopicFields`, a toast says the settings were saved, and the page
  reloads with them

#### Scenario: The prompt names the preview flow for a settings change

- **WHEN** the topic chat prompt is built for a reader who may edit the Topic
- **THEN** its settings section names `proposeTopicEdit` as the way a settings change is proposed, and names no other
  tool

### Requirement: A signed-out chat post is rejected before its body is read

A post to a topic chat, a team chat, or the new-topic chat by a request with no session SHALL get a 401 with "sign up
required" before its body is read, and a post to a chat room by such a request SHALL get a 404, as a missing chat room
is, before its body is read, so an anonymous request never holds a chat body's attachments in memory. A signed-in post
SHALL then pass the route's own body limit and its authorization.

A post to the transcription route by a request with no session SHALL get the same 401 before its body is read, so an
anonymous request never holds a recording in memory.

#### Scenario: An anonymous post with large attachments

- **WHEN** a signed-out caller posts a chat turn with two megabytes of attachments
- **THEN** it gets a 401 at once, and its body is never read

#### Scenario: An anonymous chat room post

- **WHEN** a signed-out caller posts a chat room message with two megabytes of attachments
- **THEN** it gets a 404 at once, as a missing chat room is, and its body is never read

#### Scenario: An anonymous recording
- **WHEN** a request with no session posts a recording
- **THEN** it gets a 401 before the body is read

### Requirement: A stored answer keeps the text of every step
A chat turn's stored answer SHALL be the text of every step the reply took, joined the way the stream showed it, with
the paragraph break that a tool call between two text steps adds. It SHALL never be only the final step's text. A turn
asked from the podcast player SHALL store its structured output's answer, never the output's JSON.

#### Scenario: Text before a tool call survives a reload
- **WHEN** Carl writes a sentence, calls a tool, and writes a second paragraph, and the conversation reloads
- **THEN** the stored answer holds both, separated by a paragraph break, as the stream showed them

#### Scenario: A podcast answer is stored as words
- **WHEN** a podcast chat turn's answer is stored
- **THEN** the stored answer is the answer's text, with no JSON and no speaker field

### Requirement: A composer never sends during an IME composition

The private chat composer and the room composer SHALL send on Enter only if no input method editor composition is
active, read from the keyboard event's `isComposing`. An Enter that confirms a composition candidate SHALL leave the
confirmed text in the draft and send nothing, so a reader typing Japanese, Chinese, or Korean never posts half a word.

#### Scenario: Enter during a composition keeps the draft

- **WHEN** a reader typing with an input method editor presses Enter to confirm a candidate
- **THEN** the composer sends nothing and the confirmed text stays in the draft

#### Scenario: Enter after the composition sends

- **WHEN** the same reader presses Enter with no composition active
- **THEN** the composer sends the draft

### Requirement: A rejected link preview read ends the loading cards

The chat room's link preview poll SHALL read a failed or rejected link preview response as no cards, and SHALL end the
loading cards of the chat messages it polled, so no card loads forever and no rejection goes unhandled.

#### Scenario: A failed read leaves no loading card

- **WHEN** the link preview read fails or responds with an error
- **THEN** it reads as no cards, the polled chat messages' loading cards end, and no unhandled rejection reaches the
  console

#### Scenario: A successful read still merges its cards

- **WHEN** the read returns cards for a chat message
- **THEN** the cards merge into that chat message and its loading card ends

### Requirement: The spoken questions pause reads the plan through the plan helper

What a mic does past the spoken questions cutoff SHALL be decided through the shared plan helper `isPremiumPlan`,
never by comparing the plan string at the call site. A reader on premium, which has no plan above it, SHALL see a toast
that speaking comes back on the 1st, and a reader on every other plan SHALL be sent to the plans page with the mic's
call to action.

#### Scenario: A premium reader's mic toasts

- **WHEN** a reader whose plan the helper reads as premium taps a mic past the spoken questions cutoff
- **THEN** a toast says speaking comes back on the 1st, and the reader stays on the page

#### Scenario: Another plan opens the plans page

- **WHEN** a reader on any other plan taps a mic past the spoken questions cutoff
- **THEN** the plans page opens with the mic's call to action

#### Scenario: The call site compares no plan string

- **WHEN** the single-gate test greps the web app for a plan comparison
- **THEN** the spoken questions pause matches nothing, since it calls the helper

