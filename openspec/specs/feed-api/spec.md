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

The Feed API SHALL assemble a user's Feed using a number of database round trips that is fixed and independent of the number of Topics in the response, and SHALL bound the number of Topics whose per-Topic data is loaded. For the public sections it SHALL load only the featured Topics and the top-N non-featured Topics ranked by the denormalised `topics.subscriber_count` column — never loading feed data for public Topics that will not render — alongside the owner's own Topics for a signed-in user. It SHALL fetch each per-Topic dataset — Findings joined to their Resources, Sources, Attachments, the most recent succeeded Scan, the subscriber count, and the holding-Team count — across every loaded Topic id at once, then stitch the results back to each Topic in memory. Rating-eligibility (`canRate`) for a signed-in user SHALL be resolved from one batched query returning the Topic ids the user may rate as a subscriber — a direct `subscriptions.subscriber_user_id` match, matching `hasSubscription` — passed as a set into a synchronous `buildTopicFeed`, never one subscription query per Topic. The owner SHALL stay eligible to rate their own Topic without a subscription row. This SHALL NOT change the per-user consumed status that sets each Finding's `isConsumed`, the `canRate` result, the owner "Yours" section, or the signed-out path. Featured and Popular SHALL be disjoint sections, and both SHALL draw only from public Topics holding the Finding minimum, filtered before any ranking or top-N cut.

The subscriber count SHALL be read from the stored column instead of recomputed by subquery, so ranking and the public follower figure read the same number and the read cost does not grow with the number of subscribers. The column's definition — the Topic's active subscribing users, never the owner's own subscription — is the one stated in `public-profiles`, and the ranking inherits it.

The feed response SHALL gain the owner byline for each public Topic — the owner's user id, username, and public avatar source, never Better Auth's private `image` — so Featured can credit its owner without a request per Topic. No other field SHALL change shape.

Every Topic payload SHALL include the number of Teams holding it, and the Topic roast SHALL show that count as a Teams line directly under the follower count, wherever the roast renders. Because the first Team to hold a Topic takes the owning `topics.team_id` column and every later one gets a `team_topics` row, the count SHALL be the `team_topics` rows plus one for an owning Team, so the figure means holding Teams and not shared-in rows alone. The Feed API SHALL read it as one grouped query across every loaded Topic id, and the Topic page SHALL read it in the Team facts it already loads, so the two surfaces cannot disagree.

#### Scenario: Feed assembly does not scale round trips with Topic count

- **WHEN** a signed-in user requests their Feed and the number of Topics across the Your, Featured, and Popular sections grows
- **THEN** the number of database queries stays fixed, and rating-eligibility is resolved from one batched query instead of one subscription query per Topic

#### Scenario: Only featured and top-N popular public Topics are loaded

- **WHEN** the public Topic set is larger than the featured Topics plus the popular limit
- **THEN** only the featured Topics and the top-N non-featured Topics by subscriber count have their feed data loaded, and other public Topics have none built

#### Scenario: Popular ranking reads the stored count

- **WHEN** the popular section is ranked
- **THEN** it orders by the `topics.subscriber_count` column, and runs no per-Topic subscriber subquery

#### Scenario: Rate-eligibility follows subscriptions

- **WHEN** a signed-in non-owner is subscribed to one public Topic and not another
- **THEN** `canRate` is true for the subscribed Topic and false for the other, matching the owner-or-subscriber rule

#### Scenario: The signed-out path is preserved

- **WHEN** a request has no session
- **THEN** the API returns the Featured and Popular sections with no "Yours" section, loading no owner data and reading no user's private data

#### Scenario: Batched assembly preserves the response shape and per-user state

- **WHEN** a user with Findings consumed across several Topics requests their Feed
- **THEN** each Topic has the same fields as before plus the owner byline (identity, metadata, latest Scan, Sources, Attachments, subscriber count, owner byline, and Findings joined to their Resources), and each Finding's `isConsumed` reflects that user's own consumed rows

#### Scenario: The payload includes the owner byline

- **WHEN** the feed returns a public Topic
- **THEN** it includes that Topic owner's username and avatar inputs, and the ui renders the byline without a further request

#### Scenario: The roast counts holding Teams

- **WHEN** a Topic is held by an owning Team and shared into two more, and its roast is opened from the feed, the Topic page, or a profile's topic table
- **THEN** every one of them reads a Teams count of three under the follower count, and the feed resolves it from one grouped query instead of one per Topic

#### Scenario: A Topic no Team holds counts zero

- **WHEN** a Topic has no owning Team and no shared-in row
- **THEN** its Teams count is zero, and the roast shows the line instead of hiding it

#### Scenario: The payload carries the owner byline

- **WHEN** the feed returns a public Topic
- **THEN** it carries that Topic owner's username and avatar inputs, and the client renders the byline without a further request

### Requirement: The topic feed read is public; a session only enriches it
The `GET /topic-feed` route SHALL resolve an optional Better Auth session and SHALL respond to a request with no session rather than rejecting it. A signed-out visitor SHALL receive the Featured and Popular sections. A signed-in user SHALL additionally receive their own "Yours" section.

#### Scenario: A signed-out visitor gets the public sections
- **WHEN** a request to the topic feed carries no session or an invalid/expired one
- **THEN** the API responds 200 with the Featured and Popular sections, no "Yours" section, and reads no user's private data

#### Scenario: A signed-in user also gets their own section
- **WHEN** a request to the topic feed carries a valid session
- **THEN** the API resolves that user and responds with their "Yours" section alongside Featured and Popular

### Requirement: Feed mutations require a session
The rating, consume, and view routes SHALL require a valid Better Auth session. A request with no valid session SHALL receive a 401 and SHALL perform no write. An authenticated request SHALL remain subject to the existing ownership and subscription checks.

#### Scenario: An unauthenticated mutation is rejected
- **WHEN** a rating, consume, or view request carries no session or an invalid/expired one
- **THEN** the API responds 401 and performs no write on any user's behalf

#### Scenario: A missing session is distinct from a forbidden action
- **WHEN** an authenticated user acts on a Finding they don't own and aren't subscribed to
- **THEN** the API responds 403 (unchanged existing behavior), reserving 401 for the no-session case

### Requirement: The feed payload carries the remaining topic allowance
The Feed response SHALL include `topicsRemaining`: how many more topics the current user may create under the topic cap, floored at zero, so the homepage can render the Add Topic allowance without a second request. The cap counts the topics the user holds — not creations per day — so deleting a topic frees a slot.

#### Scenario: The feed reports remaining topic slots
- **WHEN** a user holding two topics loads the Feed under a cap of five
- **THEN** the payload carries `topicsRemaining: 3`

### Requirement: Topic findings carry bookmark and engagement fields
Every topic finding in feed and topic-page payloads SHALL carry `isBookmarked`, resolved for the requesting user, and `engagement`, the Resource's captured signal or null, so the client can render the pinned group, the Bookmarked view, and the trending sort without further requests. The existing include-consumed parameter is unchanged: the Bookmarked view filters client-side over the delivered payload, the same way the Unread view already does.

#### Scenario: The payload carries both fields
- **WHEN** a signed-in user requests a feed containing a bookmarked reddit Finding
- **THEN** that finding carries `isBookmarked` true and its reddit score as `engagement`

#### Scenario: The Bookmarked view needs no extra request
- **WHEN** the user switches the filter to Bookmarked
- **THEN** the client filters the already-delivered Findings by `isBookmarked` with no new fetch

