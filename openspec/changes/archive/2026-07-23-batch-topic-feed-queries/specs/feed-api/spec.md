## ADDED Requirements

### Requirement: The Feed API assembles the homepage in a bounded number of queries

The Feed API SHALL assemble a user's Feed using a number of database round trips that is fixed and independent of the number of Topics in the response. It SHALL fetch each per-Topic dataset — Findings joined to their Resources, Sources, Attachments, the most recent succeeded Scan, and the subscriber count — across every Topic id at once, then stitch the results back to each Topic in memory. This SHALL NOT change the wire response shape, the per-user consumed status that sets each Finding's `isConsumed`, or the rating-eligibility (`canRate`) flag.

#### Scenario: Feed assembly does not scale round trips with Topic count

- **WHEN** a user requests their Feed and the number of Topics across the Your, Featured, and Popular sections grows
- **THEN** the number of database queries used to assemble the Feed stays fixed and does not grow per Topic

#### Scenario: Batched assembly preserves the response shape and per-user state

- **WHEN** a user with Findings consumed across several Topics requests their Feed
- **THEN** each Topic carries the same fields as before (identity, metadata, latest Scan, Sources, Attachments, subscriber count, and Findings joined to their Resources), each Finding's `isConsumed` reflects that user's own consumed rows, and `canRate` is set by the existing owner-or-subscriber rule
