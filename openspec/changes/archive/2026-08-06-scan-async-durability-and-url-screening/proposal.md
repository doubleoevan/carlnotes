## Why

Two problems share one shape: work the app starts and cannot be trusted to finish, or to have been vetted.

A redeploy during review kills the worker and Temporal has no signal, so the Scan waits out the full thirty-minute per-attempt clock and then fails outright. Verified live: a Scan ran 31.7 minutes, ended `Activity task timed out`, and discarded seven Findings the attempt had already paid for. Nothing heartbeats, and `reviewForScan` at `maximumAttempts: 1` makes that timeout terminal.

Separately, a url written into a Topic prompt becomes a url Source on save and renders in the Sources card to every viewer of a public Topic — anonymous included — the instant it is saved. LLM Guard's page screen runs much later and only decides whether a fetched page becomes a Finding. Nothing decides whether the url itself is fit to show. Screening it needs a second async pipeline, which would inherit the first bug on day one, so the two land together.

## What Changes

**Scan durability**

- Heartbeat pump around the ingest and review activities, in `worker/workflows/run-topic-scan-activities.ts`. A `setInterval` that dies with the process is the signal Temporal needs; nothing in `worker/review/` changes.
- `reviewForScan` retries at `maximumAttempts: 2`. Review is already nearly idempotent — `loadUnscoredResources` excludes every Resource already carrying a Finding for the Topic, `upsertFinding` is keyed on topic and resource, and a persisted embedding plus a stored `contentKey` make re-gating and re-fetch free.
- The Budget rides the retry through heartbeat details. A resumed attempt takes `spent`, `stageCosts`, and `fetchCounts` from the last recorded details, and its ceilings from a fresh budget, so an environment-read cap is never stale and the scored-resource ceiling cannot re-arm from zero.
- `finishScan` reads `keptCount` from the database by scan id instead of review's in-memory tally, which is the only version that survives a retry and the one that agrees with the scan email.
- Every activity gains a `scheduleToCloseTimeout`, and `MAX_SCAN_DURATION_MS` derives from those totals instead of one attempt per stage. Today the constant sums 30 + 30 + 2 while ingest already retries three times, so a Scan may legally run 126 minutes against a 77-minute reclaim window and the reaper can close out a Scan that is still running.

**Url screening**

- `sources` gains a `status` (pending / ready / failed) and an `error`, defaulting to pending. **BREAKING** for any reader that assumed every stored Source is live.
- A Temporal workflow shaped like `process-attachment` screens a url Source asynchronously: `fetchContent` rejects a malformed, non-http, or privately routable url, then `screenText(content, "page")` runs PromptInjection, InvisibleText, BanTopics, and Toxicity. Clean becomes ready. Flagged, or unfetchable at all, becomes failed with the reason recorded.
- A Source that is not ready is inert in three places: the read path (`api/topic/topics.ts`, `api/topic/feeds.ts`) hides it from non-owners, the scan path (`ingestFromTopicSources`) skips it, and the topic page and edit modal show the owner a checking state and then a real reason.
- Url attachments get the same treatment, so the two paths cannot drift: `ingestUrlAttachment` is restored against this design — fetch, screen as a document, and refuse an unfetchable url instead of storing a contextless attachment. `TopicInfo.tsx` stops rendering a pending attachment's `sourceUrl` as a live link.

## Capabilities

### New Capabilities

- `source-screening`: an owner-supplied url Source is saved immediately, screened asynchronously, and inert — invisible to non-owners and skipped by scans — until it passes, with the owner seeing a checking state and then a real reason.

### Modified Capabilities

- `durable-scans`: activities heartbeat so a dead worker is detected in about two minutes instead of thirty; the paid review stage may retry once, carrying its Budget across the retry; the Scan's kept count is read from the database; the reclaim window derives from per-activity `scheduleToCloseTimeout` totals rather than one attempt per stage.
- `source-ingestion`: a Source that is not `ready` is skipped by ingest, so an unscreened url is never fetched into a Resource.
- `injection-defense`: the scanner screens an owner-supplied url's page before the url is exposed to a reader, not only before a fetched page becomes a Finding.
- `topic-attachments`: url attachment ingestion screens the fetched page as a document and refuses an unfetchable url; a pending attachment's origin url is not a live link.
- `domain-schema`: a Source carries an async screening status and failure reason.

## Impact

- **Worker**: `worker/workflows/run-topic-scan.ts`, `run-topic-scan-activities.ts`, `stage-timeouts.ts`, a new source-screening workflow and activities file, `worker/ingest/index.ts`, `worker/index.ts` (workflow registration), `worker/attach.ts` (`ingestUrlAttachment`), `worker/schedule.test.ts`.
- **API**: `api/topic/topics.ts`, `api/topic/feeds.ts` (gating and the new status on the wire), the topic save path that inserts Sources (starts the screening workflow).
- **DB**: a migration adding `sources.status` and `sources.error`, and the enum backing that status.
- **Shared**: `shared/contracts.ts` source summary gains status and error.
- **UI**: `ui/src/components/topic/TopicInfo.tsx` and the Sources rows in the edit modal.
- **Dependencies**: none added. Reuses `@temporalio/activity`, `worker/scrape.ts`, and `worker/guard.ts` as they stand.
- **Verification**: live, since the suite has no database-backed tests. `bun run smoke:review` is a free regression guard for the heartbeat no-op path, since it calls the activities with no Temporal context.
