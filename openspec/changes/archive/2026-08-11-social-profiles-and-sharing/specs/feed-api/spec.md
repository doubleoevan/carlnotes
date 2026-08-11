## MODIFIED Requirements

### Requirement: The Feed API assembles the homepage in a bounded number of queries

The Feed API SHALL assemble a user's Feed using a number of database round trips that is fixed and independent of the number of Topics in the response, and SHALL bound the number of Topics whose per-Topic data is loaded. For the public sections it SHALL load only the featured Topics and the top-N non-featured Topics ranked by the denormalised `topics.subscriber_count` column — never loading feed data for public Topics that will not render — alongside the owner's own Topics for a signed-in user. It SHALL fetch each per-Topic dataset — Findings joined to their Resources, Sources, Attachments, the most recent succeeded Scan, and the subscriber count — across every loaded Topic id at once, then stitch the results back to each Topic in memory. Rating-eligibility (`canRate`) for a signed-in user SHALL be resolved from one batched query returning the Topic ids the user may rate as a subscriber — a direct `subscriptions.subscriber_user_id` match OR an audience membership, matching `hasSubscription` — passed as a set into a synchronous `buildTopicFeed`, never one subscription query per Topic. The owner SHALL stay eligible to rate their own Topic without a subscription row. This SHALL NOT change the per-user consumed status that sets each Finding's `isConsumed`, the `canRate` result, the owner "Yours" section, or the signed-out path. Featured and Popular SHALL be disjoint sections, and both SHALL draw only from public Topics holding the Finding minimum, filtered before any ranking or top-N cut.

The subscriber count SHALL be read from the stored column rather than recomputed by subquery, so ranking and the public follower figure read the same number and the read cost does not grow with the number of subscribers. The column's definition — direct subscribers plus audience-inherited members, never the owner's own subscription — is the one stated in `public-profiles`, and the ranking inherits it.

The wire response SHALL gain the owner byline for each public Topic — the owner's user id, username, and public avatar source, never Better Auth's private `image` — so Featured can credit its owner without a request per Topic. No other field SHALL change shape.

#### Scenario: Feed assembly does not scale round trips with Topic count

- **WHEN** a signed-in user requests their Feed and the number of Topics across the Your, Featured, and Popular sections grows
- **THEN** the number of database queries stays fixed, and rating-eligibility is resolved from one batched query rather than one subscription query per Topic

#### Scenario: Only featured and top-N popular public Topics are loaded

- **WHEN** the public Topic set is larger than the featured Topics plus the popular limit
- **THEN** only the featured Topics and the top-N non-featured Topics by subscriber count have their feed data loaded, and other public Topics have none built

#### Scenario: Popular ranking reads the stored count

- **WHEN** the popular section is ranked
- **THEN** it orders by the `topics.subscriber_count` column, and runs no per-Topic subscriber subquery

#### Scenario: Rate-eligibility stays correct for both subscriber paths

- **WHEN** a signed-in non-owner is subscribed to one public Topic directly and to another through an audience they belong to
- **THEN** `canRate` is true for both Topics and false for a public Topic they are not subscribed to, matching the prior owner-or-subscriber rule

#### Scenario: The signed-out path is preserved

- **WHEN** a request carries no session
- **THEN** the API returns the Featured and Popular sections with no "Yours" section, loading no owner data and reading no user's private data

#### Scenario: Batched assembly preserves the response shape and per-user state

- **WHEN** a user with Findings consumed across several Topics requests their Feed
- **THEN** each Topic carries the same fields as before plus the owner byline (identity, metadata, latest Scan, Sources, Attachments, subscriber count, owner byline, and Findings joined to their Resources), and each Finding's `isConsumed` reflects that user's own consumed rows

#### Scenario: The payload carries the owner byline

- **WHEN** the feed returns a public Topic
- **THEN** it carries that Topic owner's username and avatar inputs, and the client renders the byline without a further request
