## Context

Today a Scan runs only when the owner clicks "Run now": `api/topic/topics.ts` calls `runTopicScan(topicId, true)` fire-and-forget. Topics carry a `frequency` (`daily`/`weekly`) that nothing reads. There is no scheduler, no email on new Findings, and no reuse of already-fetched content.

Relevant existing code this change builds on rather than reinventing:
- `worker/scan.ts` `runTopicScan(topicId, isManual)` — the whole ingest→review→close pipeline, already failure-isolated per Source and per Resource.
- `worker/review.ts` `fetchResourceContent` → `worker/scrape.ts` `fetchContent(url)` — the Firecrawl fetch every embed-filter survivor currently hits. `canSpend(budget)` already gates paid stages on a USD ceiling.
- `resources.fetched_at` already exists (defaults to row creation); `scans.stage_costs` already models per-stage tallies.
- `api/auth.ts` already sends email through a raw `fetch` to `https://api.resend.com/emails`, keyed by `RESEND_API_KEY`/`RESEND_FROM_EMAIL`, that logs-and-swallows on failure.
- `api/topic/quotas.ts` `scansToday`/`PLANS[plan].dailyScanLimit` already counts scheduled and manual Scans in one pool (per the `scan-history` spec).
- `domain-schema` already requires diff-since-last-scan to advance its baseline only on a *succeeded* Scan.

Constraint: modular monolith, one `package.json`, one deploy, Bun runtime. The README names Temporal, but it is not a dependency and no Temporal server exists.

## Goals / Non-Goals

**Goals:**
- Trigger a Scan for each Topic scheduled by its frequency, under the existing daily quota.
- Email a Topic's new Findings to its frequency-matched subscribers after a scheduled Scan.
- Stop re-paying Firecrawl for content already stored: skip within a TTL, else revalidate with a conditional GET before paying.
- Bound paid work by a resource count as well as by dollars.
- Record `reused`/`revalidated`/`fetched` outcome counts on the Scan.
- Keep the pure decisions (TTL, conditional headers, 304 branch, paid-count cap) offline-testable.

**Non-Goals:**
- Introducing Temporal, a job queue, or any `resend`/scheduler package.
- A per-subscription email opt-out column, or email on manual "Run now" Scans.
- Surfacing the fetch-outcome counts in the UI (they are recorded, not displayed).
- Distributed locking for the sweep, or backfilling `etag`/`last_modified` onto existing rows.

## Decisions

### 1. A database-driven sweep, not Temporal

`worker/schedule.ts` exposes `runScheduledTopicScans()`: one idempotent pass that selects scheduled Topics and, for each, awaits `runTopicScan(topicId)` then sends the topic-scan email. A thin `main` runs one sweep and exits, wired as a `schedule` package script (`doppler run -- bun worker/schedule.ts`) for a platform cron; a dev loop can call it on an interval.

- *Why not Temporal:* it is not installed, and a daily/weekly frequency over an already-failure-isolated pipeline does not need durable workflows, retries, or timers. Introducing a server + worker runtime + deploy topology is disproportionate. This stays a reversible decision — the sweep can later become a Temporal Schedule that calls the same `runTopicScan`.
- *Why not `setInterval` inside the api:* it couples scheduling to the api process lifecycle and double-fires under horizontal scaling. A standalone one-shot sweep is cron-friendly and single-purpose.

### 2. Whether a Topic is scheduled is computed, with no `nextScanAt` column

A Topic is **scheduled** when it has no Scan with status `running` or `succeeded` whose `started_at` is within its frequency window (`daily` → 24h, `weekly` → 7d). Selected in one query; no new column, no write to advance a cursor.

- *Why:* recency is already derivable from `scans`. A `topics.nextScanAt` cursor adds a column, a write per Scan, and a backfill for no gain. Excluding `running` Scans in-window is what keeps two overlapping sweeps from double-scanning the same Topic.
- **ponytail:** check-then-scan is not atomic across concurrent sweeps, mirroring the existing manual-scan note. The in-window `running` exclusion makes a double-scan a narrow race, and the owner's per-user LiteLLM key budget still caps real spend. A per-Topic advisory lock closes the remaining gap if a second runner is ever added.

### 3. The sweep respects the existing daily quota, skipping (never failing) over-quota Topics

Before scanning, the sweep checks the owner's remaining daily quota via the existing `scansToday`/`PLANS` path. Over quota → skip this Topic this sweep (it stays scheduled, retried next sweep). This is exactly the "scheduled and manual share one pool" rule the `scan-history` spec already states.

### 4. Diff-since-last-scan = Findings first created by the Scan

Curation only scores Resources with no Finding for the Topic yet, so every Finding carrying this Scan's `scan_id` is a *new* one — precisely the diff since the last succeeded Scan (the baseline the `domain-schema` spec mandates). The email reads those Findings; no separate diff bookkeeping.

### 5. Email recipients are the Topic's frequency-matched subscribers; send via a shared sendEmail helper

Recipients = distinct emails of the Topic's subscribers — direct `subscriptions.subscriber_user_id` users plus users expanded from `subscriber_audience_id` audiences — whose `subscriptions.frequency` matches the Topic frequency. The raw-`fetch` Resend call in `api/auth.ts` is lifted into a shared `sendEmail({ to, subject, content })` helper that both signup verification and the topic-scan email call; like today it logs-and-swallows a delivery failure and never throws.

- *Why subscribers, not the owner:* Subscriptions are the delivery model; an owner receives the email only if subscribed. An email with no recipients simply sends nothing.
- *Why a shared helper:* one Resend integration point, reused — not a second copy and not a new package.

### 6. Fetch reuse and conditional revalidation in `fetchResourceContent`

The fetch stage becomes a three-way decision before it ever pays Firecrawl:
1. **Reuse (free):** `content` present and `now − fetched_at < CONTENT_TTL_MS` → score the stored `content`, count `reused`.
2. **Revalidate (free):** content present but stale, and at least one stored validator (`etag`/`last_modified`) exists → a plain `fetch(url, { headers, signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) })` with `If-None-Match`/`If-Modified-Since`. A `304` refreshes `fetched_at`, reuses stored `content`, counts `revalidated`. Any other status, a thrown/timed-out probe, or missing validators falls through to step 3. The probe is wrapped so it never propagates out of curation.
3. **Fetch (paid):** the existing Firecrawl scrape, which now also returns any origin `etag`/`last_modified` it exposes; store `content` + validators + refresh `fetched_at`, count `fetched`, and charge the fetch cost.

`CONTENT_TTL_MS` (default 24h) and `PROBE_TIMEOUT_MS` (a few seconds) are env-overridable knobs — the TTL default is a starting point to tune, not load-bearing.

- *Validator source:* captured from the fetch response's origin metadata when exposed; when absent they stay null and revalidation is simply skipped (safe degradation to TTL-reuse-or-Firecrawl). We do not add a second network round-trip just to harvest validators.
- *Why a direct GET for the probe, not Firecrawl:* a `304` check needs only origin headers; routing it through Firecrawl would spend the credit we are trying to save.

### 7. `MAX_SCORED_RESOURCES_PER_SCAN` alongside the USD ceiling

The paid gate becomes `canPay(budget)` = under the USD ceiling **and** under the paid-count cap, checked before a survivor enters the paid fetch-and-scoring section. The cap counts *every* Resource that enters that section, because reuse and revalidation still incur paid scoring — so `paid count = reused + revalidated + fetched`, and the outcome counters sum to it. Reuse and revalidation only spare the fetch credit, not the scoring cost. When either ceiling trips, remaining survivors defer exactly as they do today (unscored, carried, Scan still succeeds).

- *Why a count cap too:* the USD estimate is best-effort and scoring (premium model) is the dominant paid cost; a loose relevance threshold can admit many survivors that flood scoring before the dollar estimate catches up. `MAX_SCORED_RESOURCES_PER_SCAN` (env-overridable) is a hard backstop on how many Resources get scored per Scan, regardless of whether their content was reused, revalidated, or freshly fetched.

### 8. Outcome counts recorded on the Scan

`reused`/`revalidated`/`fetched` accumulate in the review budget like stage costs and are written to three new integer columns on `scans` at close, next to the existing counts.

## Risks / Trade-offs

- **Firecrawl may not expose origin `etag`/`last_modified`** → revalidation never triggers and the system degrades to TTL-reuse-or-Firecrawl, still a strict spend improvement; the 304 path is a bonus when validators exist. No extra request is added to force validators.
- **A too-long TTL serves stale content** → `CONTENT_TTL_MS` is env-tunable and revalidation covers the post-TTL window; the default is deliberately modest.
- **Concurrent sweeps could double-scan** → in-window `running` exclusion + per-user key budget bound it; advisory-lock hardening is noted and deferred (Decision 2).
- **A cron that stops firing silently stops all Scans** → the sweep is observable (it logs a per-sweep summary of scanned/skipped/over-quota Topics); alerting on "no sweep ran" is an ops follow-up, not code here.
- **Email to a stale/invalid subscriber address** → the shared `sendEmail` logs-and-swallows per recipient, so one bad address never blocks the rest or the Scan.

## Migration Plan

One additive Drizzle migration: nullable `resources.etag` and `resources.last_modified`; non-null-defaulted `scans.reused`/`revalidated`/`fetched` integers (default `0`). All back-fill-free — existing rows read as null validators (revalidation skipped) and zero counts. Rollback is dropping the columns; no data transform. No env var is required to deploy (all have defaults).
