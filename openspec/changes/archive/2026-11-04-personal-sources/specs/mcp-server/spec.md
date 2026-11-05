## MODIFIED Requirements

### Requirement: One MCP server serves the feed over streamable HTTP
The api SHALL serve a Model Context Protocol server over streamable HTTP at `/mcp`, in the same process and origin as
the app, using the official v2 MCP server SDK, `@modelcontextprotocol/server`, through its web-standard transport
inside a Hono route.

#### Scenario: Transport and tool inventory

- **WHEN** an MCP client sends a request
- **THEN** The server SHALL run stateless. Each request builds its own server and transport bound to the resolved caller, and no session id is issued. The tool list SHALL be the same for every caller. Identity changes what a call returns, never which tools exist. The tools SHALL be the four reads `list_topics`, `read_topic_feed`, `search_topic_findings`, and `search`, the four per-user writes `mark_finding_consumed`, `rate_finding`, `bookmark_finding`, and `follow_topic`, the three Topic Tools `edit_topic`, `suggest_sources`, and `create_topic`, and the additive Personal sources write `send_to_topic` and read `suggest_topics`.

#### Scenario: An anonymous client initializes and lists tools
- **WHEN** a client with no credentials sends an initialize request and then a tools list request to `/mcp`
- **THEN** both succeed, and the tool list names the four read tools, the four per-user writes, and the three Topic
  Tools, `send_to_topic`, and `suggest_topics`, and no `update_topic_prompt`, `update_topic_fields`, `add_source`, or `remove_source`

#### Scenario: The tool list does not change with identity
- **WHEN** an authenticated client lists tools
- **THEN** it receives the same tools an anonymous client does, in the same order

### Requirement: A caller resolves to a visitor or a user before any read
The server SHALL resolve each request's caller once. A bearer token the OAuth lookup accepts makes it a user, and anything else makes it a visitor. A visitor SHALL read public Topics only, through the same visibility rules the pages use. A user SHALL read every Topic they can access under those rules, with the invite activation gate applied. No read SHALL run a per-user query against a null user.

#### Scenario: A visitor lists public Topics only
- **WHEN** an anonymous client calls `list_topics` on `/mcp`
- **THEN** the result holds public Topics with enough kept Findings to be shown, and no private or invite Topic

#### Scenario: A user lists what they can access
- **WHEN** an authenticated client calls `list_topics`
- **THEN** the result holds the user's own Topics, the Topics they subscribe to, the Topics their Teams hold, and the public Topics, each once

#### Scenario: A hidden Topic reads as missing
- **WHEN** a user calls a read on a Topic the visibility rules do not grant them
- **THEN** the result is the same as for a Topic id that matches nothing


#### Scenario: An authenticated send retains its client identity
- **WHEN** a signed access token identifies its authorized client
- **THEN** the send path uses that verified client ID and current consent/refresh-grant state, never a client name or User-AI Agent supplied by the caller

#### Scenario: A revoked grant has an unexpired access token
- **WHEN** its client calls `send_to_topic`
- **THEN** the send is refused as disconnected while existing read-token expiry behavior remains unchanged

### Requirement: Every advertised tool has a directory-safe annotation contract

Every advertised tool SHALL have a nonempty title and explicit boolean safety hints. The four existing reads and `suggest_topics` SHALL use `readOnlyHint: true`. The seven existing account tools SHALL use `readOnlyHint: false` and conservative `destructiveHint: true`, including Source suggestions that consume allowance. The additive `send_to_topic` tool SHALL use `readOnlyHint: false` and `destructiveHint: false`. Existing edit confirmations SHALL remain unchanged; new-Topic creation SHALL follow the explicit draft-confirmation flow.

#### Scenario: Visitor and connected clients list the same annotated tools

- **WHEN** either identity lists tools on either endpoint
- **THEN** all thirteen tools have titles and the expected safety hints
- **AND** idempotence and open-world hints remain accurate

#### Scenario: An annotation regresses

- **WHEN** a tool loses its title, supplies a non-boolean hint, marks a write read-only, or drops its required destructive hint
- **THEN** the annotation check fails with the tool name
- **AND** newly advertised tools cannot silently bypass that check


#### Scenario: The additive send has accurate metadata
- **WHEN** a client lists `send_to_topic`
- **THEN** it has a nonempty title, explicit false read-only and destructive hints, and accurate idempotence/open-world hints
- **AND** its description requires an explicit user request and never requests assistant history, memory, or uploaded files

### Requirement: MCP credential disclosures describe working revocation paths and limits

The privacy policy SHALL describe CarlNotes-issued OAuth access and refresh tokens, sign-in and consent, and the client's revocation path. It SHALL distinguish removing a client connection from server-side revocation. It SHALL describe the shipped account connection and API-key controls. It SHALL distinguish immediate refusal of new sends after revocation from an issued JWT's existing read validity until expiry.

#### Scenario: A reader disconnects an AI app

- **WHEN** the reader follows the documented disconnect and revocation guidance
- **THEN** it explains removing the connection in that app, revoking its refresh grant through the supported OAuth endpoint, or revoking the app group from CarlNotes account controls
- **AND** it explains access-token expiry and links to existing account deletion and support choices


#### Scenario: A reader revokes an API key
- **WHEN** the reader follows the account key controls
- **THEN** the policy explains that the key immediately stops authorizing sends, while accepted entries keep their normal retention or can be deleted

## ADDED Requirements

### Requirement: The send tool respects bound routing and user initiation

`send_to_topic` SHALL accept one to twenty explicit `topic_ids` or one legacy `topic_id` on both routes. Bound sends SHALL name only the bound Topic. User requests without a named Topic SHALL use read-only `suggest_topics` and wait for selection on either route; named requests SHALL send after ID resolution. Sends SHALL save only requested summaries and SHALL not start a Scan.

#### Scenario: Both descriptions cover explicit routing language
- **WHEN** tools are listed on either route
- **THEN** send and suggest descriptions cover requests to send, share, save, add, or forward to Carl, CarlNotes, or the user's topics
- **AND** they require suggest-before-send only without a named Topic, preserve explicit choice, and forbid autonomous initiation

#### Scenario: A user has not named a destination
- **WHEN** a user asks to send without naming a Topic on either MCP route
- **THEN** the AI calls `suggest_topics` and waits for selection
- **AND** the subsequent send includes explicit destination IDs rather than inferring them from the route
- **AND** sending outside a bound Topic requires the account-wide route

#### Scenario: A send carries useful context
- **WHEN** the AI prepares a requested send
- **THEN** the tool description asks for the user's work or questions, conclusions, open questions, and meaningful links
- **AND** it forbids raw conversation dumps

#### Scenario: A bound send omits the Topic
- **WHEN** an authorized user sends on `/mcp/t/<topicId>` without `topic_ids` or `topic_id`
- **THEN** validation rejects the request without storage

#### Scenario: A bound send names another Topic
- **WHEN** its arguments name a different Topic
- **THEN** the request is refused without reading or writing that other Topic

#### Scenario: A visitor calls the send tool
- **WHEN** an unconnected client calls it
- **THEN** the tool returns normal connect-account guidance without an entry or transport-wide authentication failure

#### Scenario: Acceptance returns a confirmation
- **WHEN** a send is accepted
- **THEN** its readable and structured result names the Topic, accepted title, entry ID, and number of distinct queued links
- **AND** the Topic MCP view presents the same confirmation without other entries or the private chat reference

### Requirement: MCP release gates include additive sends

MCP smoke checks SHALL include both routes, all thirteen tool annotations, identity and revocation checks, editable-Topic authorization and sender-only private layers, origin handling, and existing result-size/pagination guarantees. The four UI resources, numbered suggestion text, name search, stable cursor pages, and atomic multi-Topic send accounting SHALL be checked. New send results SHALL remain bounded and render as text when MCP Apps are unavailable.

#### Scenario: A release regresses the new contract
- **WHEN** a send is mislabeled read-only or destructive, a disconnected client sends, or another user's entry leaks
- **THEN** the smoke gate fails with the responsible tool and condition

#### Scenario: Routing description guidance regresses
- **WHEN** a release omits any explicit trigger verb or recipient, suggests despite a named Topic, or permits autonomous initiation
- **THEN** the MCP smoke gate fails on both routes

#### Scenario: Existing transport checks still run
- **WHEN** MCP smoke validation runs
- **THEN** missing Origin remains accepted, disallowed Origin remains rejected on both routes, and existing read pagination/auth checks still pass
