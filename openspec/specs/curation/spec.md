# curation Specification

## Purpose
TBD - created by archiving change add-curation-pipeline. Update Purpose after archive.
## Requirements
### Requirement: Curation runs after ingestion within the same Scan

`runTopicScan` SHALL run curation after it upserts the Scan's Resources and before it closes the Scan: the Scan stays `running` through curation and is closed exactly once, recording curation's outputs alongside ingestion's. Curation SHALL process the Resources the Scan discovered that do not yet have a Finding for the Topic; a Resource already scored for the Topic SHALL be left untouched (its Finding stands). A curation failure SHALL finalize the Scan as `failed` with the error recorded, never leaving it stuck `running`.

#### Scenario: Curation runs before the Scan closes

- **WHEN** a Scan's Sources have emitted Resources and ingestion has upserted them
- **THEN** curation runs over the newly discovered, unscored Resources and the Scan is closed once, after curation, with its curation outputs recorded

#### Scenario: Already-scored Resources are skipped

- **WHEN** a discovered Resource already has a Finding for the Topic
- **THEN** curation does not re-score it and no duplicate Finding is created

#### Scenario: A curation failure fails the Scan

- **WHEN** curation throws an unrecoverable error
- **THEN** the Scan is marked `failed`, the error is recorded, and it is not left `running`

### Requirement: Content-hash dedupe drops content-level duplicates

Curation SHALL compute a content hash (SHA-256 over the Resource's normalized title and native snippet) and persist it to `resources.content_hash`. A Resource whose content hash matches another Resource — already stored, or already processed earlier in the same Scan — SHALL be dropped as a filtered duplicate and SHALL NOT be scored. This content-level dedupe is distinct from the canonical-URL dedupe ingestion already performs.

#### Scenario: Content-identical Resource at a different URL is dropped

- **WHEN** a Resource's content hash equals that of another Resource with a different canonical URL
- **THEN** the duplicate is dropped as filtered, produces no Finding, and the original stands

#### Scenario: The content hash is persisted

- **WHEN** curation processes a Resource
- **THEN** its `content_hash` is written so later Scans can dedupe against it

### Requirement: Resources are embedded through the LiteLLM proxy

Curation SHALL embed a Resource's title and native snippet with the LiteLLM-routed embedding model, storing the vector in `resources.embedding` and, in `resources.embedding_model`, an identifier of the vector space — the underlying model and its dimension — rather than the routing alias. Because the proxy drops the dimension parameter and returns the model's full-width vector, every embedding SHALL pass through one helper that truncates to the schema's dimension (1024) and L2-normalizes the slice; the helper SHALL assert the raw vector is at least that long so a shorter model fails loudly rather than padding. A Resource that already carries an embedding SHALL be reused rather than re-embedded, since embeddings are global to the Resource.

#### Scenario: Embedding and its model are stored

- **WHEN** curation embeds a Resource that has no embedding
- **THEN** the row stores the 1024-dimension vector `embedding` and an `embedding_model` naming the model and dimension that produced it, not the routing alias

#### Scenario: An already-embedded Resource is reused

- **WHEN** curation reaches a Resource that already has an `embedding`
- **THEN** it is not re-embedded and the existing vector is reused

### Requirement: Embedding dedupe drops near-duplicates

Curation SHALL drop, as a filtered duplicate, a Resource whose embedding is within a cosine near-duplicate threshold of an already-stored Resource's embedding. A Resource that is not within the threshold of any stored Resource SHALL proceed.

#### Scenario: A near-duplicate is dropped

- **WHEN** a Resource's embedding is within the near-duplicate threshold of a stored Resource's embedding
- **THEN** the Resource is dropped as filtered and produces no Finding

#### Scenario: A distinct Resource proceeds

- **WHEN** a Resource's embedding is outside the near-duplicate threshold of every stored Resource
- **THEN** the Resource proceeds to the embed-filter

### Requirement: Embed-filter gates paid stages on topic-context relevance

Curation SHALL embed the topic's effective context (`topicScanContext` — the topic's own `context` merged with its attachments' `context`) and drop, as filtered, any Resource whose cosine similarity to that context embedding is below the relevance threshold. This gate SHALL run before either paid stage (Firecrawl fetch, LLM scoring), so a Resource that fails it incurs no fetch or scoring spend — only the cheap embedding the gate itself required. When the topic's effective context is empty, the filter SHALL fall back to embedding the topic `name`, mirroring the search adapter.

#### Scenario: A below-threshold Resource is filtered before any paid stage

- **WHEN** a Resource's similarity to the topic-context embedding is below the relevance threshold
- **THEN** it is dropped as filtered and no Firecrawl fetch or scoring call is made for it (its embedding already ran, for the gate)

#### Scenario: An above-threshold Resource proceeds to fetch and scoring

- **WHEN** a Resource's similarity to the topic-context embedding is at or above the threshold
- **THEN** it proceeds to the fetch stage

#### Scenario: Empty effective context falls back to the topic name

- **WHEN** the topic's effective context is empty
- **THEN** the embed-filter compares against the embedding of the topic `name` rather than an empty context

### Requirement: Survivors are fetched via Firecrawl with a snippet fallback

For each embed-filter survivor that reaches the fetch stage and is neither reused nor revalidated (see the reuse-and-revalidation requirement), curation SHALL fetch the page's full content via Firecrawl (raw HTTP, `FIRECRAWL_API_KEY`), write the fetched markdown to object storage, store its `content_key` and `content_bytes` on the Resource, refresh `resources.fetched_at`, persist any origin `etag`/`last_modified` the fetch response exposes (leaving them null when it does not), and count the outcome as `fetched`. It SHALL score the in-memory markdown in the same pass so the fetch does not round-trip through object storage. On a Firecrawl fetch failure it SHALL fall back to the Resource's native snippet — never the bare title — as the text to score. On an object-storage write failure it SHALL best-effort delete the object, leave `content_key` null, and fall back to the snippet, mirroring the attachment orphan-cleanup posture. Neither failure SHALL fail the Resource or the Scan.

#### Scenario: Content is fetched and stored

- **WHEN** a survivor is fetched successfully via Firecrawl
- **THEN** the fetched markdown is written to object storage, the Resource stores its `content_key` and `content_bytes`, `fetched_at` is refreshed, the outcome is counted as `fetched`, and scoring runs against the in-memory markdown without re-reading it from object storage

#### Scenario: Fetch validators are persisted when exposed

- **WHEN** the Firecrawl fetch response exposes an origin `etag` or `last_modified`
- **THEN** curation stores them on the Resource so a later Scan can send a conditional GET, and leaves them null when the response exposes neither

#### Scenario: Fetch failure falls back to the snippet

- **WHEN** the Firecrawl fetch for a survivor fails
- **THEN** scoring runs against the Resource's native snippet, `content_key` stays null, and the Resource is not failed

#### Scenario: An object-storage write failure falls back to the snippet

- **WHEN** the object-storage write for a fetched survivor fails
- **THEN** curation best-effort deletes the object, leaves `content_key` null, scores the snippet, and does not fail the Resource or the Scan

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

### Requirement: Tiered LLM scoring produces Findings with relevance explanations

Curation SHALL score each fetched survivor against the topic's effective context with a cheap-tier model routed through LiteLLM. A survivor whose first-pass score is at or above the promotion threshold SHALL be re-scored by a premium-tier model that also writes a substantive relevance explanation: several sentences of plain prose that first summarize what the content actually says (its specific claims, findings, numbers, names, or events) and then explain how it relates to the topic context — enough substance that the reader gets the gist without opening the source. A single-line note does not satisfy this. Curation SHALL upsert one Finding per `(topic, resource)` carrying the `relevance_score`, the `relevance_explanation`, and the `scan_id`. Only curation writes Findings; adapters never do.

#### Scenario: A relevant Resource becomes a scored Finding with a relevance explanation

- **WHEN** a survivor scores at or above the promotion threshold and is re-scored by the premium tier
- **THEN** a Finding is written for `(topic, resource)` with the premium `relevance_score`, a substantive multi-sentence `relevance_explanation`, and the current `scan_id`

#### Scenario: Only promoted Resources reach the premium tier

- **WHEN** a survivor's cheap-tier score is below the promotion threshold
- **THEN** it is not re-scored by the premium tier, consumes no premium-tier spend, and its Finding carries an empty `relevance_explanation`

#### Scenario: Writing a Finding is idempotent per (topic, resource)

- **WHEN** a Finding is written for a `(topic, resource)` that already has one
- **THEN** the existing row is updated via the `(topic_id, resource_id)` unique constraint rather than duplicated, so a Finding is never doubled (the pipeline normally skips already-scored Resources per the first requirement; this keeps a re-write safe)

### Requirement: Curation embeds queries and documents by the model's instruction convention

Curation SHALL embed the topic's effective context as the query side and each Resource as the document side, applying the embedding model's query instruction to the query side only and leaving documents as plain text, per the model's guidance. Both sides SHALL use the same model and dimension so their cosine similarity is meaningful — a vector-space mismatch yields a plausible but wrong similarity with no error — so the two call sites SHALL derive their model from one shared seam. Resource-to-Resource dedupe compares document embeddings and SHALL apply no instruction.

#### Scenario: The query side carries the instruction, the document side does not

- **WHEN** curation embeds the topic context for the relevance gate and a Resource for scoring or dedupe
- **THEN** the topic-context embedding is produced with the model's query instruction and the Resource embedding is produced from plain text

#### Scenario: Both embed sites share one vector space

- **WHEN** the topic context and a Resource are embedded and compared by cosine similarity
- **THEN** both were produced by the same model at the same dimension, so the similarity is valid

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

### Requirement: Curation reads a Resource's stored body from object storage

When curation needs a Resource's stored page body that is not already in memory — for example scoring a Resource whose content an earlier Scan fetched — it SHALL read the body through `getResourceContent(content_key)` rather than from a Postgres column. The check that decides whether a Resource has stored content SHALL key on `content_key` being non-null. A read that fails — the object is missing, or object storage is unreachable — SHALL be treated as a cache miss and fall through to the normal fetch path, never failing the Resource or the Scan. Inline content could not fail to read, so this read is the one new way reuse can fail.

#### Scenario: A stored body is read from object storage for scoring

- **WHEN** curation scores a Resource whose body was fetched by an earlier Scan and is not in memory
- **THEN** it reads the markdown via `getResourceContent(content_key)` and scores that

#### Scenario: A Resource with no key has no stored content

- **WHEN** a Resource's `content_key` is null
- **THEN** curation treats it as having no stored content and does not attempt an object-storage read

#### Scenario: An unreadable stored object falls through to a fetch

- **WHEN** a Resource has a `content_key` but the object is missing or object storage errors on the read
- **THEN** curation logs it, treats the Resource as having no reusable content, and fetches the page again rather than failing the Resource

### Requirement: Deleting a Resource deletes its stored content

Deleting a Resource SHALL best-effort delete its stored content object via `deleteResourceContent(content_key)` when the Resource has a `content_key`, so a deleted Resource leaves no orphaned object. A best-effort delete failure SHALL NOT fail the deletion.

#### Scenario: Deleting a Resource removes its object

- **WHEN** a Resource with a `content_key` is deleted
- **THEN** its stored content object is best-effort deleted

