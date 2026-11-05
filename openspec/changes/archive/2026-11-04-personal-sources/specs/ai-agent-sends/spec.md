## Purpose

Accept deliberately supplied research summaries from connected AI clients or user-owned API credentials, with consistent routing, limits, and revocation.

## ADDED Requirements

### Requirement: A send has bounded explicit content

A send SHALL accept one to twenty explicit distinct Topics, a title up to 200 characters, a summary up to 2,000 Unicode code points, ten safe distinct links, and an optional chat reference. `topic_ids` and legacy single `topic_id` SHALL be mutually exclusive. Empty or excessive content and unsafe links SHALL fail before persistence.

#### Scenario: Content meets the limits
- **WHEN** an authorized sender supplies a 2,000-code-point summary and ten safe links
- **THEN** the send is eligible for acceptance without truncation

#### Scenario: The AI Agent composes a send
- **WHEN** the AI Agent reads the send description
- **THEN** it requests the user's work or question, conclusions, open questions, and meaningful links
- **AND** it explicitly forbids raw conversation dumps

#### Scenario: Content exceeds the limits
- **WHEN** a send has 2,001 code points, eleven links, credentials in a URL, or a private-network candidate
- **THEN** validation refuses it without storing content or consuming daily allowance

### Requirement: Sends check identity then allowance then Topic authority

After payload validation, every send SHALL establish the sender, check daily allowance, and check Topic edit access, in that order. Only accepted deliveries SHALL consume quota or create an entry. AI Agent sends and accepted emails SHALL use the same plan allowance.

#### Scenario: A disconnected AI Agent names a valid Topic
- **WHEN** a valid access token has no current consenting live refresh grant for its user and client
- **THEN** the send is refused as disconnected before quota or Topic work

#### Scenario: The sender has exhausted the day
- **WHEN** an identified sender has exhausted the shared daily allowance through AI Agent sends, accepted emails, or both
- **THEN** the result names the reset time and no Topic lookup, Source creation, or entry write occurs

#### Scenario: Authorization fails after quota availability is checked
- **WHEN** a sender within its allowance targets an inaccessible Topic
- **THEN** no allowance is consumed and the Topic is indistinguishable from missing

### Requirement: Routing is a read-only explicit suggestion

`suggest_topics` SHALL accept the send's bounded title, summary, and links, and an optional editable-name `query` and `list_topics` cursor on both MCP routes. It SHALL store nothing, consume no send or draft allowance, and never choose, follow, draft, create, or send automatically. Both tool descriptions SHALL explain explicit user initiation and the named-versus-unnamed Topic sequence.

#### Scenario: An explicit request names Carl but no Topic
- **WHEN** the user asks to send, share, save, add, or forward content to Carl, CarlNotes, or their topics without naming a Topic
- **THEN** the AI Agent calls suggest_topics first and waits for the user's destination selection before sending
- **AND** all fifteen verb/recipient combinations have equivalent guidance on both routes

#### Scenario: The user names a Topic
- **WHEN** an explicit request identifies a Topic unambiguously
- **THEN** the AI Agent resolves that destination and calls send directly without suggest_topics
- **AND** an ambiguous name requires clarification rather than guessing, with normal authority and bound-route checks preserved

#### Scenario: The user makes no request to send
- **WHEN** conversation content merely resembles a Topic or mentions Carl
- **THEN** the AI Agent calls neither suggest_topics nor send on its own initiative

#### Scenario: Editable Topics are available
- **WHEN** a signed-in user asks for routing suggestions
- **THEN** results compare the supplied content with current Topic names, prompts, and ready attachment context, ranking every editable Topic with the strongest matches first
- **AND** the send picker and numbered fallback omit public discovery

#### Scenario: Weak matches and pagination
- **WHEN** some Topics fail the documented relevance floor
- **THEN** editable Topics remain listed after stronger matches and are not checked by default
- **AND** all destinations use the `list_topics` cursor and character budget with five Topics per page and deterministic ranking

#### Scenario: Search filters the complete editable list
- **WHEN** the user submits a Topic-name query
- **THEN** it filters all editable Topics by name while retaining relevance order and the user's checked and unchecked choices
- **AND** email routing still files only clearly matching editable Topics

#### Scenario: Relevant Topics lie beyond a candidate batch
- **WHEN** the eligible catalog spans several batches
- **THEN** matching considers every eligible Topic before ranking and pagination
- **AND** stable transient embeddings and bounded reads store no private input or vectors

#### Scenario: Every page offers a new Topic
- **WHEN** any suggestion page or search returns, including an empty match set
- **THEN** it offers starting a private Topic without drafting or storing anything
- **AND** the offer remains available through pagination and search

#### Scenario: The user picks the new Topic offer
- **WHEN** the user explicitly chooses to start a Topic
- **THEN** drafting uses the existing Topic Draft schema and source suggestion limits, with private visibility and no Team or invites
- **AND** creation only runs after the user confirms the exact draft, through existing creation limits and gates

#### Scenario: Missing Topic on a send
- **WHEN** either transport receives a send without either `topic_ids` or `topic_id`
- **THEN** validation refuses it before identity, matching, quota, or storage work

### Requirement: The first send creates its concrete AI Agent Source

The first accepted send from a delivery identity to a Topic SHALL create an `ai_agent` Source without consuming a fetched Source slot. OAuth Source configuration SHALL retain the authenticated client ID. API credentials and imports SHALL retain their actual provenance without fabricated OAuth identity.

#### Scenario: Concurrent first sends arrive
- **WHEN** two requests from the same sender and OAuth client reach the same Topic concurrently
- **THEN** exactly one Source is created and distinct valid deliveries create their own entries

#### Scenario: The Topic has ten fetched Sources
- **WHEN** the first send creates a receiving Source
- **THEN** the send succeeds if otherwise authorized and within its daily allowance
- **AND** the ten fetched Sources remain, with the Personal source excluded from their cap

### Requirement: Connected AI Agents come from current grants

Connected AI Agents SHALL be derived from registered clients, user consent, and live unrevoked refresh tokens for MCP. Registrations SHALL be grouped by registered app domain, never self-reported client name. Revoked, expired, rotated-only, disabled, or absent grants SHALL not authorize new sends.

#### Scenario: A client spoofs a familiar name
- **WHEN** an unknown-domain client registers the name Claude
- **THEN** the account and Source label identify its registered domain rather than Claude

#### Scenario: Multiple registrations belong to one app
- **WHEN** two valid registrations map to the same app domain
- **THEN** the account lists one app group while acceptance still checks each concrete client grant
- **AND** unrelated loopback clients are not merged under localhost

#### Scenario: A user revokes an app
- **WHEN** the owner revokes its grouped connection
- **THEN** all of that user's grants for the group stop authorizing sends immediately
- **AND** other users' grants remain valid and existing entries retain their normal lifecycle
- **AND** the disconnected state remains visible where the Source has history

### Requirement: Connection discovery never sends on the user's behalf

Eligible Topic editors SHALL offer connected AI Agents as one-tap additions and a dismissible nudge after a new connection. Suggestions based on repeated accepted sends SHALL use the requesting sender’s accepted history only and SHALL never save or send content without explicit action.

#### Scenario: A connection is new
- **WHEN** the user returns after granting a new connection
- **THEN** one dismissible nudge offers relevant setup and does not create a Source or entry

#### Scenario: An AI Agent repeatedly supplies relevant context
- **WHEN** existing accepted sends meet the documented suggestion threshold
- **THEN** the editor can suggest that connected AI Agent without reading assistant history or persisting untargeted requests

### Requirement: Premium API credentials are revocable and shown once

Premium users SHALL create per-user `cnk_v1_` API credentials on the account page, with a public ID and 256-bit random secret. Only a digest and display metadata SHALL be stored. The secret SHALL be shown once, and revocation SHALL immediately prevent further sends.

#### Scenario: A credential is created and listed again
- **WHEN** an entitled user creates a key and later reloads the account page
- **THEN** creation shows the full key once and later reads show only label, public ID, redacted suffix, dates, and status
- **AND** neither storage nor logs contain the secret

#### Scenario: A user downgrades or revokes
- **WHEN** a key is revoked or its owner loses the capability
- **THEN** subsequent API sends fail without storing content
- **AND** the owner can still revoke keys and read/delete existing entries

### Requirement: HTTP and MCP share send outcomes and retry safety

`POST /api/personal-sources/sends` SHALL accept bearer API credentials and the same send contract as MCP. Supplied retry IDs SHALL identify one delivery per sender; retries SHALL not consume allowance twice. API credentials SHALL grant no general account read or management access.

#### Scenario: A response is lost
- **WHEN** a client repeats an accepted request with the same retry ID and content
- **THEN** it receives the original confirmation and no duplicate entry or quota charge

#### Scenario: A retry changes content or revives deleted content
- **WHEN** a used retry ID carries different content or names a delivery already deleted
- **THEN** the request conflicts or reports the prior terminal state and never recreates content

#### Scenario: A bearer key targets account management
- **WHEN** an AI Agent key is used to list all Personal sources, revoke OAuth grants, or create another key
- **THEN** the request is unauthorized


### Requirement: Multi-Topic sends store and charge atomically

One accepted send SHALL store one sender-private entry in each of one to twenty selected editable Topics and consume one daily send allowance. Any refused destination SHALL roll back every entry, Source, retry receipt, and charge. The canonical sorted destination set SHALL be part of the retry digest. Bound routes SHALL refuse any destination other than their bound Topic.

#### Scenario: The last daily send reaches several Topics
- **WHEN** two concurrent multi-Topic requests compete for one remaining allowance
- **THEN** exactly one succeeds in all its destinations and the other stores nothing
- **AND** the successful call consumes one allowance regardless of destination count

#### Scenario: A destination is inaccessible
- **WHEN** any supplied Topic is missing or no longer editable
- **THEN** no destination stores the send and no allowance is consumed

#### Scenario: Retries preserve all destinations
- **WHEN** the same retry ID and content repeat with the same destination set in another order
- **THEN** the original receipts return without another charge
- **WHEN** that ID names changed destinations or a deleted entry
- **THEN** the request conflicts and never recreates content

#### Scenario: Each destination keeps its own item
- **WHEN** one send is accepted into Topics owned by different users
- **THEN** each Topic stores its own sender-private entry and the delivery consumes one sender allowance
- **AND** deleting one destination's entry leaves the other entries and their context intact
