## Context

The Scan pipeline runs as three Temporal activities. `worker/workflows/run-topic-scan.ts` sets only `startToCloseTimeout`, so a dead worker gives the server no signal and it waits out the full thirty-minute per-attempt clock. `reviewForScan` at `maximumAttempts: 1` makes that timeout terminal. `shutdownGraceTime` only helps an activity that finishes within two minutes of the signal, and review may legitimately run thirty. A redeploy or a `bun --watch` reload during review therefore discards every Finding the attempt already paid for.

Separately, `api/topic/topics.ts` returns every `sources` row with no gating, so a url Source is visible to every viewer of a public Topic the moment the Topic saves. `screenText(content, "page")` in `worker/guard.ts` runs much later and only decides whether a fetched page becomes a Finding.

Constraints: the test suite has no database-backed tests, so behavior here is verified live. `worker/review.smoke.ts` and `worker/scan.smoke.ts` call `ingestForScan`, `reviewForScan`, and `finishScan` directly with no Temporal context. Real duration data for tuning the thirty-minute per-attempt timeouts does not exist yet.

## Goals / Non-Goals

**Goals:**

- A worker death during a Scan is detected in about two minutes and the Scan resumes, keeping what the first attempt already wrote and already spent.
- The reclaim window provably exceeds the longest a healthy Scan can run, under any retry policy.
- An owner-supplied url is invisible to non-owners and never fetched by a Scan until its page has been fetched and screened clean.
- A url that cannot be fetched, or that screens dirty, tells the owner why.

**Non-Goals:**

- Reusing the save-time fetch to seed the Resource's `contentKey` and `contentHash`, so a first Scan does not fetch the page twice.
- Heartbeats for the attachment workflow. It has the same bug class with fifteen minutes of blast radius and already retries three times.
- Tuning the thirty-minute per-attempt stage timeouts. That needs real duration data.
- Screening the feed url of an `rss` Source, or any non-`url` kind. The same exposure exists there; this change gates only `url` kinds and leaves the mechanism in place for a later kind to opt in.

## Decisions

### The heartbeat pump does not track progress

A `setInterval` calling `heartbeat()` on a fixed tick, cleared in a `finally`. It reports no progress, because progress is not what Temporal needs here: the interval dies with the process, and its absence is the signal. A hung-but-alive activity keeps heartbeating and stays bounded by the unchanged `startToCloseTimeout`, which is the correct division — the heartbeat detects a dead worker, the start-to-close detects a stuck one.

The pump reaches the activity context through `asyncLocalStorage` from `@temporalio/activity` and calls `heartbeat` through an optional chain, so it is a no-op when there is no context rather than a throw. That is what keeps the smoke scripts working, and `bun run smoke:review` is the free regression guard for that path.

It wraps ingest and review inside their existing `traceScanStage` callbacks, so nothing in `worker/review/` changes. `finishScan` and `failScan` are left alone: two minutes across three attempts already recovers faster than a heartbeat would.

*Alternative considered*: heartbeat from inside the per-Resource loop in `worker/review/`. Rejected — it spreads Temporal into a module that has no other reason to know about it, and buys nothing the fixed tick does not.

### Thirty-second interval, two-minute timeout

Held in `worker/workflows/stage-timeouts.ts` beside the stage timeouts, since they are read together.

The SDK throttles outbound heartbeats to the lesser of eighty percent of `heartbeatTimeout` and `maxHeartbeatThrottleInterval`, which defaults to sixty seconds. A sixty-second timeout would throttle at forty-eight seconds and leave twelve seconds of slack, so a garbage-collection pause could false-timeout a healthy Scan. Two minutes throttles at the sixty-second cap, leaves double the margin, and still detects well inside the topic page's five-minute staleness window.

### Review retries once

`maximumAttempts: 2` on the `reviewForScan` proxy. The idempotence machinery is already there and unused: `loadUnscoredResources` in `worker/review/filter.ts` excludes every Resource carrying a Finding for the Topic, scoped by topic rather than by scan, so a second attempt skips everything the first one scored. `upsertFinding` is keyed on topic and resource, a persisted `resources.embedding` makes re-gating free, and a completed fetch left `contentKey` behind for reuse. The double-paid set is small: url-kind Sources, one topic-context embed, and whatever was admitted but unscored when the process died.

Two rather than three, because review already isolates per-Resource failures internally. A stage-level throw is therefore either systemic, which a third attempt will not fix, or a worker death, which two attempts cover.

The comment above the proxy currently presents `maximumAttempts: 1` as the deliberate choice. It gets rewritten, or the next reader reverts this.

### The Budget rides the retry in heartbeat details

Heartbeat details are Temporal's own checkpoint primitive, and the pump already calls `heartbeat`, so the live Budget goes in as its details. The Budget mutates in place, so each tick sends current state, and the next attempt reads the last recorded value from `activityInfo().heartbeatDetails`.

The resumed budget takes `spent`, `stageCosts`, and `fetchCounts` from the details, and `cap` and `maxScoredResources` from a fresh `newBudget()`. Ceilings are read from the environment, so a resumed budget would carry stale ones. This is not cosmetic: a Scan that scored twenty-five Resources and crashed would re-arm the thirty-Resource cap from zero and buy thirty more.

One small pure function does this, validating the shape and falling back to the passed budget when details are missing or malformed. It is the one branch in this change worth a unit test, and the ceiling assertion is the test that catches the staleness mistake.

Ingest gets the same pump and the same resumed budget. It already retries three times, so a dead worker mid-ingest self-heals today — but only after burning a full thirty-minute timeout first.

*Alternative considered*: write spend to the `scans` row on every charge. Rejected — a write per charge for a value only the retry path reads, when Temporal already carries per-attempt state for exactly this.

### `keptCount` is counted in the database

`finishScan` counts Findings for this scan id instead of reading review's in-memory tally. Behavior-identical today, since every kept Finding is upserted with the current scan id, and it is the only version that stays correct after a retry, where the second attempt's tally covers only its own work. It also makes the history row agree with the scan email, which already counts by scan id in `worker/notify.ts`.

### `scheduleToCloseTimeout` bounds each activity, and the reclaim derives from that

`MAX_SCAN_DURATION_MS` sums one attempt each — thirty plus thirty plus two — but ingest already retries three times, so a Scan may legally run 126 minutes against a 77-minute reclaim window, and the reaper can close out a Scan that is still legitimately running. Adding a review attempt makes it worse.

`scheduleToCloseTimeout` bounds an activity including its retries, so each proxy declares one and `MAX_SCAN_DURATION_MS` sums those instead. The reclaim constant then stops depending on a retry policy that lives in a different file. The assertion in `worker/schedule.test.ts` that only checks the window exceeds `MAX_SCAN_DURATION_MS` is the test that would have caught this, and it is rewritten to hold under any retry policy.

### A url Source is saved immediately and screened asynchronously

Same shape as an attachment: the save stays fast, the screen runs in a Temporal workflow, and the row is inert until it passes.

The workflow fetches with `fetchContent` from `worker/scrape.ts`, which already rejects a malformed, non-http, or privately routable url, then screens the markdown with `screenText(content, "page")`, which reads PromptInjection, InvisibleText, BanTopics, and Toxicity. Clean becomes `ready`. Flagged, or unfetchable at all, becomes `failed` with the reason recorded.

An unfetchable url is a rejection rather than a warning. A Source whose page never loads produces nothing on every future Scan anyway, and this is the only place the owner learns that. It also closes a quieter bug for free: `urlIngester` emits its Resource with no snippet, and `worker/review/score.ts` falls back to `resource.snippet ?? ''` when the fetch fails, so an unfetchable url Source used to be embedded and scored against an empty string and yield nothing forever. Such a Source now never reaches `ready`, so it never reaches ingest, and `score.ts` needs no change.

### The screening activity gets no heartbeat pump

It is one `fetchContent` (a thirty-second Firecrawl timeout) plus one `screenText` (2.5 seconds). A two-minute `startToCloseTimeout` gives the same detection latency a heartbeat would, for free. The pump exists for activities that legitimately run far longer than the detection window they need; this one does not. It gets the same bounding discipline instead — retries plus a `scheduleToCloseTimeout` — which is the part of the durability work that actually applies.

It polls its own task queue. Sharing the attachment queue was the first plan, since a source screen is a seconds-long job like an attachment and `worker/temporal-client.ts` separates Scans only because a Scan holds an activity slot for up to half an hour. But a Temporal `Worker` binds exactly one `workflowsPath` to one queue, so sharing would mean a barrel module re-exporting both workflows and a merged activities object — and a queue named `attachment-processing` running source screens is the kind of thing the next reader has to decode. A third queue costs about eight lines and every name stays true.

### A Source's status is its own enum, backfilled to ready

A new `source_status` Postgres enum over the same three values as `attachmentStatuses` in `shared/enums.ts`. Reusing the `attachment_status` enum type on a `sources` column would read as a lie in the schema for zero saving, and renaming the shared type would touch three files to no benefit. The TypeScript value list stays single-sourced from `shared/enums.ts`.

The column defaults to `pending`, and the insert path writes `ready` for the kinds that are not screened. The gate is then plainly `status = 'ready'` rather than `kind = 'url' AND status != 'ready'`, so it cannot drift when another kind gains screening, and no row sits at a status that will never change.

The migration backfills every existing row to `ready`. Without it, every existing Source vanishes for non-owners and every Scan skips everything.

### Only a Topic's first Scan waits for its screens

A Topic saved with a url Source starts two things at once: the screen, and the Topic's first Scan. Ingest reads the Sources table almost immediately while the screen is still fetching, so without a wait the url is skipped on the one Scan the owner is actually watching, and its Findings arrive on the next scheduled Scan — up to a day later.

The first Scan therefore waits for the Topic's pending Sources to reach a verdict, bounded at thirty seconds. It waits by polling the Source rows rather than the screening workflows, because the row status is what ingest reads: that makes the wait correct no matter who started the screen, and it needs no workflow handles threaded through the save path.

Only the first Scan waits. A manual or scheduled Scan runs when it is asked to, and skips whatever is not ready, which is the behavior the spec already describes.

Two bounded imperfections, both of which degrade to the unwaited behavior rather than to something worse:

- The Scan row is opened inside the create transaction and its dispatch marker is only written after the workflow starts, so during the wait it is exactly what `startUndispatchedScans` looks for. A sweep landing inside that thirty-second window dispatches the Scan early. That is today's behavior for that one Topic, not a new failure, and the alternative — withholding the Scan row until the screens settle — would cost the "a Scan is already under way" state the Topic page shows on creation.
- A screen that outlasts the bound leaves its Source pending and the Scan starts without it. The bound is what stops a page that will not load from holding the first Scan for the screening workflow's full six-minute ceiling.

### A pending Source is inert in three places

It leaks if any one is missed:

1. **Read path** — `api/topic/topics.ts` and `api/topic/feeds.ts` exclude a Source that is not `ready` from what a non-owner receives. That gating is the entire protection while the screen runs.
2. **Scan path** — `ingestFromTopicSources` in `worker/ingest/index.ts` skips a Source that is not `ready`, so an unscreened url is never fetched into a Resource.
3. **Owner's view** — the topic page and the edit modal show a checking state and then a real reason, the way a failed attachment already reads as its filename followed by `failed`.

### A stranded pending Source is closed out by the existing sweep, not a new one

Temporal owns the screen once the workflow starts, and the workflow's catch marks the Source `failed`. The gap is the same one `startUndispatchedScans` covers for Scans: the api process can die between the transaction committing and the workflow starting.

The fix reuses that shape rather than adding a second reclaim loop — one step in the existing scheduled sweep restarts screening for every Source still `pending`. The workflow id is derived from the source id, so Temporal refuses a duplicate and the step is idempotent, which is why it needs no staleness window of its own.

A start that fails leaves the Source `pending`. Marking it `failed` was the first plan, on the reasoning that the row already exists so the failure should land on it — but a start fails when Temporal is unreachable, which says nothing about the Source, and the sweep only retries `pending` rows. Failing one here would strand every url Source saved during a transient outage, permanently, with a reason that blames the wrong thing. `failed` is reserved for a screen that reached a verdict.

### Url attachments get the same treatment

`ingestUrlAttachment` is absent from the working tree and from `HEAD`, while `openspec/specs/topic-attachments/spec.md` still requires it — the spec and the code have drifted. It is restored against this design rather than the old one: fetch, screen as a `document`, and refuse an unfetchable url instead of storing a contextless attachment. Building it back the old way would leave two url paths that disagree about whether an unfetchable page is an error.

`TopicInfo.tsx` also stops rendering a pending attachment's `sourceUrl` as a live link. Its `AttachmentPill` checks `failed` first and then `sourceUrl`, so a pending row falls through to the link branch and is clickable before its screen finishes.

## Risks / Trade-offs

- **A resumed review pays twice for part of its work** → The double-paid set is bounded and small: url-kind Sources, one topic-context embed, and whatever was admitted but unscored at the moment of death. Everything already scored is skipped by `loadUnscoredResources`, and a completed fetch is reused from `contentKey`.
- **The Budget resumes from the last heartbeat, not the last charge** → Up to sixty seconds of the failed attempt's spend is not carried forward, so the recorded cost can undercount slightly. Accepted: the alternative is a database write per charge, and LiteLLM meters the authoritative spend anyway.
- **A malformed or absent heartbeat detail silently resets the counters** → The resume function validates the shape and falls back to the passed budget, and its unit test covers both the malformed input and the ceiling assertion.
- **The migration is the whole change's blast radius** → A missing backfill hides every existing Source from non-owners and makes every Scan ingest nothing. The migration sets every existing row to `ready` in the same statement that adds the column.
- **The scanner fails open** → `screenText` returns the text unflagged on timeout or error, per the existing `injection-defense` requirement, so a scanner outage admits urls it would otherwise have flagged. Unchanged from how a fetched page is screened today; the fetch check still rejects a url that does not load.
- **Owner-supplied urls on non-`url` kinds stay ungated** → An `rss` Source's feed url is exposed on save exactly as before. Named as a non-goal so it is not rediscovered as a new bug; the status column and the gate are kind-agnostic, so opting `rss` in later is a one-line change to the insert path.

## Migration Plan

1. Migration adds `sources.status` (`source_status`, not null, default `pending`) and `sources.error` (nullable text), setting every existing row to `ready`.
2. Deploy worker and api together. The api writes `pending` only for `url` kinds, and only a worker with the screening workflow registered can move them to `ready`.
3. Rollback: the gate is the only thing that reads `status`, so reverting the api and worker leaves the columns in place and harmless.

## Open Questions

None. The two decisions that were open — whether the status reuses `attachmentStatus` and how a stranded pending Source is closed out — are settled above.
