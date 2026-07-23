# feed-api Specification

## Purpose
TBD - created by archiving change add-feed-homepage. Update Purpose after archive.
## Requirements
### Requirement: The Feed API assembles a user's Feed
The Feed API SHALL expose an HTTP endpoint that returns the requesting user's Feed: their Topics, and for each Topic its Findings joined to their Resources, plus the Topic metadata the homepage needs (name, tags, prompt, frequency, most recent Scan, Attachments, and Sources). Each Finding SHALL carry its relevance score, relevance explanation, rating, and the requesting user's consumed status. The response SHALL be shaped by a shared wire-contract type, never the Drizzle row types (Drizzle types stay in `db`).

#### Scenario: Feed returns topics with their findings and resources
- **WHEN** the user requests their Feed and seeded Topics with Findings exist
- **THEN** the response lists each Topic with its Findings, each Finding joined to its Resource (url, resourceKind, title, snippet) and carrying its relevance score, rating, and the user's consumed status

#### Scenario: A resource kind is read, watch, or listen from the shared arrays
- **WHEN** the Feed response includes a Finding
- **THEN** its `resourceKind` is one of `read`, `watch`, `listen`, drawn from the shared enum arrays that also feed `pgEnum`

### Requirement: The Feed defaults to unconsumed and can include consumed
The Feed API SHALL, by default, omit Findings the requesting user has marked consumed. It SHALL accept a parameter that includes consumed Findings so the client can render an "All" view. Consumed state SHALL be resolved per requesting user, never globally.

#### Scenario: Default feed hides consumed findings
- **WHEN** the user has marked a Finding consumed and requests the default Feed
- **THEN** that Finding is absent from the response

#### Scenario: All view includes consumed findings, flagged
- **WHEN** the user requests the Feed with the include-consumed parameter
- **THEN** consumed Findings are present and each is flagged consumed so the client can dim it

### Requirement: The Feed API records a rating on a Finding
The Feed API SHALL expose an endpoint that sets a Finding's rating to up, down, or cleared, writing `findings.rating`. The request body SHALL be validated by the shared rating wire contract. Setting a rating SHALL be idempotent.

#### Scenario: A thumbs-up rating is persisted idempotently
- **WHEN** the user rates a Finding up and then re-sends the same request
- **THEN** `findings.rating` for that Finding is `up` after both requests

#### Scenario: Invalid rating payload is rejected
- **WHEN** a rating request carries a value outside the shared contract
- **THEN** the API rejects it without writing

### Requirement: The Feed API marks and unmarks a Finding consumed
The Feed API SHALL expose endpoints that mark a Finding consumed for the requesting user and that unmark it, backed by the `consumptions` table. Marking SHALL be idempotent (a second mark is a no-op); unmarking SHALL return the Finding to the default Feed. Opening a Resource (the client click-through) SHALL mark its Finding consumed through the same mark path.

#### Scenario: Mark then unmark round-trips
- **WHEN** the user marks a Finding consumed and later unmarks it
- **THEN** a `consumptions` row for (user, Finding) exists after the mark and is gone after the unmark, and the Finding returns to the default Feed

#### Scenario: Consumed is per-user
- **WHEN** one user marks a Finding consumed
- **THEN** a different user's default Feed still shows that Finding

### Requirement: The UI drives the Feed API through a types-only edge
The Feed API SHALL export an `AppType` describing its routes so the UI drives it with a Hono RPC client. The `ui → api` import SHALL be types-only: `api` emits declarations and no value import SHALL cross from `ui` into `api`. Request and response payloads SHALL be validated against the shared wire contract on the UI side.

#### Scenario: The type edge compiles with no value import crossing
- **WHEN** `bunx tsc -b` runs
- **THEN** the UI type-checks against the API's `AppType` and no runtime value is imported from `api` into `ui`

### Requirement: The Feed API assembles the homepage in a bounded number of queries

The Feed API SHALL assemble a user's Feed using a number of database round trips that is fixed and independent of the number of Topics in the response. It SHALL fetch each per-Topic dataset — Findings joined to their Resources, Sources, Attachments, the most recent succeeded Scan, and the subscriber count — across every Topic id at once, then stitch the results back to each Topic in memory. This SHALL NOT change the wire response shape, the per-user consumed status that sets each Finding's `isConsumed`, or the rating-eligibility (`canRate`) flag.

#### Scenario: Feed assembly does not scale round trips with Topic count

- **WHEN** a user requests their Feed and the number of Topics across the Your, Featured, and Popular sections grows
- **THEN** the number of database queries used to assemble the Feed stays fixed and does not grow per Topic

#### Scenario: Batched assembly preserves the response shape and per-user state

- **WHEN** a user with Findings consumed across several Topics requests their Feed
- **THEN** each Topic carries the same fields as before (identity, metadata, latest Scan, Sources, Attachments, subscriber count, and Findings joined to their Resources), each Finding's `isConsumed` reflects that user's own consumed rows, and `canRate` is set by the existing owner-or-subscriber rule

