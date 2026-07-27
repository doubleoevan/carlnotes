## Why

Topics carry a `daily`/`weekly` frequency, but nothing acts on it — Scans only run when an owner clicks "Run now". Subscribers get no email when new Findings land. And every embed-filter survivor is re-fetched through Firecrawl on every Scan, so the same Resource is billed again on a later Scan of the same Topic and again for a second Topic, even though its content is already stored. Turning that frequency into automatic Scans multiplies that wasted fetch spend, so the reuse path has to land with the scheduler, not after it.

## What Changes

- **Scheduled Scans** — a scheduled sweep triggers a Scan for each Topic scheduled by its `frequency` (daily/weekly), reusing the existing `runTopicScan` and the existing per-user daily scan quota. No new orchestration infrastructure: a plain database-driven sweep, not Temporal (the README names Temporal, but it is not installed; a daily/weekly frequency over an already-failure-isolated pipeline does not justify introducing it now — see design).
- **Topic-scan email** — after a scheduled Scan succeeds, email its new Findings (those first surfaced since the Topic's last succeeded Scan) to the Topic's subscribers whose delivery frequency matches the frequency, using the existing Resend raw-`fetch` pattern already in `api/auth.ts` (no `resend` package added).
- **Fetch reuse** — when a Resource already has `content` and its `fetched_at` is within `CONTENT_TTL_MS` (env-overridable), curation skips the fetch entirely and scores the stored content.
- **Conditional refetch** — store `etag` and `last_modified` as two nullable columns on `resources`, taken from the fetch response. When content is present but stale, send a plain conditional GET straight to the URL (not Firecrawl) with `If-None-Match`/`If-Modified-Since` from the stored validators. A `304` refreshes `fetched_at`, reuses stored content, and spends zero credits. Any other status, a network failure, or missing validators falls through to the normal Firecrawl fetch. The probe is bounded by its own short `AbortSignal.timeout` and never fails the Resource.
- **Paid-count cap** — add a `MAX_SCORED_RESOURCES_PER_SCAN` ceiling alongside the existing per-Scan USD ceiling, so a loose relevance threshold cannot flood the paid fetch/scoring stages.
- **Fetch-outcome counts** — record `reused`, `revalidated`, and `fetched` tallies on the Scan.
- **Offline tests** — cover the pure decisions: the TTL predicate, conditional-header construction from stored validators, the `304` branch, and the paid-count cap halting paid work.

## Capabilities

### New Capabilities
- `scheduled-scans`: frequency-driven automatic Scans — detecting Topics scheduled by their `frequency`, triggering `runTopicScan` under the existing daily quota, and skipping (never failing) a Topic that is over quota or already scanning.
- `topic-scan-email`: emailing a Topic's new Findings to its frequency-matched subscribers after a scheduled Scan, via the existing Resend `fetch` call in `api/auth.ts`.

### Modified Capabilities
- `curation`: fetch reuse (TTL skip), conditional-GET revalidation with a `304` reuse branch, a `MAX_SCORED_RESOURCES_PER_SCAN` cap alongside the USD ceiling, and per-Scan fetch-outcome counts.
- `domain-schema`: `resources` gains nullable `etag` and `last_modified` validator columns; `scans` gains `reused`/`revalidated`/`fetched` fetch-outcome counters; plus the additive migration.

## Impact

- **Code**: new `worker/schedule.ts` (the sweep and its scheduled-Topic selection) and `worker/notify.ts` (recipient resolution + send); modified `worker/review.ts` (fetch reuse, revalidation, paid-count cap, outcome counts), `worker/scrape.ts` (return validators; add the conditional-GET request), `db/schema.ts` + a new migration, `package.json` (a `dev:worker`/`schedule` script), and the README Development section.
- **Dependencies**: none added. Reuses Firecrawl, the Resend `fetch` call, and Bun's `fetch`/`AbortSignal.timeout`.
- **Config**: new env vars `CONTENT_TTL_MS` and `MAX_SCORED_RESOURCES_PER_SCAN` (both with defaults), plus a sweep-interval/runner knob; `RESEND_API_KEY`/`RESEND_FROM_EMAIL` already exist.
- **Data**: two nullable columns on `resources` and three integer counters on `scans`, all additive and back-fill-free.
- **Not changed**: no Temporal, no `resend` package, no new `topics`/`subscriptions` columns (whether a Topic is scheduled is computed from its frequency and last Scan, and the email reuses `subscriptions.frequency`).
