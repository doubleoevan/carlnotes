# MCP Server Spec Delta

## ADDED Requirements

### Requirement: MCP rejects an unapproved Origin before processing the request

Both `/mcp` and `/mcp/t/<topicId>` SHALL reject every request with an unapproved Origin with HTTP 403 before resolving credentials, consuming the caller's quota, or dispatching tools. The same policy SHALL cover every HTTP method on these endpoints. A missing Origin SHALL proceed through ordinary transport and authorization rules.

#### Scenario: A foreign origin is rejected on both endpoints

- **WHEN** a request to either endpoint includes `Origin: https://attacker.example`, with or without valid credentials
- **THEN** it receives HTTP 403 and no tool runs
- **AND** the rejection precedes authentication lookup and quota consumption

#### Scenario: A server-side client omits Origin

- **WHEN** a client sends valid initialization, tool-list, or public-read requests without Origin to either endpoint
- **THEN** the requests succeed under the existing visitor rules
- **AND** an account-only call still requires a connected account

#### Scenario: An allowed origin does not grant account permissions

- **WHEN** a visitor sends an account-only call from an allowed Origin
- **THEN** the response remains the existing connect-account tool result and no write occurs

#### Scenario: Origin validation covers methods and preflights

- **WHEN** POST, GET, HEAD, OPTIONS, or DELETE reaches either endpoint with an unapproved Origin
- **THEN** it receives HTTP 403 before transport handling
- **AND** an allowed or missing Origin retains the transport's normal method behavior

### Requirement: MCP origins are explicit deployment origins

The allowlist SHALL include `https://carlnotes.com` and the configured application origin. The unconfigured local deployment SHALL allow `http://localhost:5173`. Matching SHALL use a complete serialized HTTP(S) origin, including scheme and port. Empty, opaque, malformed, multi-origin, or unlisted values SHALL fail. Request Host, forwarded headers, client names, and OAuth redirects SHALL NOT expand the allowlist.

#### Scenario: Hosted and configured development origins work

- **WHEN** a valid request supplies `https://carlnotes.com` or the configured application's serialized origin
- **THEN** Origin validation allows it
- **AND** `http://localhost:5173` works when it is the configured or fallback local application origin

#### Scenario: An origin lookalike is rejected

- **WHEN** Origin is `null`, empty, `https://carlnotes.com.attacker.example`, `http://carlnotes.com`, or an unlisted port
- **THEN** the response is HTTP 403

#### Scenario: Non-origin URLs and multiple origins are rejected

- **WHEN** Origin contains credentials, a path, query, fragment, or multiple space- or comma-separated origins
- **THEN** the response is HTTP 403 even if one hostname is allowed

#### Scenario: OAuth pages keep their existing policy

- **WHEN** a request reaches `/mcp/consent`, `/api/auth/`, or an OAuth discovery document
- **THEN** the new MCP endpoint guard does not replace that route's existing behavior

### Requirement: Every advertised tool has a directory-safe annotation contract

Every advertised tool SHALL have a nonempty title and explicit boolean safety hints. The four read tools SHALL use `readOnlyHint: true`. The seven account tools SHALL use `readOnlyHint: false` and conservative `destructiveHint: true`, including Source suggestions that consume allowance. Tool names, argument schemas, results, authorization, and edit confirmations SHALL remain unchanged.

#### Scenario: Visitor and connected clients list the same annotated tools

- **WHEN** either identity lists tools on either endpoint
- **THEN** all eleven tools have titles and the expected safety hints
- **AND** idempotence and open-world hints remain accurate

#### Scenario: An annotation regresses

- **WHEN** a tool loses its title, supplies a non-boolean hint, marks a write read-only, or drops its required destructive hint
- **THEN** the annotation check fails with the tool name
- **AND** newly advertised tools cannot silently bypass that check

### Requirement: MCP smoke tests preserve authentication and access boundaries

The MCP smoke suite SHALL exercise both endpoints without Origin, with an allowed Origin, and with a rejected Origin. It SHALL retain OAuth registration, PKCE, sign-in, consent, token exchange, caller authorization, edit confirmation, card resource, and rate-limit checks. Invalid credentials SHALL retain visitor access only.

#### Scenario: A bearer grants only the connected account's access

- **WHEN** a smoke client exchanges an authorization code and reads its private fixture Topic
- **THEN** its bearer works on the common and matching Topic-bound endpoint
- **AND** a visitor or invalid bearer cannot read that Topic or perform account-only writes

#### Scenario: A valid token cannot bypass Origin validation

- **WHEN** a smoke client repeats its authenticated request with a foreign Origin
- **THEN** both endpoints return HTTP 403 without dispatching a tool

#### Scenario: A followed Topic becomes private

- **WHEN** an owner makes a public Topic private while another account's subscription remains active
- **THEN** that follower cannot list its current name, prompt, or Sources, or read its feed on either endpoint
- **AND** followed public Topics below the discovery threshold and invite subscriptions remain readable
- **AND** owner and active team access to private Topics remain valid

### Requirement: MCP smoke tests retain result-size and pagination checks

The smoke suite SHALL check serialized model-visible results against explicit fixture bounds derived from the existing page budget. It SHALL exercise multi-page feeds and maximum-size site search, preserve whole Findings, and verify text and structured content. Checks SHALL identify the measured representation and SHALL NOT equate character counts with universal token limits.

#### Scenario: A large feed advances through complete Findings

- **WHEN** fixtures exceed the page's item and character budgets on either endpoint
- **THEN** every page stays within its declared fixture bounds and every cursor makes progress
- **AND** traversal returns every expected Finding exactly once with its full explanation

#### Scenario: A single oversized Finding keeps the existing contract

- **WHEN** one Finding alone exceeds the packing budget
- **THEN** regression coverage preserves the existing one-whole-item exception and advances the cursor
- **AND** the validation report identifies this exception rather than claiming a universal hard size limit

#### Scenario: Site search returns its largest supported page

- **WHEN** the smoke calls site search with size 50 over enough matching fixtures
- **THEN** the response fits the declared search fixture bounds and retains numbered pagination
- **AND** card metadata and HTML resources are assessed separately from model-visible text and structured content

### Requirement: The privacy policy explains MCP data exchange

The public privacy policy SHALL explain that a connected AI app sends tool arguments and receives authorized CarlNotes results. It SHALL state that CarlNotes does not read the assistant's chat history, memory, or uploaded files through MCP. It SHALL distinguish this lack of access from content the app deliberately places in arguments, and explain that the connected app handles returned data under its own policy.

#### Scenario: A reader checks what connecting an app shares

- **WHEN** the reader opens `/privacy`
- **THEN** its MCP section describes searches, Topic identifiers, proposed edits, returned Findings and Topic data, and write outcomes
- **AND** it does not imply that the MCP connection grants access to assistant conversations or files

### Requirement: MCP credential disclosures describe working revocation paths and limits

The privacy policy SHALL describe CarlNotes-issued OAuth access and refresh tokens, sign-in and consent, and the client's revocation path. It SHALL distinguish removing a client connection from server-side revocation. It SHALL disclose that an issued JWT can remain valid until expiry, and SHALL NOT invent a CarlNotes connection-management screen or promise immediate per-token invalidation.

#### Scenario: A reader disconnects an AI app

- **WHEN** the reader follows the documented disconnect and revocation guidance
- **THEN** it explains removing the connection in that app and revoking its refresh grant through the supported OAuth endpoint
- **AND** it explains access-token expiry and links to existing account deletion and support choices

### Requirement: MCP analytics disclosures match the shipped event and retention policy

The MCP privacy section SHALL name PostHog and disclose tool name, client name, caller kind, entry point, timestamp, and success, rejection, or failure outcome. It SHALL state that tool-call analytics exclude arguments, results, and token values, and retain the existing limit of up to twelve months. Other account actions SHALL remain covered by the existing product-analytics section.

#### Scenario: A reader checks tool-call tracking

- **WHEN** the reader opens the MCP privacy section
- **THEN** it explains that tool-call events are keyed to the app name, without creating a person profile
- **AND** it does not claim that all account-action analytics are anonymous or disabled

### Requirement: MCP privacy additions preserve the complete existing policy

Adding MCP disclosures SHALL preserve the policy's existing collection, use and storage, third-party sharing, retention, account deletion, and contact coverage. Its last-updated date SHALL reflect the policy edit. No new retention system or unshipped product capability SHALL be claimed.

#### Scenario: The updated policy is reviewed

- **WHEN** the policy diff and rendered page are inspected
- **THEN** the existing coverage and support contact remain available alongside the new MCP section
- **AND** the section agrees with tested token behavior and the existing retention policy

## MODIFIED Requirements

### Requirement: The server creates Topics and suggests Sources for a connected account
The server SHALL expose `create_topic` and `suggest_sources`. Each SHALL return the connect-an-account result to a visitor. `create_topic` SHALL take a name, a prompt, Sources as source option and value pairs, and invite emails, run the `createTopicFromDraft` Topic Tool, and return the new Topic's id and name, annotated `destructiveHint: true`. `suggest_sources` SHALL take a name and a prompt, run the `suggestTopicDraftSources` Topic Tool, and return the suggestions, annotated `readOnlyHint: false`, conservative `destructiveHint: true`, and `openWorldHint: true` because it consumes the account's suggestion allowance.

#### Scenario: An agent makes a Topic
- **WHEN** an authenticated client calls `create_topic` within the account's limits
- **THEN** the Topic exists with a first Prompt Version of origin `mcp`, its first Scan is open, and the result names its id

#### Scenario: A visitor cannot create
- **WHEN** an anonymous client calls `create_topic`
- **THEN** the result says an account is needed and nothing is written

### Requirement: The server follows a topic for a connected account
The server SHALL expose `follow_topic`, taking a topic id and `is_following`, and calling the topic page's subscribe
write for the connected account, with `mcp` as the subscription's source. A visitor's call SHALL return the
connect-an-account result. A Topic the account may not view, a private Topic it does not own, and an owner unfollowing
their own Topic SHALL be rejected with a message, as the page's write rejects them. On the topic-bound route the topic
id SHALL default to the bound Topic. Its name, description, and argument SHALL say follow, and it SHALL be annotated
`readOnlyHint: false`, conservative `destructiveHint: true`, and `idempotentHint: true`.

#### Scenario: An agent follows a public topic
- **WHEN** an authenticated client calls `follow_topic` with `is_following: true` on a public Topic
- **THEN** the account follows the Topic, its follower count includes them, and the event names `mcp` as the source

#### Scenario: An agent unfollows
- **WHEN** an authenticated client calls `follow_topic` with `is_following: false` on a Topic it follows
- **THEN** the account no longer follows the Topic

#### Scenario: A visitor cannot follow
- **WHEN** an anonymous client calls `follow_topic`
- **THEN** the result says an account is needed and nothing is written

#### Scenario: An owner cannot unfollow their own topic
- **WHEN** a Topic's owner calls `follow_topic` with `is_following: false` on it
- **THEN** the result says the owner always follows their own Topic, and nothing changes
