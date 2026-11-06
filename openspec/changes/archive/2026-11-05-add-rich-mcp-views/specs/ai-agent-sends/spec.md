## MODIFIED Requirements

### Requirement: Multi-Topic sends store and charge atomically

One accepted send SHALL store one sender-private entry in each of one to twenty selected editable Topics and consume one
daily send allowance. Any refused destination SHALL roll back every entry, Source, retry confirmation, and charge. The
canonical sorted destination set SHALL be part of the retry digest. Bound routes SHALL refuse any destination other than
their bound Topic.

#### Scenario: The last daily send reaches several Topics
- **WHEN** two concurrent multi-Topic requests compete for one remaining allowance
- **THEN** exactly one succeeds in all its destinations and the other stores nothing
- **AND** the successful call consumes one allowance regardless of destination count

#### Scenario: A destination is inaccessible
- **WHEN** any supplied Topic is missing or no longer editable
- **THEN** no destination stores the send and no allowance is consumed

#### Scenario: Retries preserve all destinations
- **WHEN** the same retry ID and content repeat with the same destination set in another order
- **THEN** the original confirmations return without another charge
- **WHEN** that ID names changed destinations or a deleted entry
- **THEN** the request conflicts and never recreates content

#### Scenario: Each destination keeps its own item
- **WHEN** one send is accepted into Topics owned by different users
- **THEN** each Topic stores its own sender-private entry and the delivery consumes one sender allowance
- **AND** deleting one destination's entry leaves the other entries and their context intact

### Requirement: Routing is a read-only explicit suggestion

`suggest_topics` SHALL accept the send's bounded title, summary, and links, and an optional editable-name `query` and
`list_topics` cursor on both MCP routes. It SHALL store nothing, consume no send or draft allowance, and never choose,
follow, draft, create, or send automatically. Both tool descriptions SHALL explain explicit user initiation and the
named-versus-unnamed Topic sequence.

#### Scenario: An explicit request names Carl but no Topic
- **WHEN** the user asks to send, share, save, add, or forward content to Carl, CarlNotes, or their topics without
  naming a Topic
- **THEN** the AI Agent calls suggest_topics first and waits for the user's destination selection before sending
- **AND** all fifteen verb/recipient combinations have equivalent guidance on both routes

#### Scenario: The user names a Topic
- **WHEN** an explicit request identifies a Topic unambiguously
- **THEN** the AI Agent resolves that destination and calls send directly without suggest_topics
- **AND** an ambiguous name requires clarification rather than guessing, with normal authority and bound-route checks
  preserved

#### Scenario: The user makes no request to send
- **WHEN** conversation content merely resembles a Topic or mentions Carl
- **THEN** the AI Agent calls neither suggest_topics nor send on its own initiative

#### Scenario: Editable Topics are available
- **WHEN** a signed-in user asks for routing suggestions
- **THEN** results compare the supplied content with current Topic names, prompts, and ready attachment context, ranking
  every editable Topic with the strongest matches first
- **AND** the send picker and numbered fallback omit public discovery

#### Scenario: Weak matches and pagination
- **WHEN** some Topics fail the minimum suggested relevance
- **THEN** editable Topics remain listed after stronger matches and are not checked by default
- **AND** all destinations use the `list_topics` cursor and character budget with five Topics per page and deterministic
  ranking

#### Scenario: Search filters the complete editable list
- **WHEN** the user submits a Topic-name query
- **THEN** it filters all editable Topics by name while retaining relevance order and the user's checked and unchecked
  choices
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
- **THEN** drafting uses the existing Topic Draft schema and source suggestion limits, with private visibility and no
  Team or invites
- **AND** creation only runs after the user confirms the exact draft, through existing creation limits and gates

#### Scenario: Missing Topic on a send
- **WHEN** either transport receives a send without either `topic_ids` or `topic_id`
- **THEN** validation refuses it before identity, matching, quota, or storage work
