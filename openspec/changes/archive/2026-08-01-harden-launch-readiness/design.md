## Context

Six pre-launch gaps, all in code that already exists:

- **Prompts.** [worker/prompts/write.ts](worker/prompts/write.ts) interpolates every `{{variable}}` the same way, trusted or not. `topicContext` (owner text plus attachment-derived context), `resourceContent` (fetched page markdown), `document` (uploaded file text), and `keptResourcesBlock` (attacker-supplied titles, urls, and model notes) all arrive as plain text inside the prompt body with no fence at all. Nothing marks them as data.
- **Rendering.** The scan report renders through `markdown-to-jsx` with an anchor component in [TopicScanRecap.tsx:61](ui/src/components/topic/TopicScanRecap.tsx) and through React Email's `Markdown` in [topic-scan-email.tsx:134](emails/topic-scan-email.tsx). The [curation spec](openspec/specs/curation/spec.md) currently *requires* the report to end in "a cited-sources list of markdown links" — so today's spec asks for exactly the affordance injection would use for phishing. The relevance explanation already renders as a text node in [TopicResource.tsx:146](ui/src/components/topic/TopicResource.tsx); that is correct and needs pinning, not changing.
- **Attachment context.** [worker/attach.ts](worker/attach.ts) generates an attachment's `context` once and `buildTopicScanContext` merges it into every later Scan for the Topic. The owner never sees the merged text, so a poisoned document keeps steering Scans invisibly.
- **Telemetry.** [worker/telemetry.ts](worker/telemetry.ts) starts Langfuse via OTel and [worker/scan.ts:64](worker/scan.ts) opens one `topic-scan` trace per Scan, but only ai-sdk model calls emit spans — the free stages, the fetches, and the per-stage costs are invisible. There is no Sentry and no product analytics at all.
- **Near-duplicate query.** `hasNearDuplicate` in [worker/review/filter.ts:231](worker/review/filter.ts) orders every embedded Resource by `cosineDistance` and takes the nearest. `resources.embedding` carries no index, so that is a sequential scan plus a full sort, once per Resource per Scan, over a globally-scoped Resource table — cost grows with the whole multi-tenant corpus, not with one Topic.
- **Budget.** `newBudget()` is called inside `reviewScan` ([worker/review/index.ts:37](worker/review/index.ts)), after ingestion has already spent. `processTopicScan` adds ingestion cost to the Scan row separately (`cost + review.cost`), so Exa search spend never enters the Budget and `canSpend` never sees it. Stage 2 (`gateResources`) embeds and charges for every candidate with no ceiling check at all.

Naming: the proposal's "relevanceRationale" is this repo's `relevanceExplanation` (schema column `relevance_explanation`, domain-model term "relevance explanation"). This change keeps the existing name.

## Goals / Non-Goals

**Goals:**
- Untrusted text cannot be read as instructions, and the guarantee lives at the loader, not in each prompt author's memory.
- No model-written text can render as a link, an image, or HTML on any human surface.
- The scanner is defense in depth: it can be down, or absent, without stopping a Scan.
- Hosted deployments get error, product, and per-stage cost visibility; self-host gets none, by leaving keys unset.
- The near-duplicate gate is index-backed and honest about being approximate.
- `Scan.cost` equals what the Scan actually spent, ingestion included, and the ceiling that guards spend sees all of it.
- Precision, recall, cost per topic, and the scanner's false-positive rate are measured numbers published in the README.

**Non-Goals:**
- A second LLM judging the first's output. One detector per layer, no judge chains.
- Rewriting or repairing flagged content. Flagged content is dropped, not sanitized into the pipeline.
- Per-tenant vector partitioning. Resources stay global; the index makes the global lookup cheap enough.
- Exact-recall near-duplicate detection. This is a duplicate gate, not retrieval.
- A PostHog taxonomy beyond signup and activation, or client-side session recording.
- Metering authority moving out of LiteLLM. Budget numbers here stay best-effort estimates for the ceiling and the report.

## Decisions

### 1. Untrusted is the default argument, trusted is the explicit opt-out

`writePrompt(template, untrustedVariables, trustedVariables?)`. Every value in the first map is nonce-wrapped and stripped; the optional second map interpolates bare. The signature is the enforcement: the lazy call — the one an author writes without thinking — is the safe one, and every unsafe value is a greppable second-argument entry that a reviewer can see.

- **Why not a naming convention in the template** (`{{untrusted:topicContext}}`)? It puts the security decision in the file a prompt author edits fastest, and the registry copy in Langfuse can be edited in a UI that has no reviewer.
- **Why not sanitize inside each builder?** Four builders today, one per prompt, each free to forget. The loader is the single chokepoint every prompt already passes through.
- Trusted values today are exactly the ones we compute: `date`, `maxQueries`, `filteredBreakdown`, `sourcesBlock`, `costLine`. Everything else — `topicContext`, `resourceContent`, `document`, `keptFindingsBlock` — is untrusted.

### 2. A per-call nonce delimiter, and the delimiter stripped from the value

One nonce per `writePrompt` call, from `crypto.randomUUID()`. Each untrusted value renders as:

```
<untrusted-data-3f9a1c2b>
…value…
</untrusted-data-3f9a1c2b>
```

Before wrapping, the value has every `<untrusted-data…>` / `</untrusted-data…>` tag form removed (any nonce, not just this call's) and its backticks stripped. A static fence is forgeable — content that closes the fence early escapes into the instruction region. A nonce the attacker never sees is not guessable within one call, and stripping the tag shape means a lucky or replayed guess still cannot close the block.

- **Why strip backticks too?** The templates are markdown and the registry serves markdown; a triple-backtick run in a value can end a code fence a prompt author added around a block. Stripping is cheaper than reasoning about which fence a value sits in.
- **Why one nonce per call, not per value?** Per call is unguessable already, and one nonce keeps the rendered prompt readable in a trace.

### 3. The task is restated after the untrusted block, in the template

Each of the four templates ends with a restatement line *after* its last untrusted placeholder: the marked block is content to evaluate, never instructions, followed by the task and the required output. Untrusted placeholders never appear above the instructions. Mechanically checkable: the last non-empty line of a written prompt is never an interpolated value, which is what the unit test asserts.

### 4. Outputs stay schema-locked and no-hands

`Output.object({ schema })` with Zod already forces scoring output into `{ score, relevanceExplanation }`, and the score is clamped. No pipeline call gets tools, and no model output becomes a query, a url to fetch, or a control-flow decision. This decision is recorded as a requirement so a later "let the model pick the next source" change has to argue against it explicitly.

### 5. A hardened markdown subset, with links allowlisted to the kept Findings' own urls

The scan report and Carl's notes render through `markdown-to-jsx` (`disableParsingRawHTML: true`) and React Email's `Markdown` with the same overrides on both: bold, lists, and headings render as styled markup; an anchor renders as a real link only when its `href` exactly matches one of the Scan's kept Finding urls, and otherwise renders as its label plus destination in plain text; images render nothing; raw HTML renders as the characters the model typed. `relevanceExplanation` stays fully plain text everywhere, since it has no Sources list of its own urls to allowlist against.

- **Why allow any markdown at all, rather than plain text?** The Sources list of links to the kept items is real product value — the reader can act on it — and every one of those urls is already a stored field the app controls, the same urls the Findings feed itself links. Rendering them again from the report is not new reach.
- **Why an allowlist rather than stripping only `<script>`/`javascript:` or similar?** The threat is not malicious markup, it is a *correct*, ordinary link — `[click here](https://evil.test)` — pointing somewhere the app never chose. Sanitizer libraries defend against broken HTML, not against well-formed links to the wrong destination. Only an explicit allowlist of known-good urls closes that gap.
- **Why not full markdown with only `<script>`-style content blocked?** Autolinking bare urls is the trap: most markdown parsers turn a bare `https://evil.test` into a clickable link by default, silently reopening the exact vector the allowlist exists to close. The override has to cover autolinks too, which only a destination-checking allowlist does.
- **The prompt keeps its "Sources: markdown links to the kept items" instruction**, since those links now render. It still cannot ask for links anywhere else — a link to any other destination renders as inert text regardless of what the prompt asks for.

### 6. Attachment context is owner-visible and editable

The topic edit modal shows each ready attachment's generated context in an editable field; saving writes `attachments.context`. The next Scan picks it up through `buildTopicScanContext` with no other change, because context is read per Scan and embedded per Scan. Editing is the mitigation the owner actually has: the poisoned instruction becomes visible text they can delete.

- **Why not regenerate on edit?** The edit *is* the correction; regenerating would discard it.
- **Why not re-embed on save?** Nothing caches the topic embedding across Scans — it is embedded per Scan already.

### 7. LLM Guard is a sidecar service with one detector set per layer, failing open

A `worker/guard.ts` seam exposes `screenText(text, layer)` over the LLM Guard container's HTTP scan endpoint, with a bounded timeout in the same shape as the prompt registry fetch. Layers and their detectors:

| Layer | Where | Detectors |
|---|---|---|
| context doc | attachment text, before context generation | injection, secrets, `InvisibleText` |
| source content | fetched page markdown, before scoring | injection, `InvisibleText` |
| telemetry egress | before Sentry send and before trace payloads carry content | PII, secrets, output leakage |

One pass per layer, no second judge. Outcomes:

- A flagged attachment fails with a reason written to `attachments.error` and shown to the owner, and never feeds a Scan (the existing failure path already guarantees that for `failed` status).
- Flagged fetched content drops the Resource as a new `FilterReason`, counted in `ReviewOutcome.filteredCounts` and named in the report — the same shape every other drop cause already has.
- **Fail open.** Scanner unreachable, timing out, or `LLM_GUARD_URL` unset means unflagged, logged. Structural sanitization is the primary defense and is unconditional; a sidecar outage must not stop every Scan on the platform. This is the same posture as Langfuse and is stated as a requirement so it cannot be mistaken for an oversight.
- The injection threshold comes from `LLM_GUARD_INJECTION_THRESHOLD`, whose default is set from the eval harness's measured false-positive rate on benign injection prose (decision 11) — not from LLM Guard's shipped default.

- **Why a separate service over an in-process library?** LLM Guard is Python; the runtime is Bun. A container on Northflank with an HTTP seam keeps the worker one language and lets the scanner scale and fail on its own.
- **Why not a model call as the scanner?** Cost per Resource, latency in the hot path, and it is the judge chain this change is explicitly avoiding.

### 8. Sentry and PostHog live in shared modules both `api` and `worker` import

`shared/monitoring.ts` holds Sentry and `shared/analytics.ts` holds PostHog, one concern each: 11 of the 13 importers need only one of the two, so a merged module would make most imports overstate what they depend on. `api` and `worker` import them; `ui` never does, so nothing pulls a server SDK into the Vite bundle. Neither `api` nor `worker` imports the other, so the module boundaries in AGENTS.md hold.

- Sentry: `@sentry/bun`, initialized only when `SENTRY_DSN` is set, `environment: DOPPLER_ENVIRONMENT` (the variable Doppler already injects — no new name), `sendDefaultPii: false`, a sampled `tracesSampleRate` (env-overridable, default low), and a `beforeSend` that runs the telemetry-egress scan from decision 7 over any attached content and drops the content field rather than the event. Nothing in the pipeline attaches page or document text to an event in the first place; the scrub is the backstop.
- PostHog: `posthog-node`, initialized lazily on first event and only when `POSTHOG_API_KEY` is set, flushed on process exit alongside the Sentry and Langfuse flushes. Eleven events, `distinctId` = user id: `signup_completed` (`api/auth.ts`), `topic_created` (`api/topic/topics.ts`), `first_scan_completed` (guarded by a count-is-one check so "first" is true, not approximately true), plus `scan_requested` and `scan_quota_reached` (`api/topic/scans.ts`) and the engagement set in `api/topic/findings.ts` — `finding_rated`, `finding_bookmarked`, `finding_unbookmarked`, `finding_read`, `finding_unread`, `finding_opened` — which fire on every occurrence. The route reads `plan` off the session and `platform` off the request through `toAnalyticsProperties`, so no event costs a query.
- Both are no-ops with keys unset, which is the self-host default and is asserted by test.

### 9. Stage spans hang off the existing per-Scan trace

`startActiveObservation` already wraps `processTopicScan`. Each stage — ingest, dedupe, embed-filter, LLM scoring, summary, scan-report — gets its own nested observation, with the stage's cost recorded as the delta of its `stageCosts` bucket across the span and token counts attached where the stage makes model calls. Model-call spans keep nesting inside their stage's span, so an existing generation span gains a parent rather than moving.

- **Why a cost delta rather than a running total?** The bucket is cumulative across a Scan; a delta is what makes one span's number readable on its own.
- Non-model stages (dedupe, ingest) emit plain spans with counts and cost only — there are no tokens to report, and an empty usage field is better than a fabricated one.

### 10. The near-duplicate query: HNSW index, threshold in SQL, exclusion in code

`db/schema.ts` gains `index("resources_embedding_hnsw").using("hnsw", table.embedding.op("vector_cosine_ops"))`. pgvector's HNSW ceiling is 2000 dimensions and `EMBED_DIMENSIONS` is 1024, so the column indexes as-is.

The query changes shape three ways:

1. The `0.05` threshold moves into SQL as a distance predicate, so the walk stops at the gate instead of ranking the corpus and filtering in application code.
2. `ORDER BY distance LIMIT k` stays — that ordered form is what drives the index.
3. **The Scan's own candidate ids stop being a SQL `NOT IN` filter and are dropped in code instead.** This is the subtle part: the candidate's own row is in the table with distance 0, and its siblings from the same Scan are its nearest neighbours. As a post-filter on an approximate index scan, that exclusion can consume the entire `ef_search` walk and report "no near duplicate" for a Resource that has one. So the query asks for `candidateIds.length + 1` neighbours under the distance predicate and the caller drops its own ids — an existence check over a bounded, index-returned handful, not a corpus sort.

The lookup is now **approximate**: HNSW can miss a true nearest neighbour. At a 0.05 distance gate the miss shows up as an occasional duplicate admitted, which the content-hash stage and the in-memory sibling check already catch a share of. That is the accepted trade and it is written into the `curation` spec rather than left to be discovered.

**Measured on the dev corpus (2712 Resources, 2618 embedded):**

| Plan | Execution |
|---|---|
| Seq Scan, cold cache (today's behavior) | 1088 ms |
| Seq Scan, warm cache | 11.0 ms |
| `Index Scan using resources_embedding_hnsw` | 0.84 ms |

Two things the measurement settled. First, the query shape written here **is** index-eligible: the plan is an `Index Scan` with `Order By` on the distance and the threshold applied as a filter on top. Second, at 2712 rows the planner still *prefers* the seq scan, because the whole table costs 414 to scan and the index has a 374 startup cost — so the win arrives as the corpus grows, which is exactly the growth this change is about. The index is not doing nothing in the meantime: it is what keeps the lookup from following the corpus.

The filtered plan also reported `Rows Removed by Filter: 39` — the walk yielded ~40 neighbours (pgvector's default `ef_search`) and all but one were outside the threshold. That is the direct evidence for point 3: had this Scan's own candidate ids stayed a SQL `NOT IN`, a Scan with more than ~40 candidates could have had its entire walk consumed by its own rows.

- **Why HNSW over IVFFlat?** IVFFlat needs a representative training set at build time and degrades as the corpus grows past it; HNSW builds incrementally, which matches a table that grows continuously.
- **Ordering:** the index is created in a migration run after embeddings are backfilled. HNSW does accept later inserts, so an early build is not wrong — but an index over a mostly-null column buys nothing and hides whether the query plan actually improved.

### 11. Budget is created per Scan, ingestion charges into it, and the embed stage checks the ceiling

`newBudget()` moves to `processTopicScan`. `StageCosts` gains `ingestion`, each ingester's returned cost charges into it (keyless ingesters charge zero), and `reviewScan` takes the Budget as a parameter instead of making one. `Scan.cost` becomes `budget.spent` — one number with one origin — replacing `cost + review.cost`, and `toCostLine` in the report gains the ingestion bucket.

`gateResources` checks `canSpend` before embedding each candidate and returns `deferred` past the ceiling, not `filtered`: a deferred Resource keeps its embedding-free row and is retried by the next Scan, which is what the existing `deferred` outcome already means for the paid stages.

`REVIEW_SCAN_BUDGET_USD` is renamed `SCAN_BUDGET_USD` now that it bounds the whole Scan rather than review only — the constant's name has to stay true to what it gates. This needs the Doppler variable renamed in the same step.

Because ingestion now charges against the same ceiling, the ceiling covers more spend than it did, and the per-plan `monthlyBudgetCents` values in `shared/plans.ts` are re-checked against the eval harness's measured cost per topic (decision 12) instead of being assumed still correct.

- **Why not a separate ingestion cap?** Two ceilings mean two failure modes and two numbers to tune. One Scan, one ceiling.

### 12. The eval harness is a bun script over a checked-in labeled corpus

`scripts/eval-pipeline.ts`, run by `bun run eval`, reads `evals/<topic>.json` fixtures: a topic context, ~50 labeled items (title, snippet, content, `isRelevant`), and a set of benign articles that *discuss* prompt injection in prose. For each topic it runs the real gate and scoring path against the fixture items, then reports precision, recall, and cost per topic from the Budget; for the benign set it runs `screenText` and reports the injection scanner's false-positive rate. Output is a markdown table, and the numbers land in a README section.

- **Why fixtures over live ingesters?** Labels have to be stable to compare runs, and a live Exa query returns different items every time. Ingestion is not what precision and recall measure.
- **Why the benign-prose set is not optional:** Topics here are full of AI content, so articles explaining prompt injection are exactly what a real Topic surfaces. A scanner tuned on its shipped default would drop them, and the eval is what turns that from a guess into a measured threshold.

## Risks / Trade-offs

- **A nonce fence is not a proof.** A model can still follow instructions inside a marked block → the fence is layer one of several: schema-locked no-hands outputs mean a followed instruction cannot act, allowlisted rendering means a link can only point where the product already points, and the scanner is layer four. No single layer is claimed to be sufficient.
- **Approximate near-duplicate recall** → an occasional duplicate is admitted. Mitigated by the content-hash stage and the in-memory sibling check running first, and by the gate being a quality nicety, not a correctness invariant. Verified against the pre-index behavior on the eval corpus.
- **Fail-open scanner** → a scanner outage silently removes layer four. Mitigated by structural sanitization being unconditional, by logging every degradation to Sentry, and by the outage being visible in the trace rather than silent.
- **A benign article dropped as injection** → the FP rate is measured before the threshold is set, and a flagged Resource is counted under its own drop reason in the report, so a mis-tuned threshold shows up as a number rather than as silently thin Findings.
- **The allowlist is an exact string match on url** → a Finding's url the model paraphrases or mangles even slightly renders dead rather than linked. Accepted: a dead link is a UX papercut, and fuzzy-matching a url is exactly the kind of leniency that would let a lookalike destination back in.
- **Ingestion in the budget makes ceilings bite sooner** → plan backstops and the Scan ceiling are re-checked against measured cost before launch, not after.
- **Sentry or PostHog carrying content** → nothing attaches content to an event, `sendDefaultPii` is off, and the egress scan is the backstop. Self-host sends nothing at all.
- **The env var rename** (`REVIEW_SCAN_BUDGET_USD` → `SCAN_BUDGET_USD`) is a config break: an unrenamed Doppler variable silently reverts the ceiling to its default. Rename in the same step and assert the new name in the smoke path.

## Migration Plan

1. Ship the code paths that need no new infrastructure: loader sanitization, template restatements, plain-text rendering, attachment-context editing, Scan-level Budget with the ingestion bucket and the embed-stage gate, stage spans, and the eval harness. With `LLM_GUARD_URL`, `SENTRY_DSN`, and `POSTHOG_API_KEY` unset, the only behavior changes are the intended ones.
2. **Run `bun run prompts:sync`.** Prompts are served registry-first, so the edited markdown in git is only the fallback: until the sync pushes the new bodies up, Langfuse keeps serving the previous versions, which have no restatement line and still ask for markdown links. The nonce fence is unaffected either way — it is applied by `writePrompt` at interpolation, not by the template — but the restatement and the plain-text instruction ship in the body.
3. Rename the Doppler ceiling variable to `SCAN_BUDGET_USD` in every environment as the code lands, if the stored value ever differs from the code default.
4. Confirm `resources.embedding` is populated, then run the index migration and check the query plan actually uses the index. *(Done on dev: 2618/2712 embedded, migration `0027` applied, plan verified.)*
5. Deploy the LLM Guard service on Northflank, set its URL, and start with the threshold from the eval run.
6. Set `SENTRY_DSN` and `POSTHOG_API_KEY` in the hosted environments only, and point the external uptime monitor at `/api/health`.
7. Run `bun run eval`, publish the numbers in the README, tune the scanner threshold on the measured FP rate, and re-check the per-plan monthly backstops against measured cost per topic.

**Rollback:** unset `LLM_GUARD_URL`, `SENTRY_DSN`, or `POSTHOG_API_KEY` to disable any of the three new external dependencies with no deploy. The index can be dropped without a code change. The loader, rendering, and Budget changes roll back by revert.

## Open Questions

- The exact LLM Guard image tag and scan-route shape get pinned during implementation; the `worker/guard.ts` seam is what the pipeline codes against either way.
- Where the output-leakage detector runs: this design places it on telemetry egress (the only path where our own content leaves the system), not on model output. If it should also gate the relevance explanation before it is stored, that is a second pass over model output and needs to be an explicit call.
- Whether the per-plan `monthlyBudgetCents` values actually change is answered by the eval numbers, not decided here.
- Which uptime provider pings `/api/health` is an ops choice with no code impact.
