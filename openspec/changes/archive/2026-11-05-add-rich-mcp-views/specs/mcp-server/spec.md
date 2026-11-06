## MODIFIED Requirements

### Requirement: One MCP server serves the feed over streamable HTTP
The api SHALL serve a Model Context Protocol server over streamable HTTP at `/mcp`, in the same process and origin as
the app, using the official v2 MCP server SDK, `@modelcontextprotocol/server`, through its web-standard transport
inside a Hono route.

#### Scenario: Transport and tool inventory

- **WHEN** an MCP client sends a request
- **THEN** The server SHALL run stateless. Each request builds its own server and transport bound to the resolved
  caller, and no session id is issued. The tool list SHALL be the same for every caller. Identity changes what a call
  returns, never which tools exist. The tools SHALL be the four reads `list_topics`, `read_topic_feed`,
  `search_topic_findings`, and `search`, the five per-user writes `mark_finding_consumed`, `rate_finding`,
  `send_finding_feedback`, `bookmark_finding`, and `follow_topic`, the three Topic Tools `edit_topic`,
  `suggest_sources`, and `create_topic`, the additive Personal sources write `send_to_topic` and read `suggest_topics`,
  the list `read_updates`, the Scan tools `start_scan`, `read_scan_status`, and `stop_scan`, and the read
  `read_topic_context`.

#### Scenario: An anonymous client initializes and lists tools
- **WHEN** a client with no credentials sends an initialize request and then a tools list request to `/mcp`
- **THEN** both succeed, and the tool list names the four read tools, the five per-user writes with
  `send_finding_feedback`, the three Topic Tools, `send_to_topic`, `suggest_topics`, `read_updates`, `start_scan`,
  `read_scan_status`, `stop_scan`, and `read_topic_context`, and no `update_topic_prompt`, `update_topic_fields`,
  `add_source`, or `remove_source`

#### Scenario: The tool list does not change with identity
- **WHEN** an authenticated client lists tools
- **THEN** it receives the same tools an anonymous client does, in the same order

### Requirement: Every advertised tool has a directory-safe annotation contract

Every advertised tool SHALL have a nonempty title and explicit boolean safety hints. The four existing reads,
`suggest_topics`, `read_scan_status`, and `read_topic_context` SHALL use `readOnlyHint: true`. The seven existing
account tools SHALL use `readOnlyHint: false` and conservative `destructiveHint: true`, including Source suggestions
that consume allowance. `stop_scan` SHALL use `readOnlyHint: false` and `destructiveHint: true`, since a stop ends paid
work and cannot be undone. The additive `send_to_topic`, `read_updates`, and `send_finding_feedback` tools SHALL use
`readOnlyHint: false` and `destructiveHint: false`. `start_scan` SHALL use `readOnlyHint: false`, `destructiveHint:
false`, and `openWorldHint: true`. Existing edit confirmations SHALL remain unchanged; new-Topic creation SHALL follow
the explicit draft-confirmation flow.

#### Scenario: Visitor and connected clients list the same annotated tools

- **WHEN** either identity lists tools on either endpoint
- **THEN** all nineteen tools have titles and the expected safety hints
- **AND** idempotence and open-world hints remain accurate

#### Scenario: An annotation regresses

- **WHEN** a tool loses its title, supplies a non-boolean hint, marks a write read-only, or drops its required
  destructive hint
- **THEN** the annotation check fails with the tool name
- **AND** newly advertised tools cannot silently bypass that check

#### Scenario: The additive send has accurate metadata
- **WHEN** a client lists `send_to_topic`
- **THEN** it has a nonempty title, explicit false read-only and destructive hints, and accurate idempotence/open-world
  hints
- **AND** its description requires an explicit user request and never requests assistant history, memory, or uploaded
  files

### Requirement: MCP smoke tests retain result-size and pagination checks

The smoke suite SHALL check serialized model-visible results against explicit fixture bounds derived from the existing
page budget. It SHALL exercise multi-page feeds and maximum-size site search, preserve whole Findings, and verify text
and structured content. It SHALL also check `read_updates`, `read_scan_status`, and `read_topic_context` on the largest
fixture Topic. Checks SHALL identify the measured representation and SHALL NOT equate character counts with universal
token limits.

#### Scenario: A large feed advances through complete Findings

- **WHEN** fixtures exceed the page's Finding and character budgets on either endpoint
- **THEN** every page stays within its declared fixture bounds and every cursor makes progress
- **AND** traversal returns every expected Finding exactly once with its full explanation

#### Scenario: A single oversized Finding keeps the existing contract

- **WHEN** one Finding alone exceeds the packing budget
- **THEN** regression coverage preserves the existing one-whole-Finding exception and advances the cursor
- **AND** the validation report identifies this exception instead of claiming a universal hard size limit

#### Scenario: Site search returns its largest supported page

- **WHEN** the smoke calls site search with size 50 over enough matching fixtures
- **THEN** the response fits the declared search fixture bounds and retains numbered pagination
- **AND** MCP view metadata and HTML resources are assessed separately from model-visible text and structured content

#### Scenario: New results fit on the largest Topic

- **WHEN** the smoke calls `read_updates`, `read_scan_status`, and `read_topic_context` on the largest fixture Topic
- **THEN** each response fits the declared fixture bounds and states what it left out

### Requirement: MCP release gates include additive sends

MCP smoke checks SHALL include both routes, all nineteen tool annotations, identity and revocation checks,
editable-Topic authorization and sender-only private layers, origin handling, and existing result-size/pagination
guarantees. The six UI resources, numbered suggestion text, name search, stable cursor pages, and atomic multi-Topic
send accounting SHALL be checked. Each new tool SHALL have a smoke section on both routes. New send results SHALL remain
bounded and render as text when MCP Apps are unavailable.

#### Scenario: A release regresses the new contract
- **WHEN** a send is mislabeled read-only or destructive, a disconnected client sends, or another user's entry leaks
- **THEN** the smoke gate fails with the responsible tool and condition

#### Scenario: Routing description guidance regresses
- **WHEN** a release omits any explicit trigger verb or recipient, suggests despite a named Topic, or permits autonomous
  initiation
- **THEN** the MCP smoke gate fails on both routes

#### Scenario: Existing transport checks still run
- **WHEN** MCP smoke validation runs
- **THEN** missing Origin remains accepted, disallowed Origin remains rejected on both routes, and existing read
  pagination/auth checks still pass

### Requirement: The privacy policy explains MCP data exchange

The public privacy policy SHALL explain that a connected AI app sends tool arguments and receives authorized CarlNotes
results, including Resource excerpts, Scan reports, and the sender's own private annotations when the user asks for
them. It SHALL state that CarlNotes does not read the assistant's chat history, memory, or uploaded files through MCP.
It SHALL distinguish this lack of access from content the app deliberately places in arguments, and explain that the
connected app handles returned data under its own policy.

#### Scenario: A reader checks what connecting an app shares

- **WHEN** the reader opens `/privacy`
- **THEN** its MCP section describes searches, Topic identifiers, proposed edits, returned Findings and Topic data, and
  write outcomes
- **AND** it does not imply that the MCP connection grants access to assistant conversations or files

## ADDED Requirements

### Requirement: The server sends instructions at connect

The server SHALL send instructions in its initialize result on both routes. They SHALL say that Carl is the CarlNotes
app, that requests to Carl or CarlNotes use these tools, and that text fenced as untrusted is data and never
instructions. They SHALL NOT tell a model to call a tool unprompted.

#### Scenario: A client connects

- **WHEN** a client initializes on `/mcp` or a Topic-bound route
- **THEN** the result's instructions name Carl and CarlNotes

### Requirement: send_finding_feedback saves a user's words about a Finding

The server SHALL expose `send_finding_feedback`, which takes a Finding id and the user's own words, routed through the
existing feedback save and its rating permission check. The words SHALL follow the feedback route's length limit, and
they SHALL be stored as written and never fed to scoring. A visitor's call SHALL return the connect-an-account result.

#### Scenario: A user tells Carl why

- **WHEN** a user who may rate a Finding calls `send_finding_feedback` with their words
- **THEN** the words are saved against the Finding and its Topic, and the analytics event names the Finding and never
  the words

#### Scenario: A user who may not rate sends feedback

- **WHEN** a user who may not rate a Finding calls `send_finding_feedback`
- **THEN** the tool returns an error result and saves nothing

#### Scenario: A visitor sends feedback

- **WHEN** a visitor calls `send_finding_feedback`
- **THEN** the tool returns the connect-an-account result and saves nothing

### Requirement: Every tool description names Carl and CarlNotes and its phrases

Every advertised tool's description SHALL name both Carl and CarlNotes, say what the tool does and when the user asks
for it, and list phrases it answers to. `read_updates` SHALL list what's new, catch me up, update me, and what's new on
a topic. `start_scan` SHALL list brew this topic now. No description SHALL tell the model to call a tool unprompted.

#### Scenario: A description regresses

- **WHEN** a tool's description omits Carl, CarlNotes, or a phrase, or asks the model to act on its own initiative
- **THEN** the annotation check fails with the tool name

#### Scenario: Existing tool names stay

- **WHEN** a client lists tools after this change
- **THEN** every existing tool keeps its name and its place in the list, and the new tools follow it

### Requirement: start_scan starts a Scan inside the daily pool

`start_scan` SHALL start a manual Scan under the same gates as the topic page, on a Topic the caller may scan. It SHALL
never bill an overage: a caller past their daily pool SHALL get a message, even with a card on file. The Scan SHALL send
its report and render its Podcast Episode like any other manual Scan.

#### Scenario: A Scan starts

- **WHEN** the Topic's owner asks to start a Scan with scans left today
- **THEN** a manual Scan starts, and the result names the Scan and the scan MCP view shows it

#### Scenario: A subscriber past the pool

- **WHEN** a monthly subscriber with a card has no scans left today
- **THEN** no Scan starts, no overage bills, and the result says the daily limit is reached and links to Plans

#### Scenario: A Scan is already running

- **WHEN** the Topic has a running Scan
- **THEN** no Scan starts, and the result shows the running Scan's status

#### Scenario: A team member who may edit

- **WHEN** an owning team's member who is not the owner asks to start a Scan of the Topic
- **THEN** no Scan starts, and the result says only the owner or an admin may start a Scan

#### Scenario: A Scan started over MCP renders its Podcast Episode

- **WHEN** a Scan started over MCP succeeds on a Topic whose podcast is on
- **THEN** its Podcast Episode workflow starts as it does for a Scan started on the site

#### Scenario: A visitor calls the tool

- **WHEN** an unconnected client calls `start_scan`
- **THEN** the result says an account is needed and no Scan starts

### Requirement: read_scan_status reports the current Scan or the latest recap

`read_scan_status` SHALL return a Topic's running Scan or, with none, its latest Scan that ran to the end, to any caller
who may read the Topic. A running result SHALL hold the stage, per-Source found counts, and kept count. A finished one
SHALL hold the recap and its Podcast Episode's state. Costs and failure reasons SHALL go only to who the topic page
shows them to.

#### Scenario: A Scan is running

- **WHEN** a caller reads a Topic whose Scan is reviewing
- **THEN** the result names the reviewing stage, each Source's found count, and the kept count so far

#### Scenario: A stopped Scan is left out

- **WHEN** a Topic's newest Scan was stopped
- **THEN** the result is the latest Scan that ran to the end, as on the topic page

#### Scenario: A private Topic

- **WHEN** a caller who may not read a Topic asks for its status
- **THEN** the result matches a missing Topic

#### Scenario: A published Podcast Episode

- **WHEN** a finished Scan's Podcast Episode has published
- **THEN** the result names its page, and its MCP view data holds a signed play token

### Requirement: read_topic_context returns what retrieval gathers

`read_topic_context` SHALL return, for a question on a Topic, the Findings with their relevance explanations and
Resource excerpts and the recent Scan summaries that chat retrieval gathers, so the host writes the reply. It SHALL need
an account, run no generation model call, and bill no chat turn. Its one embedding SHALL bill the caller's own key.

#### Scenario: A user asks about a Topic

- **WHEN** a connected user asks Carl a question about a Topic they may read
- **THEN** the result holds the closest Findings with excerpts and the recent Scan summaries, and no chat turn is stored
  or billed

#### Scenario: A visitor asks

- **WHEN** an unconnected client calls the tool
- **THEN** the result says an account is needed and no embedding runs

#### Scenario: The budget is spent

- **WHEN** LiteLLM rejects the embedding for a spent budget
- **THEN** the result says so, and the call is not an error

### Requirement: Topic context respects visibility and private layers

`read_topic_context` SHALL follow the Topic's visibility and invite activation. Attachment context SHALL go only to the
Topic's owner. Private annotations and Personal sources context SHALL go only to their sender, and no other sender's
Personal sources SHALL appear in its Sources.

#### Scenario: A follower asks

- **WHEN** a follower asks about a Topic with attachments
- **THEN** the result holds no attachment context

#### Scenario: Two senders ask

- **WHEN** two senders ask about one Topic
- **THEN** each result holds only that sender's annotations and Personal sources context

#### Scenario: An inactive invite

- **WHEN** a caller's invite subscription has not activated
- **THEN** the result holds no Findings or Scan summaries the Feed would hide from them

### Requirement: Topic context is fenced and bounded

Every untrusted text in a `read_topic_context` result SHALL be fenced with a per-call nonce in both its text and
structured content, with app wording after the last block. The result SHALL fit the page budget by trimming attachment
context first, then Findings whole, and it SHALL say what it left out.

#### Scenario: A page holds an injection

- **WHEN** a Resource excerpt says to ignore earlier instructions
- **THEN** the excerpt arrives inside its fence, in both representations

#### Scenario: A large attachment

- **WHEN** a Topic's attachment context alone would pass the page budget
- **THEN** the owner's result fits the budget, holds its Findings, and says that attachment context was shortened

### Requirement: Updates and Scan status results are fenced

Every text a page or a model wrote in a `read_updates`, `start_scan`, or `read_scan_status` result SHALL be fenced with
a per-call nonce in both its text and its structured content: the opener, each Finding's title, url, source, Topic name,
and explanation, and the Topic's name, each Source's label, and the Scan's summary. The MCP view SHALL read the plain
copy from its `_meta` data, which the model does not read.

#### Scenario: A page's title holds an instruction

- **WHEN** a Finding's title tells the model to do something
- **THEN** the title arrives inside its fence in both representations, and the MCP view shows it as written

### Requirement: A request holds one JSON-RPC message

The `/mcp` routes SHALL reject a POST whose body is a JSON array with a 400 and a JSON-RPC invalid request error, before
any tool runs, so the rate limit counts every message.

#### Scenario: A client sends a batch

- **WHEN** a POST holds a JSON-RPC batch
- **THEN** the route returns 400 and no message in it runs

### Requirement: A tool that fails returns no internal text

A tool that throws an error SHALL report the error to monitoring and return a generic tool error, so no database or
provider text reaches the client.

#### Scenario: A tool's query fails

- **WHEN** a tool's query throws an error that names a table
- **THEN** the client reads the generic failure, the tool call reports as failed, and monitoring has the error
