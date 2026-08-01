## Why

Everything CarlNotes shows a reader is written by a model that just read attacker-controlled text, and nothing today stops that text from reading as instructions, from becoming a link in an email, or from being measured at all: there is no injection defense, no error or product telemetry, no per-stage trace, no numbers for precision or recall, no index behind the near-duplicate query, and no accounting for what ingestion spends. These six are the Show HN gate — the last things that have to be true before the app meets the public — so they ship as one pass.

## What Changes

**Injection defense** (decision log: Injection defense)
- Structural sanitization is the primary defense: user and source text is data, never instructions, enforced at the prompt loader so no prompt author can forget it. `writePrompt` takes untrusted values as its first, default map and trusted ones only through an explicit second map, so the lazy path is the safe path.
- Every interpolated untrusted value is wrapped in an **unguessable per-call nonce delimiter**, and the delimiter pattern (backticks and the tag form) is stripped from the value before it renders — a static fence is forgeable by content that closes it early, a nonce is not.
- Each template **restates the task after** its untrusted block, so the last thing the model reads is ours, and untrusted text is never interpolated into the instruction region.
- Outputs stay schema-locked Zod, tier-1 no-hands: no model output becomes an action, a tool call, or a query.
- Every place attacker-derived text reaches a human renders **with formatting but allowlisted reach**: the scan report goes through a hardened markdown subset (bold, lists, and headings render; a link is clickable only when its destination matches a kept Finding's own stored url, and every other link, image, raw HTML, or autolinked url is neutralized into inert text) and the relevance explanation renders as plain text — on the topic page, the activity page, and in email. Injection can therefore not become phishing: a model cannot point a reader anywhere the product does not already point them. The scan-report prompt keeps its cited-sources list of markdown links, scoped to the kept items' own urls.
- Attachment-derived context is generated once and merged into every later Scan for its Topic, so it is **surfaced to the owner as visible and editable** rather than trusted blind.
- An **LLM Guard container** runs as the scanner sidecar on Northflank: injection, PII, secrets, invisible-and-bidi characters (`InvisibleText`), and output-leakage detection over context docs and fetched source content before they enter the pipeline. One detector per layer, no second judge. It is defense in depth behind the structural fence, so an unreachable scanner degrades the Scan rather than failing it, and an unset URL disables it.

**Monitoring and analytics, hosted only** (decision log: Telemetry scope)
- Sentry instruments `api` and `worker`, tagging the environment from the existing `DOPPLER_ENVIRONMENT` (`dev`/`prd`) rather than a new variable, with sampled tracing and PII scrubbing of context-doc and source content before send, matching the LLM Guard posture.
- PostHog carries an MVP event taxonomy limited to the signup funnel, activation, and engagement: `signup_completed`, `topic_created`, `first_scan_completed`, `scan_requested`, `scan_quota_reached`, `finding_rated`, `finding_bookmarked`, `finding_unbookmarked`, `finding_read`, `finding_unread`, `finding_opened`. Each event carries the user's `plan` (and the topic-anchored ones the `topicId`), because event history cannot be backfilled. Every one a browser request triggers also carries a `platform` of `mobile` or `desktop`, read from the request's user agent, so the funnel is answerable by device. The event list expands post-launch as real questions emerge, not preemptively.
- An external uptime monitor pings the public health endpoint.
- Self-host ships with **zero telemetry**: `SENTRY_DSN` and `POSTHOG_API_KEY` are simply unset and every path is a no-op.

**Langfuse tracing over OTel** (decision log: Observability)
- Every pipeline stage — ingest, dedupe, embed-filter, LLM scoring, summary, scan-report — becomes a span on the one trace per Scan that already exists, carrying that stage's cost and token counts. Traces keep routing through the LiteLLM proxy where the calls already flow, and self-host ships with the keys unset.

**Eval harness**
- A bun script measures pipeline precision and recall over ~50 labeled items per topic plus cost per topic, and the numbers land in the README.
- Because Topics here are full of AI content, the corpus includes articles that discuss prompt injection **in benign prose**, and the harness measures the injection scanner's false-positive rate on them. The scanner threshold is tuned on that measured number, not a guessed default.

**Vector index for near-duplicate detection**
- `resources.embedding` gains an **HNSW index** using `vector_cosine_ops` (pgvector supports 1024 dimensions; its ceiling is 2000). Today `hasNearDuplicate` orders the entire embedded corpus by cosine distance and takes the nearest, once per Resource per Scan, over globally-scoped Resources — so a sequential scan plus a full sort that grows with the whole multi-tenant corpus, not with one Topic.
- The near-duplicate threshold moves **into SQL as a distance predicate** so the index can prune, instead of ranking everything and filtering in application code.
- The index makes the nearest-neighbour lookup **approximate**. That is acceptable for a duplicate gate at a 0.05 distance threshold, and it is stated here rather than discovered later.
- The index is built after the embedding backfill has run — an index over a mostly-null column is worthless.

**Ingestion spend tracking**
- The Budget is lifted from `reviewScan` to Scan level, so ingestion charges into the same object review does. `StageCosts` gains an `ingestion` bucket that each ingester's returned cost charges into, with the keyless ingesters at zero. Exa is the only shipped paid ingestion source and is untracked today, and the domain spec already says `Scan.cost` equals stage costs plus ingestion cost — this makes the recorded number true rather than aspirational.
- The embed stage is gated by `canSpend`: stage 2 embeds and charges for every Resource with no check today, so a Scan that discovers a large payload can pass the ceiling before the gate is ever consulted. An over-ceiling candidate is **deferred**, keeping its retry on the next Scan.
- Once ingestion enters the budget the same ceiling covers more spend, so the per-plan `monthlyBudgetCents` values are re-checked against the eval harness's measured cost per topic rather than assumed to still hold. The Scan-level ceiling constant is renamed off `REVIEW_` now that it is no longer review-only.

**Docs and skills**
- The `prompt-authoring` and `domain-model` skills stay in sync with the loader's untrusted-value contract and the ingestion cost bucket.

## Capabilities

### New Capabilities
- `injection-defense`: nonce-delimited untrusted interpolation at the prompt loader, task restatement after untrusted blocks, schema-locked no-hands outputs, escaped plain-text rendering of every model-written surface, owner-visible and editable attachment context, and the LLM Guard scanner gate over context docs and fetched content.
- `monitoring-analytics`: Sentry error and sampled-trace instrumentation for `api` and `worker` with PII scrubbing and a `DOPPLER_ENVIRONMENT` tag, the PostHog signup-and-activation event taxonomy, the external uptime ping, and the zero-telemetry self-host default.
- `eval-harness`: the labeled-corpus script measuring pipeline precision, recall, and cost per topic plus the injection scanner's false-positive rate on benign injection prose, with its numbers published in the README.

### Modified Capabilities
- `prompt-authoring`: untrusted values are the loader's default and are nonce-wrapped and stripped; trusted values require an explicit opt-out map; templates restate the task after every untrusted block and never place untrusted text in the instruction region.
- `curation`: ingestion cost enters the Scan budget the paid stages read; the embed stage checks `canSpend` and defers past the ceiling; the near-duplicate query becomes an index-backed approximate lookup with the threshold pushed into SQL; the scanner gate drops flagged fetched content; the scan report's links are restricted to the kept items' own urls.
- `source-ingestion`: each ingester's returned cost charges into the Scan Budget's `ingestion` bucket, and the Scan's recorded cost is the budget's total rather than a separately summed number.
- `observability`: the per-Scan trace gains a span per pipeline stage carrying that stage's cost and token counts, not only spans for model calls.
- `domain-schema`: `resources.embedding` gains its HNSW `vector_cosine_ops` index, with the migration included; the Scan's `stage_costs` breakdown gains its `ingestion` bucket, which the column's `jsonb` shape already admits without a migration.
- `topic-attachments`: the generated context is owner-visible and editable, and an attachment whose content the scanner flags fails with a reason the owner sees rather than feeding a Scan.
- `topic-editing`: the topic edit modal exposes each attachment's context for editing.
- `topic-detail-page`: the scan report and Carl's notes render through a hardened markdown subset — formatting renders, and a link works only when it cites a kept Finding's own url.
- `topic-scan-email`: the scan-report body renders as plain text, not markdown.
- `deploy-mechanics`: the LLM Guard scanner runs as its own Northflank service reachable by `api` and `worker`, and the external uptime monitor pings `/api/health`.

## Impact

- **Schema/db**: HNSW index on `resources.embedding` in one migration sequenced after the embedding backfill; `stage_costs` gains an `ingestion` key inside the existing `jsonb`. `db/schema.ts`, `db/schema.test.ts`.
- **Worker**: `worker/prompts/write.ts` (untrusted-first interpolation, nonce delimiters, delimiter stripping) and all four templates under `worker/prompts/`; `worker/scan.ts` (Scan-level Budget, stage spans); `worker/budget.ts` (`ingestion` bucket, renamed ceiling), `worker/review/index.ts`, `worker/review/filter.ts` (index-backed near-duplicate query, `canSpend` on embed), `worker/review/summarize.ts` (cost line, no link instruction); `worker/attach.ts` (scanner gate); new scanner client module; `worker/telemetry.ts` (Sentry init, stage spans).
- **API**: Sentry and PostHog init and event emission in `api/auth.ts`, `api/topic/topics.ts`, the rating route, and the scan path; attachment-context read/update route.
- **UI**: plain-text rendering for the scan report and Carl's notes (`ui/src/components/topic/TopicScanRecap.tsx`, `TopicInfo.tsx`, `TopicResource.tsx`); attachment-context editor in the topic edit modal.
- **Emails**: `emails/topic-scan-email.tsx` scan-summary card renders plain text.
- **Scripts/config**: `scripts/eval-pipeline.ts` and a labeled corpus; new `eval` package.json script with the README Development section updated in the same change; `docker-compose.yml` gains the LLM Guard service for local parity.
- **External**: LLM Guard (self-hosted container), Sentry, PostHog, and an uptime monitor — **new dependencies**; `SENTRY_DSN`, `POSTHOG_API_KEY`, and the scanner URL wired through Doppler, all optional and unset for self-host.
- **Plans**: `shared/plans.ts` monthly backstops re-checked against measured cost per topic; the Scan ceiling env var renamed, requiring a Doppler rename.
- **Docs/skills**: `prompt-authoring` and `domain-model` skills, README stack list, evals section, and Development section.
