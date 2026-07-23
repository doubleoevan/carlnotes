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

Curation SHALL embed a Resource's title and native snippet with the LiteLLM-routed embedding model, storing the vector in `resources.embedding` and the model name in `resources.embedding_model`. The embedding dimension SHALL match the schema's `embedding` column (768). A Resource that already carries an embedding SHALL be reused rather than re-embedded, since embeddings are global to the Resource.

#### Scenario: Embedding and its model are stored

- **WHEN** curation embeds a Resource that has no embedding
- **THEN** the row stores the vector `embedding` and the `embedding_model` that produced it

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

For each embed-filter survivor, curation SHALL fetch the page's full content via Firecrawl (raw HTTP, `FIRECRAWL_API_KEY`) into `resources.content`. On a fetch failure it SHALL fall back to the Resource's native snippet — never the bare title — as the scoring substrate, and SHALL NOT fail the Resource or the Scan.

#### Scenario: Content is fetched and stored

- **WHEN** a survivor is fetched successfully
- **THEN** its `content` column holds the fetched full content and scoring runs against that content

#### Scenario: Fetch failure falls back to the snippet

- **WHEN** the Firecrawl fetch for a survivor fails
- **THEN** scoring runs against the Resource's native snippet, the Resource is not failed, and the Scan continues

### Requirement: A per-Scan spend cap halts paid stages

Curation SHALL enforce a per-Scan USD spend ceiling, checked before each paid stage (Firecrawl fetch, premium scoring). Once the Scan's accumulated spend reaches the ceiling, curation SHALL stop initiating paid work and leave the remaining Resources unscored — carried to a later Scan — without failing the Scan. The cheap embed and embed-filter stages SHALL NOT be truncated by the cap.

#### Scenario: The cap halts further paid work

- **WHEN** the Scan's accumulated spend reaches the per-Scan ceiling mid-curation
- **THEN** no further fetch or premium-scoring work is initiated for the remaining Resources

#### Scenario: Unscored Resources are carried and the Scan still succeeds

- **WHEN** the cap leaves some discovered Resources unscored
- **THEN** those Resources get no Finding this Scan, the Scan is still `succeeded`, and they remain eligible for a later Scan

#### Scenario: Cheap stages run regardless of the cap

- **WHEN** the cap has been reached
- **THEN** the embed and embed-filter stages still run for the remaining Resources, since they incur no metered LLM/fetch spend

### Requirement: The Scan records per-stage cost and curation counts

On close, curation SHALL record each stage's dollar cost in `scans.stage_costs` (keyed at least by embedding, fetch, cheap scoring, and premium scoring) and set `scans.cost` to the total across ingestion and curation. It SHALL set `kept_count` to the number of Findings written and `filtered_count` to the number of Resources dropped by hash dedupe, embedding dedupe, or the embed-filter, and SHALL write the scan report to `scans.scan_summary`.

The scan report SHALL be a dated markdown note grounded only in the Scan's actual data — the kept Findings' titles, urls, scores, and relevance explanations; drop, deferral, and failure counts with their causes; per-Source outcomes including fallback degradations; and costs. It SHALL cover, when the data supports each: a dated headline; insights and trends drawn across the kept items' relevance explanations; adds and drops with reasoning; sources consulted and skipped with reasoning; data-hygiene actions taken; list and threshold status against a target the topic context itself states; a closing notification decision (send or suppress) with rationale; and a cited-sources list of markdown links to the kept items. A Scan with nothing to review MAY leave `scan_summary` empty.

#### Scenario: Per-stage costs are recorded and summed into the total

- **WHEN** a Scan completes curation
- **THEN** `stage_costs` holds each stage's dollar cost and `cost` equals the sum of ingestion cost and every curation stage cost

#### Scenario: Kept and filtered counts are recorded

- **WHEN** curation finishes
- **THEN** `kept_count` equals the number of Findings written and `filtered_count` equals the number of Resources dropped by dedupe or the embed-filter

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

