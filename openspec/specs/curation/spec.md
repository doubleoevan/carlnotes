# curation Specification

## Purpose
TBD - created by archiving change add-curation-pipeline. Update Purpose after archive.
## Requirements
### Requirement: Curation runs after ingestion within the same Scan

`runTopicScan` SHALL run curation after it upserts the Scan's Resources and before it closes the Scan: the Scan stays `running` through curation and is closed exactly once, recording curation's outputs alongside ingestion's. Curation SHALL process the Resources the Scan discovered that do not yet have a Finding for the Topic; a Resource already scored for the Topic SHALL be left untouched (its Finding stands). A curation failure SHALL finalize the Scan as `failed` with the error recorded, never leaving it stuck `running`.

#### Scenario: Curation runs before the Scan closes

- **WHEN** a Scan's Sources have returned Resources and ingestion has upserted them
- **THEN** curation runs over the newly discovered, unscored Resources and the Scan is closed once, after curation, with its curation outputs recorded

#### Scenario: Already-scored Resources are skipped

- **WHEN** a discovered Resource already has a Finding for the Topic
- **THEN** curation does not re-score it and no duplicate Finding is created

#### Scenario: A curation failure fails the Scan

- **WHEN** curation throws an unrecoverable error
- **THEN** the Scan is marked `failed`, the error is recorded, and it is not left `running`

### Requirement: Content-hash dedupe drops content-level duplicates

Curation SHALL compute a content hash (SHA-256 over the Resource's normalized title and native snippet) and persist it to `resources.content_hash`. A Resource whose content hash matches that of an already-admitted Resource — stored by an earlier Scan, or admitted earlier in this Scan — SHALL be dropped as a filtered duplicate and SHALL NOT be scored. The stored-Resource comparison SHALL exclude this Scan's own candidate ids, for the same reason as embedding dedupe: a candidate must not be dropped against a sibling that has not yet been admitted. This content-level dedupe is distinct from the canonical-URL dedupe ingestion already performs.

#### Scenario: Content-identical Resource at a different URL is dropped

- **WHEN** a Resource's content hash equals that of an already-admitted Resource with a different canonical URL
- **THEN** the duplicate is dropped as filtered, produces no Finding, and the original stands

#### Scenario: The content hash is persisted

- **WHEN** curation processes a Resource
- **THEN** its `content_hash` is written so later Scans can dedupe against it

#### Scenario: Sibling candidates sharing a hash leave one survivor

- **WHEN** two candidates in the same Scan share a content hash
- **THEN** the first-ranked one is admitted and the second is dropped, never both

### Requirement: Resources are embedded through the LiteLLM proxy

Curation SHALL embed a Resource's title and native snippet with the LiteLLM-routed embedding model, storing the vector in `resources.embedding` and, in `resources.embedding_model`, an identifier of the vector space — the underlying model and its dimension — rather than the routing alias. Because the proxy drops the dimension parameter and returns the model's full-width vector, every embedding SHALL pass through one helper that truncates to the schema's dimension (1024) and L2-normalizes the slice; the helper SHALL assert the raw vector is at least that long so a shorter model fails loudly rather than padding. A Resource that already carries an embedding SHALL be reused rather than re-embedded, since embeddings are global to the Resource.

#### Scenario: Embedding and its model are stored

- **WHEN** curation embeds a Resource that has no embedding
- **THEN** the row stores the 1024-dimension vector `embedding` and an `embedding_model` naming the model and dimension that produced it, not the routing alias

#### Scenario: An already-embedded Resource is reused

- **WHEN** curation reaches a Resource that already has an `embedding`
- **THEN** it is not re-embedded and the existing vector is reused

### Requirement: Embedding dedupe drops near-duplicates

Curation SHALL drop, as a filtered duplicate, a Resource whose embedding is within a cosine near-duplicate threshold of an already-admitted Resource's embedding — either a Resource stored by an earlier Scan, or a candidate already admitted earlier in this Scan. A Resource that is not within the threshold of any such embedding SHALL proceed.

The stored-Resource lookup SHALL be served by the HNSW index on `resources.embedding` and SHALL push the near-duplicate threshold into SQL as a distance predicate, so the database prunes at the gate instead of ranking the corpus and filtering in application code. Because the candidate's own row and its same-Scan siblings are its nearest neighbours, excluding them SHALL NOT be expressed as a SQL filter over an approximate index scan — that exclusion can consume the whole index walk and report no duplicate for a Resource that has one. The query SHALL instead request enough neighbours to cover this Scan's candidates and the caller SHALL drop its own ids from that bounded result. Within one Scan, this leaves exactly one member of a near-duplicate set standing rather than dropping every member.

The lookup is therefore **approximate**: an index walk MAY miss a true nearest neighbour, so an occasional duplicate MAY be admitted. This is accepted for a duplicate gate at this threshold — the content-hash stage and the in-memory sibling check run first, and the gate is a quality measure, not a correctness invariant.

#### Scenario: A near-duplicate is dropped

- **WHEN** a Resource's embedding is within the near-duplicate threshold of an already-admitted Resource's embedding
- **THEN** the Resource is dropped as filtered and produces no Finding

#### Scenario: A distinct Resource proceeds

- **WHEN** a Resource's embedding is outside the near-duplicate threshold of every already-admitted embedding
- **THEN** the Resource proceeds to the embed-filter

#### Scenario: Sibling candidates do not mutually annihilate

- **WHEN** two candidates in the same Scan are near-duplicates of each other and both have persisted embeddings
- **THEN** this Scan's candidates are dropped from the neighbour result, so the first-ranked one is admitted and only the second is dropped

#### Scenario: The threshold is applied by the database

- **WHEN** the stored-Resource lookup runs
- **THEN** the query carries the distance threshold as a predicate and orders by distance under a bounded limit, so no full corpus sort is performed and the query plan uses the embedding index

### Requirement: Embed-filter gates paid stages on topic-context relevance

Curation SHALL embed the topic's effective context (`topicScanContext` — the topic's own `context` merged with its attachments' `context`) and drop, as filtered, any Resource whose cosine similarity to that context embedding is below the relevance threshold for that Resource's kind. The threshold SHALL be held per kind rather than shared across all of them: a `watch` or `listen` Resource is described by a short blurb where a `read` Resource carries its whole body, so the same similarity means something different for each, and one shared bar drops media for the length of its description rather than for its relevance. Every kind's threshold SHALL be defined, so no kind falls back to an unstated default. This gate SHALL run before either paid stage (Firecrawl fetch, LLM scoring), so a Resource that fails it incurs no fetch or scoring spend — only the cheap embedding the gate itself required. When the topic's effective context is empty, the filter SHALL fall back to embedding the topic `name`, mirroring the search ingester.

#### Scenario: A below-threshold Resource is filtered before any paid stage

- **WHEN** a Resource's similarity to the topic-context embedding is below its kind's relevance threshold
- **THEN** it is dropped as filtered and no Firecrawl fetch or scoring call is made for it (its embedding already ran, for the gate)

#### Scenario: An above-threshold Resource proceeds to fetch and scoring

- **WHEN** a Resource's similarity to the topic-context embedding is at or above its kind's threshold
- **THEN** it proceeds to the fetch stage

#### Scenario: A video is judged against the bar for its own kind

- **WHEN** a `watch` Resource scores below the `read` threshold but at or above the `watch` threshold
- **THEN** it survives the gate and proceeds to fetch and scoring, rather than being dropped for carrying a description instead of an article

#### Scenario: Empty effective context falls back to the topic name

- **WHEN** the topic's effective context is empty
- **THEN** the embed-filter compares against the embedding of the topic `name` rather than an empty context

#### Scenario: The limit defers embedding rather than charging past it

- **WHEN** the Scan's spend limit is already reached and further candidates remain unembedded
- **THEN** those candidates are counted as deferred, no embedding call is made or charged for them, and they stay eligible for a later Scan

### Requirement: A per-Scan spend cap halts paid stages

Curation SHALL enforce, before each Resource is dispatched into the paid fetch-and-scoring section, two per-Scan limits: the existing USD spend limit, and a `MAX_SCORED_RESOURCES_PER_SCAN` count limit (env-overridable) on how many Resources are sent through the paid section in the Scan. The count limit SHALL bound every Resource that enters the paid section — whether its content was reused, revalidated, or freshly fetched — because scoring is paid in every case.

The USD limit is a **Scan-level** limit, not a review-level one: it is created before ingestion, ingestion spend charges against it, and its configuration name SHALL name the Scan rather than review. Curation therefore starts with whatever ingestion already spent already counted.

What a Scan has spent SHALL be carried between stages as a value rather than accumulated in one object shared across them. Ingestion returns what it spent, curation receives it and returns what it leaves behind, and the limit each stage reads is the running total it was handed. A Scan's stages may run in separate processes, so a shared object mutated in place would let curation start from zero and spend the limit twice.

Because the paid section runs under bounded concurrency and each limit is checked before dispatch rather than after completion, both limits are **approximate**, not hard: up to `(concurrency - 1)` Resources may already be in flight when a limit is reached, so the Scan may overshoot either limit by that many Resources. This overshoot is accepted. It costs a few cents, and the USD limit is an in-memory advisory counter that defers work rather than throwing. The fetch-outcome counts (`reused + revalidated + fetched`) SHALL therefore approximate, and MAY slightly exceed, the count limit.

Once either limit is reached, curation SHALL stop dispatching further paid work and leave the remaining Resources unscored — carried to a later Scan — without failing the Scan. The free stages that spend nothing — the hash dedupe, the embedding dedupe, and the relevance comparison itself — SHALL NOT be truncated by either cap; embedding, which is metered, SHALL defer past the USD limit as the embed-filter requirement states.

#### Scenario: The cap halts further paid work

- **WHEN** the Scan reaches either the USD limit or the `MAX_SCORED_RESOURCES_PER_SCAN` count mid-curation
- **THEN** no further fetch, revalidation, or scoring work is dispatched for the remaining Resources

#### Scenario: The count cap halts paid work independent of spend

- **WHEN** the Scan's `reused + revalidated + fetched` count reaches `MAX_SCORED_RESOURCES_PER_SCAN` while the USD limit is not yet reached
- **THEN** the remaining survivors are deferred unscored, even though spend is under the dollar limit

#### Scenario: Ingestion spend counts against the same limit

- **WHEN** a Scan's ingestion charges enough to reach the USD limit before curation starts
- **THEN** curation dispatches no paid work and defers its candidates, because the limit it reads already includes ingestion spend

#### Scenario: Spend survives the boundary between stages

- **GIVEN** a Scan whose ingestion charged against the limit
- **WHEN** curation runs in a different process from the one that ingested
- **THEN** curation reads the total ingestion already spent, rather than starting from zero

#### Scenario: In-flight work may overshoot a limit

- **WHEN** a limit is reached while other Resources are already in flight under the concurrency limit
- **THEN** those in-flight Resources finish and are counted, so the Scan may exceed the limit by up to `(concurrency - 1)` Resources, and this is not an error

#### Scenario: Unscored Resources are carried and the Scan still succeeds

- **WHEN** a cap leaves some discovered Resources unscored
- **THEN** those Resources get no Finding this Scan, the Scan is still `succeeded`, and they remain eligible for a later Scan

#### Scenario: Free stages run regardless of the cap

- **WHEN** a cap has been reached
- **THEN** the dedupe and relevance-comparison stages still run for the Resources that already carry embeddings, since they incur no metered spend

### Requirement: The Scan records per-stage cost and curation counts

On close, curation SHALL record each stage's dollar cost in `scans.stage_costs` (keyed at least by ingestion, embedding, fetch, cheap scoring, and premium scoring) and set `scans.cost` to the Scan Budget's total, which already includes ingestion because ingestion charges into the same Budget. `scans.cost` SHALL NOT be composed by summing a separately tracked ingestion number with a review total. It SHALL set `kept_count` to the number of Findings written and `filtered_count` to the number of Resources dropped by hash dedupe, embedding dedupe, the embed-filter, or the content scanner, and SHALL write the scan report to `scans.scan_summary`. It SHALL also record the fetch-outcome counts to `scans.reused`, `scans.revalidated`, and `scans.fetched` — the number of Resources whose content was reused within the TTL, revalidated via a `304`, or freshly fetched — whose sum equals the number of Resources sent through the paid fetch-and-scoring section.

The scan report SHALL be a dated note grounded only in the Scan's actual data — the kept Findings' titles, urls, scores, and relevance explanations; drop, deferral, and failure counts with their causes; per-Source outcomes including the fallback mode of a Source that fell back and the reason a Source failed; and costs. It SHALL cover, when the data supports each: a dated headline; insights and trends drawn across the kept items' relevance explanations; adds and drops with reasoning; sources consulted, skipped, and failed with reasoning; data-hygiene actions taken; list and threshold status against a target the topic context itself states; a closing notification decision (send or suppress) with rationale; and a cited-sources list of markdown links to the kept items using their exact stored urls. A Source that failed SHALL be reported as failed with its reason rather than being left to read as a Source that found nothing. Because the report renders through a sanitized markdown subset whose links are allowlisted to the kept Findings' urls, the prompt MAY ask for light formatting and for links to the kept items, but SHALL instruct that any other link, image, or HTML renders as inert text. A Scan with nothing to review MAY leave `scan_summary` empty, and a Scan whose report call failed SHALL leave it empty rather than failing.

#### Scenario: Per-stage costs are recorded and the total is the Budget's

- **WHEN** a Scan completes curation
- **THEN** `stage_costs` holds each stage's dollar cost including the ingestion bucket, and `cost` is the Scan Budget's own total rather than a separately summed figure

#### Scenario: Kept and filtered counts are recorded

- **WHEN** curation finishes
- **THEN** `kept_count` equals the number of Findings written and `filtered_count` equals the number of Resources dropped by dedupe, the embed-filter, or the scanner

#### Scenario: Fetch-outcome counts are recorded

- **WHEN** curation finishes
- **THEN** `scans.reused`, `scans.revalidated`, and `scans.fetched` hold the per-outcome tallies and their sum equals the number of Resources sent through the paid fetch-and-scoring section

#### Scenario: The scan report is written, grounded, and cites only kept items

- **WHEN** curation finishes reviewing at least one Resource and the report call succeeds
- **THEN** `scan_summary` holds a non-empty dated report that cites only items, sources, and numbers from the Scan's data, linking kept items by their exact stored urls and linking nowhere else

#### Scenario: A blocked Source is reported as blocked

- **WHEN** a Source failed with a reason, such as every Reddit access mode being refused
- **THEN** the report's data includes that Source's kind, its failed status, and its reason, so the note can say the Source was blocked rather than implying a quiet week

#### Scenario: A failed report leaves the summary empty without failing the Scan

- **WHEN** the scan-report call throws
- **THEN** `scan_summary` is empty, the failure is logged, and the Scan still records its costs, counts, and Findings as `succeeded`

#### Scenario: The report records a notification decision

- **WHEN** the scan report is written
- **THEN** its body ends with an explicit send-or-suppress notification recommendation and the rationale, and no notification is actually dispatched by curation

#### Scenario: The report judges the answer without a notification label

- **WHEN** the scan report is written
- **THEN** it closes with a plain sentence on whether the Scan answered what the Topic asked and why, carrying no "send" or "suppress" verdict label, and whether a digest is dispatched remains decided by the Topic's email subscribers

#### Scenario: A Scan that answered nothing says so

- **GIVEN** a Scan whose kept Findings do not address what the Topic asked
- **WHEN** its report is written
- **THEN** the closing line says plainly that the Scan did not answer the question, rather than omitting the judgment

#### Scenario: A Scan that deferred candidates says nothing about it

- **GIVEN** a Scan that held candidates back against its dollar cap or its scored-resource cap
- **WHEN** its report is written
- **THEN** neither the deferral count nor the limit that caused it appears in the report, and the report still says plainly that nothing was worth keeping when nothing was

#### Scenario: The deferral count is still tracked

- **WHEN** a candidate is deferred before embedding, or before scoring
- **THEN** the Scan's review outcome counts it, even though no reader is told

### Requirement: Tiered LLM scoring produces Findings with relevance explanations

Curation SHALL score each fetched survivor against the topic's effective context with a cheap-tier model routed through LiteLLM. A survivor whose first-pass score is at or above the promotion threshold SHALL be re-scored by a premium-tier model that also writes a substantive relevance explanation: several sentences of plain prose that first summarize what the content actually says (its specific claims, findings, numbers, names, or events) and then explain how it relates to the topic context — enough substance that the reader gets the gist without opening the source. A single-line note does not satisfy this. Curation SHALL upsert one Finding per `(topic, resource)` carrying the `relevance_score`, the `relevance_explanation`, and the `scan_id`. Only curation writes Findings; ingesters never do.

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

Before any fetch of either path, curation SHALL resolve an embed-filter survivor's content by reuse or revalidation when possible, so already-stored content is not fetched again:

- **Reuse (free):** when the Resource already has `content` and `now − fetched_at < CONTENT_TTL_MS` (an env-overridable constant), curation SHALL score the stored `content` without any fetch, spend no fetch credit, and count the outcome as `reused`. This applies to a stored transcript exactly as it does to stored markdown.
- **Revalidate (free):** when the Resource has `content` that is stale (`fetched_at` at or beyond `CONTENT_TTL_MS`) and carries at least one stored validator (`etag` or `last_modified`), curation SHALL send a plain conditional GET to the Resource URL directly — not through Firecrawl — with `If-None-Match` and/or `If-Modified-Since` built from the stored validators, bounded by its own short `AbortSignal.timeout`. A `304 Not Modified` SHALL refresh `fetched_at`, reuse the stored `content`, spend no fetch credit, and count the outcome as `revalidated`. Any other status, a probe error or timeout, or absent validators SHALL fall through to the fetch. The probe SHALL NOT fail the Resource or the Scan.

The transcript path exposes no usable validators, so a stale video stores neither and always falls through to a fresh transcript fetch. That refetch is free, so nothing is lost by never revalidating a video.

#### Scenario: Fresh stored content is reused without any fetch

- **WHEN** a survivor already has `content` and its `fetched_at` is within `CONTENT_TTL_MS`
- **THEN** curation scores the stored content, makes no fetch call of either path, charges no fetch cost, and counts the outcome as `reused`

#### Scenario: A stored transcript is reused like stored markdown

- **WHEN** a video's transcript was stored by an earlier Scan and its `fetched_at` is within `CONTENT_TTL_MS`
- **THEN** curation scores the stored transcript, fetches no caption track, and counts the outcome as `reused`

#### Scenario: A stale Resource with a matching validator returns 304 and is reused

- **WHEN** a survivor's `content` is stale but it has a stored `etag` or `last_modified`, and a conditional GET to its URL returns `304`
- **THEN** curation refreshes `fetched_at`, reuses the stored content, makes no fetch call, charges no fetch cost, and counts the outcome as `revalidated`

#### Scenario: A non-304 conditional response falls through to Firecrawl

- **WHEN** the conditional GET returns any status other than `304`
- **THEN** curation abandons the probe result and performs the normal fetch for that Resource's path: Firecrawl for a page, a fresh caption track for a video

#### Scenario: A probe error or timeout falls through without failing the Resource

- **WHEN** the conditional GET throws or exceeds its `AbortSignal.timeout`
- **THEN** curation falls through to the fetch, and the probe failure neither fails the Resource nor the Scan

#### Scenario: Stale content with no stored validators skips straight to Firecrawl

- **WHEN** a survivor's `content` is stale and it has neither `etag` nor `last_modified`
- **THEN** curation makes no conditional GET and fetches directly — the Firecrawl scrape for a page, a fresh caption track for a video

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

### Requirement: The paid section is ordered by relevance, not discovery order

Curation SHALL rank the embed-filter survivors by their cosine similarity to the topic-context embedding, descending, and SHALL send them into the paid fetch-and-scoring section in that order. The similarity is the value the embed-filter already computes for every candidate before any cap applies; curation SHALL retain it rather than discard it after the threshold compare. When a per-Scan limit defers the remainder, the Resources that were scored SHALL therefore be the most relevant survivors of the Scan rather than whichever the database returned first.

Ranking SHALL NOT change which Resources pass the relevance threshold, only the order in which the survivors are bought.

#### Scenario: The most relevant survivors are scored when a limit defers the rest

- **WHEN** a Scan produces more embed-filter survivors than a per-Scan limit allows into the paid section
- **THEN** the survivors sent through the paid section are the highest-similarity ones, and the lower-similarity remainder is deferred unscored

#### Scenario: A low-similarity Resource discovered first does not displace a better one

- **WHEN** a survivor at 0.36 similarity is returned by the database before a survivor at 0.98, and the limit admits only one
- **THEN** the 0.98 survivor is scored and the 0.36 survivor is deferred

#### Scenario: Ranking does not change the relevance gate

- **WHEN** curation ranks the survivors
- **THEN** exactly the Resources that met the relevance threshold are ranked, and no Resource below the threshold enters the ranking

### Requirement: The paid section runs under a bounded concurrency limit

Curation SHALL run the paid fetch-and-scoring work for ranked survivors concurrently, bounded by an env-overridable concurrency limit, rather than one Resource at a time. The limit SHALL be chosen deliberately and SHALL NOT be unbounded: Firecrawl enforces per-plan concurrency, and a `429` falls back to the snippet, which would silently produce worse Findings while appearing faster.

Per-Resource failure isolation SHALL be preserved under concurrency: one Resource's failure SHALL degrade only itself and SHALL NOT abort the other in-flight Resources or the Scan.

#### Scenario: Paid work runs concurrently up to the limit

- **WHEN** more ranked survivors remain than the concurrency limit
- **THEN** at most the limit's worth of fetch-and-score work is in flight at any moment, and the rest start as slots free

#### Scenario: The concurrency limit is env-overridable

- **WHEN** the environment sets the concurrency limit
- **THEN** curation uses that value instead of its default

#### Scenario: One Resource's failure does not abort the others

- **WHEN** a Resource's fetch or scoring throws while other Resources are in flight
- **THEN** that Resource is counted as failed, the in-flight Resources continue, and the Scan is not failed

### Requirement: Same-Scan dedupe leaves exactly one survivor, the highest-similarity one

Curation's two dedupe stages SHALL remain inside the ranked pass and SHALL distinguish "already stored" from "already admitted in this Scan". For each candidate, the content-hash check and the near-duplicate check SHALL compare against both:

- stored Resources, **excluding this Scan's own candidate ids**, and
- the content hashes and embeddings of candidates already admitted earlier in this Scan, held in memory.

For any set of duplicate or near-duplicate candidates within one Scan, exactly one SHALL survive, and because the pass is ranked, the survivor SHALL be the highest-similarity member. Curation SHALL NOT drop every member of a duplicate set.

Pass 1 SHALL still embed and persist an embedding for every candidate, including ones later deferred, because embeddings are global to the Resource and a deferred Resource must not need re-embedding on the next Scan. Persisting an embedding SHALL NOT by itself mark a candidate as admitted.

#### Scenario: Two near-identical candidates in one Scan leave one survivor

- **WHEN** two candidates in the same Scan are within the near-duplicate threshold of each other
- **THEN** exactly one is admitted and the other is dropped as filtered — never both dropped

#### Scenario: The surviving member is the higher-scoring one

- **WHEN** two near-duplicate candidates in the same Scan have different similarities to the topic context
- **THEN** the higher-similarity candidate is the one admitted

#### Scenario: A candidate is not treated as its own stored duplicate

- **WHEN** pass 1 has persisted embeddings for every candidate and the ranked pass then checks a candidate for near-duplicates
- **THEN** the stored-Resource comparison excludes this Scan's candidate ids, so a candidate is not dropped against its own persisted row or against a not-yet-admitted sibling

#### Scenario: A deferred candidate keeps its embedding

- **WHEN** a candidate is embedded in pass 1 and then deferred by a per-Scan limit
- **THEN** its embedding is persisted and a later Scan reuses it rather than re-embedding it

### Requirement: A scan-report failure does not fail the Scan

Curation SHALL isolate the scan-report call. The report runs after every Finding for the Scan has already been upserted, so a failure there SHALL be logged, SHALL leave `scans.scan_summary` empty, and SHALL let the Scan close as `succeeded` carrying the Findings it already wrote.

Curation SHALL NOT isolate the topic-context load the same way: without the topic embedding there is no relevance gate and nothing can be scored, so a failure there SHALL continue to fail the Scan.

#### Scenario: A thrown scan report still yields a succeeded Scan with its Findings

- **WHEN** the scan-report call throws after the Scan's Findings have been written
- **THEN** the failure is logged, `scan_summary` is empty, and the Scan closes as `succeeded` with its Findings intact

#### Scenario: A succeeded Scan with an empty summary still emails

- **WHEN** a Scan succeeds with Findings but an empty `scan_summary`
- **THEN** the scheduled email still sends, because only a `succeeded` Scan emails and this Scan succeeded

#### Scenario: A topic-context failure still fails the Scan

- **WHEN** loading or embedding the topic's effective context throws
- **THEN** the Scan is marked `failed`, because no Resource could have been gated or scored

### Requirement: A scan prunes the topic to its max results, sparing bookmarks
After a scan writes its Findings, curation SHALL keep only the topic's top `max_results` Findings by relevance score and delete the rest, except Findings bookmarked by any user, which are never pruned. A lowered `max_results` takes effect at the next scan; editing the value never deletes rows on its own.

#### Scenario: The prune keeps the top of the ranking
- **WHEN** a scan finishes on a topic with more unbookmarked Findings than its `max_results`
- **THEN** only the top `max_results` by relevance score remain, plus every bookmarked Finding

#### Scenario: Editing max results does not delete rows
- **WHEN** an owner lowers a topic's `max_results`
- **THEN** no Finding is deleted until the topic's next scan prunes to the new value

### Requirement: Fetched content is scanned before it is scored

Curation SHALL pass a Resource's fetched content through the scanner's source-content layer before any scoring call reads it. Content the scanner flags SHALL drop the Resource as filtered under its own scanner drop reason, counted with the other drop causes and named in the report, and SHALL NOT be scored or stored as the basis of a Finding. A scanner that is unset, unreachable, or timing out SHALL leave the content unflagged and the Scan unaffected.

#### Scenario: Flagged content produces no Finding

- **WHEN** the scanner flags a fetched page's content
- **THEN** no scoring call is made for that Resource, no Finding is written, and the drop is counted under the scanner reason

#### Scenario: Unflagged content scores normally

- **WHEN** the scanner returns no detection for a fetched page
- **THEN** scoring proceeds exactly as it does today

### Requirement: Survivors are fetched by the path their kind selects, with a snippet fallback

For each embed-filter survivor that reaches the fetch stage and is neither reused nor revalidated (see the reuse-and-revalidation requirement), curation SHALL fill the Resource's content by the path its kind and url select, write the fetched text to object storage, store its `content_key` and `content_bytes` on the Resource, refresh `resources.fetched_at`, persist any origin `etag`/`last_modified` the fetch exposes (leaving them null when it does not), and count the outcome as `fetched`. It SHALL score the in-memory text in the same pass so the fetch does not round-trip through object storage.

The paths that fill content, checked in this order:

- **Declared transcript (free).** A Resource whose Source declared a transcript address in `resources.transcript_url` — a podcast feed's `<podcast:transcript>` today — SHALL be filled from that address whatever its kind: a plain bounded GET straight to the origin, every redirect hop checked, read down to its words by the same cue reader the caption tracks use, charging zero. A transcript address exposes no validators of the page's own, so `etag` and `last_modified` stay null and a stale one refetches rather than revalidates.
- **Show notes (no fetch).** A `listen` Resource with no declared transcript SHALL NOT be fetched at all: an episode page is a player and its show notes, and the notes are already in the snippet, so curation scores the snippet and spends nothing.
- **Firecrawl (billed).** Every other Resource except a video on a supported caption host SHALL be fetched as page markdown via Firecrawl (raw HTTP, `FIRECRAWL_API_KEY`), charging the Firecrawl per-fetch rate. This includes a `watch` Resource on any host with no readable captions — Loom, TED, TikTok — because only the hosts below publish a caption track the transcript path can read.
- **Caption track (free).** A `watch` Resource whose url parses to a video id on a host that publishes captions keylessly SHALL instead be filled from that video's published caption track: ask the host for the video's track list, prefer the first track whose language code begins with `en` and otherwise the first published one, fetch it, and join it into plain text. These paths go straight to the host, spend no vendor credit, and SHALL charge zero. The supported hosts are:

  - **YouTube** — the player endpoint lists the tracks, which are served as `json3`. The list SHALL be requested as a mobile client, because the caption urls the web client hands out are gated and serve an empty body.
  - **Vimeo** — the player config lists the tracks, which are served as WEBVTT. A video whose owner restricted embedding answers `403`, which is a failed fetch like any other.
  - **Dailymotion** — the player metadata lists the tracks, which are served as SRT.

  A host SHALL be added only on evidence that its captions can actually be read without a key, not on the presence of a caption feature. A url on a `watch` host with no supported caption path SHALL take the Firecrawl path unchanged.

  Because a caption url comes back inside a remote payload rather than being composed by curation, it SHALL be fetched only when it is an `https` url within the host's own caption domain. A domain check is the property that matters, since these hosts serve captions from their own separate caption hosts and cdn shards rather than from one fixed endpoint.

  A caption response SHALL be judged empty by its joined text rather than by its status, because a gated caption url answers `200` with a zero-byte body rather than an error.

  Caption lines SHALL join on a space and the segments within a line SHALL join directly. A line ends without trailing whitespace, so joining every segment directly runs each line's last word into the next line's first.

Kind alone SHALL NOT select a caption path: a `watch` Resource on an unsupported host has no caption track to read, and sending it down that path would fail a fetch that Firecrawl serves. A declared `transcript_url` outranks every kind-based rule, and `listen` is the one kind that selects on its own — to no fetch at all, never to a paid one.

Each fetch SHALL report the dollars it spent, and curation SHALL charge that amount to the `fetch` entry of the Scan's stage costs. A transcript therefore meters into the same entry as a scrape rather than earning one of its own, and leaves that entry unchanged because it costs nothing. Every path counts its outcome as `fetched` — the show-notes path too, since scoring is paid whichever way the content arrived — so a transcribed video or a snippet-scored episode counts against the Scan's scored-resource ceiling like any other scored Resource.

A video with no published caption track, an unreadable player payload, or a transcript that joins to nothing SHALL be treated as a failed fetch. On a fetch failure of any path, curation SHALL fall back to the Resource's native snippet — never the bare title — as the text to score, leaving `content_key` null. On an object-storage write failure it SHALL best-effort delete the object, leave `content_key` null, and fall back to the snippet, mirroring the attachment orphan-cleanup posture. Neither failure SHALL fail the Resource or the Scan.

#### Scenario: Content is fetched and stored

- **WHEN** a survivor is fetched successfully by either path
- **THEN** the fetched text is written to object storage, the Resource stores its `content_key` and `content_bytes`, `fetched_at` is refreshed, the outcome is counted as `fetched`, and scoring runs against the in-memory text without re-reading it from object storage

#### Scenario: A video on a supported host is scored on its transcript

- **WHEN** a `watch` survivor's url carries a video id on YouTube, Vimeo, or Dailymotion and the video publishes a caption track
- **THEN** curation fetches that caption track instead of calling Firecrawl, joins it into plain text, and scores the transcript rather than the video's description

#### Scenario: Each host's own payload shape yields the same track list

- **WHEN** curation reads a track list from YouTube's player endpoint, Vimeo's player config, or Dailymotion's player metadata
- **THEN** each maps to the same track shape of a language code and a url, so one preference rule and one fetch serve all three

#### Scenario: An English track is preferred over the other published ones

- **WHEN** a video publishes caption tracks in several languages, listed in the host's own order so English is not first
- **THEN** curation picks the first track whose language code begins with `en`, and falls back to the first published track when there is none

#### Scenario: Both caption file formats read down to their words

- **WHEN** a track arrives as WEBVTT with a header and numbered cues, or as SRT with comma-punctuated timestamps
- **THEN** the cue numbers, timing lines, notes, and inline markup are dropped and only the spoken words are kept

#### Scenario: Caption lines do not run their words together

- **WHEN** one caption line ends with a word and the next begins with another
- **THEN** the joined transcript keeps them as two words rather than fusing them into one

#### Scenario: A video with no captions scores its snippet

- **WHEN** a `watch` survivor is on a supported host but publishes no caption track, or its owner restricted access to the track list
- **THEN** its content is left unset, `content_key` stays null, and it is scored on its native snippet exactly as a failed scrape is

#### Scenario: Every way a host addresses a video takes the transcript path

- **WHEN** a `watch` survivor's url is a YouTube watch page, short link, short, embed, or live replay; a Vimeo plain, channel, group, or player link; or a Dailymotion video url or `dai.ly` short link
- **THEN** curation reads the video id out of it and fetches its caption track, rather than treating only the canonical form as a video

#### Scenario: A video on an unsupported host keeps the Firecrawl path

- **WHEN** a `watch` survivor's url is on Loom, TED, TikTok, Rumble, or any other host with no supported caption path
- **THEN** curation fetches it via Firecrawl and charges the Firecrawl per-fetch rate, unchanged from today

#### Scenario: A transcript meters into the fetch entry without growing it

- **WHEN** a Scan fills a video's content from its caption track
- **THEN** the fetch charges zero into `stage_costs.fetch` — no other entry — and the outcome still counts as `fetched` against the scored-resource ceiling

#### Scenario: A caption url outside the host's own domain is not fetched

- **WHEN** a track list names a url that is not `https` or that points outside the host's caption domain
- **THEN** curation does not fetch it, the transcript fetch fails, and the Resource is scored on its snippet

#### Scenario: Fetch validators are persisted when exposed

- **WHEN** the fetch response exposes an origin `etag` or `last_modified`
- **THEN** curation stores them on the Resource so a later Scan can send a conditional GET, and leaves them null when the response exposes neither

#### Scenario: Fetch failure falls back to the snippet

- **WHEN** the fetch for a survivor fails on either path
- **THEN** scoring runs against the Resource's native snippet, `content_key` stays null, and the Resource is not failed

#### Scenario: An object-storage write failure falls back to the snippet

- **WHEN** the object-storage write for a fetched survivor fails
- **THEN** curation best-effort deletes the object, leaves `content_key` null, scores the snippet, and does not fail the Resource or the Scan

