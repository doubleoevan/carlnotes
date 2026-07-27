## ADDED Requirements

### Requirement: Curation reuses fresh content and revalidates stale content before fetching

Before any Firecrawl fetch, curation SHALL resolve an embed-filter survivor's content by reuse or revalidation when possible, so already-stored content is not re-scraped:

- **Reuse (free):** when the Resource already has `content` and `now − fetched_at < CONTENT_TTL_MS` (an env-overridable constant), curation SHALL score the stored `content` without any fetch, spend no fetch credit, and count the outcome as `reused`.
- **Revalidate (free):** when the Resource has `content` that is stale (`fetched_at` at or beyond `CONTENT_TTL_MS`) and carries at least one stored validator (`etag` or `last_modified`), curation SHALL send a plain conditional GET to the Resource URL directly — not through Firecrawl — with `If-None-Match` and/or `If-Modified-Since` built from the stored validators, bounded by its own short `AbortSignal.timeout`. A `304 Not Modified` SHALL refresh `fetched_at`, reuse the stored `content`, spend no fetch credit, and count the outcome as `revalidated`. Any other status, a probe error or timeout, or absent validators SHALL fall through to the Firecrawl fetch. The probe SHALL NOT fail the Resource or the Scan.

#### Scenario: Fresh stored content is reused without any fetch

- **WHEN** a survivor already has `content` and its `fetched_at` is within `CONTENT_TTL_MS`
- **THEN** curation scores the stored content, makes no Firecrawl call, charges no fetch cost, and counts the outcome as `reused`

#### Scenario: A stale Resource with a matching validator returns 304 and is reused

- **WHEN** a survivor's `content` is stale but it has a stored `etag` or `last_modified`, and a conditional GET to its URL returns `304`
- **THEN** curation refreshes `fetched_at`, reuses the stored content, makes no Firecrawl call, charges no fetch cost, and counts the outcome as `revalidated`

#### Scenario: A non-304 conditional response falls through to Firecrawl

- **WHEN** the conditional GET returns any status other than `304`
- **THEN** curation abandons the probe result and performs the normal Firecrawl fetch

#### Scenario: A probe error or timeout falls through without failing the Resource

- **WHEN** the conditional GET throws or exceeds its `AbortSignal.timeout`
- **THEN** curation falls through to the Firecrawl fetch, and the probe failure neither fails the Resource nor the Scan

#### Scenario: Stale content with no stored validators skips straight to Firecrawl

- **WHEN** a survivor's `content` is stale and it has neither `etag` nor `last_modified`
- **THEN** curation makes no conditional GET and performs the Firecrawl fetch directly

## MODIFIED Requirements

### Requirement: Survivors are fetched via Firecrawl with a snippet fallback

For each embed-filter survivor that reaches the fetch stage and is neither reused nor revalidated (see the reuse-and-revalidation requirement), curation SHALL fetch the page's full content via Firecrawl (raw HTTP, `FIRECRAWL_API_KEY`) into `resources.content`, refresh `resources.fetched_at`, persist any origin `etag`/`last_modified` the fetch response exposes (leaving them null when it does not), and count the outcome as `fetched`. On a fetch failure it SHALL fall back to the Resource's native snippet — never the bare title — as the text to score, and SHALL NOT fail the Resource or the Scan.

#### Scenario: Content is fetched and stored

- **WHEN** a survivor is fetched successfully via Firecrawl
- **THEN** its `content` column holds the fetched full content, `fetched_at` is refreshed, the outcome is counted as `fetched`, and scoring runs against that content

#### Scenario: Fetch validators are persisted when exposed

- **WHEN** the Firecrawl fetch response exposes an origin `etag` or `last_modified`
- **THEN** curation stores them on the Resource so a later Scan can send a conditional GET, and leaves them null when the response exposes neither

#### Scenario: Fetch failure falls back to the snippet

- **WHEN** the Firecrawl fetch for a survivor fails
- **THEN** scoring runs against the Resource's native snippet, the Resource is not failed, and the Scan continues

### Requirement: A per-Scan spend cap halts paid stages

Curation SHALL enforce, before each Resource enters the paid fetch-and-scoring section, two per-Scan ceilings: the existing USD spend ceiling, and a `MAX_SCORED_RESOURCES_PER_SCAN` count ceiling (env-overridable) on how many Resources are sent through the paid section in the Scan. The count ceiling SHALL bound every Resource that enters the paid section — whether its content was reused, revalidated, or freshly fetched — because scoring is paid in every case; the fetch-outcome counts (`reused + revalidated + fetched`) SHALL therefore never exceed it. Once either ceiling is reached, curation SHALL stop initiating paid work and leave the remaining Resources unscored — carried to a later Scan — without failing the Scan. The cheap embed and embed-filter stages SHALL NOT be truncated by either cap.

#### Scenario: The cap halts further paid work

- **WHEN** the Scan reaches either the USD ceiling or the `MAX_SCORED_RESOURCES_PER_SCAN` count mid-curation
- **THEN** no further fetch, revalidation, or scoring work is initiated for the remaining Resources

#### Scenario: The count cap halts paid work independent of spend

- **WHEN** the Scan's `reused + revalidated + fetched` count reaches `MAX_SCORED_RESOURCES_PER_SCAN` while the USD ceiling is not yet reached
- **THEN** the remaining survivors are deferred unscored, even though spend is under the dollar ceiling

#### Scenario: Unscored Resources are carried and the Scan still succeeds

- **WHEN** a cap leaves some discovered Resources unscored
- **THEN** those Resources get no Finding this Scan, the Scan is still `succeeded`, and they remain eligible for a later Scan

#### Scenario: Cheap stages run regardless of the cap

- **WHEN** a cap has been reached
- **THEN** the embed and embed-filter stages still run for the remaining Resources, since they incur no metered LLM/fetch spend

### Requirement: The Scan records per-stage cost and curation counts

On close, curation SHALL record each stage's dollar cost in `scans.stage_costs` (keyed at least by embedding, fetch, cheap scoring, and premium scoring) and set `scans.cost` to the total across ingestion and curation. It SHALL set `kept_count` to the number of Findings written and `filtered_count` to the number of Resources dropped by hash dedupe, embedding dedupe, or the embed-filter, and SHALL write the scan report to `scans.scan_summary`. It SHALL also record the fetch-outcome counts to `scans.reused`, `scans.revalidated`, and `scans.fetched` — the number of Resources whose content was reused within the TTL, revalidated via a `304`, or freshly fetched — whose sum equals the number of Resources sent through the paid fetch-and-scoring section.

The scan report SHALL be a dated markdown note grounded only in the Scan's actual data — the kept Findings' titles, urls, scores, and relevance explanations; drop, deferral, and failure counts with their causes; per-Source outcomes including fallback degradations; and costs. It SHALL cover, when the data supports each: a dated headline; insights and trends drawn across the kept items' relevance explanations; adds and drops with reasoning; sources consulted and skipped with reasoning; data-hygiene actions taken; list and threshold status against a target the topic context itself states; a closing notification decision (send or suppress) with rationale; and a cited-sources list of markdown links to the kept items. A Scan with nothing to review MAY leave `scan_summary` empty.

#### Scenario: Per-stage costs are recorded and summed into the total

- **WHEN** a Scan completes curation
- **THEN** `stage_costs` holds each stage's dollar cost and `cost` equals the sum of ingestion cost and every curation stage cost

#### Scenario: Kept and filtered counts are recorded

- **WHEN** curation finishes
- **THEN** `kept_count` equals the number of Findings written and `filtered_count` equals the number of Resources dropped by dedupe or the embed-filter

#### Scenario: Fetch-outcome counts are recorded

- **WHEN** curation finishes
- **THEN** `scans.reused`, `scans.revalidated`, and `scans.fetched` hold the per-outcome tallies and their sum equals the number of Resources sent through the paid fetch-and-scoring section

#### Scenario: The scan report is written and grounded

- **WHEN** curation finishes reviewing at least one Resource
- **THEN** `scan_summary` holds a non-empty dated markdown report that cites only items, sources, and numbers from the Scan's data, with markdown links to the kept items

#### Scenario: The report records a notification decision

- **WHEN** the scan report is written
- **THEN** its body ends with an explicit send-or-suppress notification recommendation and the rationale, and no notification is actually dispatched by curation
