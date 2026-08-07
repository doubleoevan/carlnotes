## 1. Scan heartbeats

- [x] 1.1 Add `HEARTBEAT_INTERVAL_MS` (30s) and `HEARTBEAT_TIMEOUT_MS` (2 min) to `worker/workflows/stage-timeouts.ts`, with a comment recording the throttle math: the SDK throttles outbound heartbeats to the lesser of 80% of the timeout and `maxHeartbeatThrottleInterval` (60s default), so 2 minutes throttles at the 60s cap and leaves double the margin a 60-second timeout would.
- [x] 1.2 Add a heartbeat pump helper in `worker/workflows/run-topic-scan-activities.ts`: a `setInterval` reaching the activity context through `asyncLocalStorage` from `@temporalio/activity` and calling `heartbeat` through an optional chain, so it is a no-op with no context rather than a throw. Clear the interval in a `finally`.
- [x] 1.3 Wrap `ingestForScan` and `reviewForScan` with the pump, inside their existing `traceScanStage` callbacks. Change nothing in `worker/review/`. Leave `finishScan` and `failScan` unwrapped.
- [x] 1.4 Set `heartbeatTimeout` on the `ingestForScan` and `reviewForScan` proxies in `worker/workflows/run-topic-scan.ts`.
- [x] 1.5 Run `bun run smoke:review` to confirm the pump is a no-op when the activities are called with no Temporal context. It ran the full pipeline with no context and no throw: 30 found, 10 kept, `findings rows 10 (scan kept_count 10)`, which also confirms 3.1's database-counted kept count. Its one failing assertion, "the scan bought its best survivors", reproduces identically on `HEAD` with the same two resource ids and similarities, so it is pre-existing and unrelated.

## 2. Review retry and Budget resumption

- [x] 2.1 Add a pure `toResumedBudget(heartbeatDetails, passedBudget)` to `worker/budget.ts`: validate the shape, take `spent`, `stageCosts`, and `fetchCounts` from the details, take `cap` and `maxScoredResources` from a fresh `newBudget()`, and fall back to `passedBudget` when the details are missing or malformed.
- [x] 2.2 Unit-test `toResumedBudget` in `worker/budget.test.ts`: counters resume from the details, ceilings come from the fresh budget and not the details, and a malformed or absent detail falls back to the passed budget.
- [x] 2.3 Pass the live Budget as the pump's heartbeat details, so each tick checkpoints its current state.
- [x] 2.4 Read the last recorded details from `activityInfo().heartbeatDetails` at the top of `ingestForScan` and `reviewForScan` and build each stage's Budget through `toResumedBudget`.
- [x] 2.5 Raise `reviewForScan` to `maximumAttempts: 2` in `worker/workflows/run-topic-scan.ts`, and rewrite the comment above the proxy, which currently presents `maximumAttempts: 1` as the deliberate choice, to record why one retry is now right and why it is not three.

## 3. Kept count and the reclaim window

- [x] 3.1 Count `keptCount` in `finishScan` from `findings` where `scanId` is this Scan, instead of `review.keptCount`.
- [x] 3.2 Add `scheduleToCloseTimeout` to every activity proxy in `worker/workflows/run-topic-scan.ts`, covering each stage's attempts.
- [x] 3.3 Derive `MAX_SCAN_DURATION_MS` in `worker/workflows/stage-timeouts.ts` from the per-activity schedule-to-close totals rather than one attempt per stage, and update the comment.
- [x] 3.4 Rewrite the `MAX_SCAN_DURATION_MS` assertion in `worker/schedule.test.ts` so it holds under any retry policy: the reclaim window must exceed the sum of the schedule-to-close bounds, not the sum of one attempt each.

## 4. Source screening schema

- [x] 4.1 Add a `source_status` pgEnum in `db/schema.ts` over the `attachmentStatuses` values from `shared/enums.ts`, and add `status` (not null, default `pending`) and `error` (nullable text) to the `sources` table.
- [x] 4.2 Generate the migration and confirm it backfills every existing `sources` row to `ready`. Without this, every existing Source is hidden from non-owners and every Scan ingests nothing.
- [x] 4.3 Add `status` and `error` to the source summary in `shared/contracts.ts`.

## 5. The screening workflow

- [x] 5.1 Add `worker/workflows/screen-source-activities.ts`: load the Source, `fetchContent(config.url)` from `worker/scrape.ts`, `screenText(content, "page")` from `worker/guard.ts`, then mark the Source `ready`, or `failed` with `toFlaggedReason(verdict)`. A Source that no longer exists is a non-retryable failure, as `extractAttachmentText` already does.
- [x] 5.2 Add `worker/workflows/screen-source.ts` shaped like `process-attachment.ts`: a 2-minute `startToCloseTimeout`, `maximumAttempts: 3`, a `scheduleToCloseTimeout` bounding those attempts, and a catch that marks the Source failed with the reason. No heartbeat pump — the activity is one bounded fetch plus one 2.5-second screen, so the start-to-close gives the same detection latency for free.
- [x] 5.3 Register the workflow and its activities as their own Worker in `worker/temporal.ts`, and add `startSourceScreenWorkflow(sourceId)` to `worker/temporal-client.ts` with workflow id `source-${sourceId}`. It polls a `source-screening` queue of its own rather than the attachment queue: a `Worker` binds one `workflowsPath` to one queue, so sharing would need a barrel module re-exporting both workflows and a queue named `attachment-processing` running source screens.
- [x] 5.4 An unfetchable url fails the Source rather than warning. Confirm no change is needed in `worker/review/score.ts`: such a Source never reaches `ready`, so it never reaches ingest and is never scored against an empty snippet.

## 6. Saving and starting the screen

- [x] 6.1 In `createTopic` and `updateTopic` in `api/topic/topics.ts`, insert url Sources as `pending` and every other kind as `ready`, returning the inserted ids.
- [x] 6.2 After the transaction commits, start the screening workflow for each newly inserted url Source, fire-and-forget the way the first Scan is started. A start that throws leaves that Source `pending` rather than failing it: a start fails when Temporal is unreachable, which says nothing about the Source, and only a `pending` Source is ever retried.
- [x] 6.3 Add a step to `runScheduledTopicScans` in `worker/schedule.ts`, shaped like `startUndispatchedScans`, that restarts screening for every Source still `pending`. The workflow id is derived from the source id, so Temporal refuses a duplicate and the step is idempotent, which is why it needs no staleness window of its own.

- [x] 6.4 Make a new Topic's first Scan wait for its screens: `screenTopicSources(topicId)` in `worker/screen.ts` starts them and polls the Source rows until none are pending, bounded at 30s, and `createTopic` chains the first Scan behind it. Polls the rows rather than the workflows, since the row status is what ingest reads. Only the first Scan waits; manual and scheduled Scans are untouched. Without this the url a Topic is created with is skipped on the one Scan the owner watches, and its Findings arrive up to a day later.

## 7. Gating a Source that is not ready

- [x] 7.1 In `api/topic/topics.ts`, exclude Sources that are not `ready` from `sourceSummaries` for a non-owner who is not an admin, and include `status` and `error` for the owner and admins.
- [x] 7.2 Apply the same gating to the Source rows in `api/topic/feeds.ts`.
- [x] 7.3 Skip a Source that is not `ready` in `ingestFromTopicSources` in `worker/ingest/index.ts`, returning the existing `skipped` outcome so one Source stops only itself.

## 8. Owner-facing states

- [x] 8.1 Show a checking state for a pending Source and the recorded reason for a failed one in the topic page's Sources card, reading the way a failed attachment reads as its filename followed by `failed`. A Source that is not ready is never a live link.
- [x] 8.2 Show the same states on the Source rows in the edit modal.
- [x] 8.3 Fix `AttachmentPill` in `ui/src/components/topic/TopicInfo.tsx`: it checks `failed` first and then `sourceUrl`, so a pending attachment falls through to the link branch and is clickable before its screen finishes. Render a pending attachment's url as plain text with the processing marker.

## 9. Url attachments

- [x] 9.1 Restore `ingestUrlAttachment` in `worker/attach.ts` against this design, not the old one: validate the url through `toFetchableUrl`, `fetchContent`, and refuse an unfetchable url before anything is stored. Note that `openspec/specs/topic-attachments/spec.md` still requires this function while neither the working tree nor `HEAD` defines it. The document screen is not repeated here: `extractAttachmentText` in the processing workflow already screens the stored markdown as a document, and screening twice would break the one-pass-per-layer rule in `injection-defense`.
- [x] 9.2 Restore the `POST /topics/:id/attachments/url` route and its `attachmentUrlPayload` if they are also absent, reusing the multipart route's validation-error split.

## 10. Verification

- [x] 10.1 `bunx biome check .`, `bunx tsc -b`, `bun test`.
- [x] 10.7 Set `status: "ready"` on every direct `insert(sources)` outside the api: `db/seed.ts`, `worker/review.smoke.ts`, `worker/scan.smoke.ts`, `worker/search.smoke.ts`. The column defaults to `pending` so an unscreened url fails closed, which means a direct inserter that says nothing is skipped by ingest. Caught by `smoke:review` reporting 0 found.
- [x] 10.2 Live: started a Scan, waited for 25 Findings, then `kill -9`ed the worker 45s into review. Temporal reported `LastFailure: {"message":"activity Heartbeat timeout","timeoutFailureInfo":{"timeoutType":"TIMEOUT_TYPE_HEARTBEAT"}}` with `Attempt 2 / MaximumAttempts 2`, fired at 07:36:06 — two minutes after the last heartbeat at 07:34:06, not after the 30-minute start-to-close. A first pass with plain `pkill` proved nothing: SIGTERM starts the SDK's two-minute `shutdownGraceTime`, so review simply ran to completion on attempt 1. The kill has to be SIGKILL, and must land after the pump's first 30s tick or there is no checkpoint to resume from.
- [x] 10.3 Live: the retried Scan reached `succeeded` (this scenario used to end `failed` after thirty minutes), `findings rows 10 == kept_count 10`, and the Budget resumed — `embedding` came to 0.0000098 against 0.0000049 for the same Scan without a retry, exactly two topic-context embeds, so attempt 1's spend is in the total rather than reset. `reused: 14` shows the fetch counts carried across too.
- [x] 10.4 Live, for the unfetchable url: `pending` at save, then `failed` with `this page could not be read: firecrawl scrape … returned no content`. Through the real api route with no session, the public Topic returns only its `search` Source (`isOwner: false`, `monthCost: null`) — the url is absent. The owner's topic page renders `url — <the url> · this page could not be read: …`. `ingestFromTopicSources` reported `{"kind":"url","status":"skipped"}` and created zero Resources from that url, while the `search` Source still ran `ok`. **The screens-dirty half could not be run here**: `LLM_GUARD_URL` is unset in this Doppler environment, so `screenText` fails open by design, and the `laiyer/llm-guard-api` image never finished pulling.
- [x] 10.5 Live: the seeded public Topic `top_llm_evals` still returns its rss Source to an anonymous viewer after the migration, and all 36 pre-existing Source rows are `ready`.
- [x] 10.8 Corrected the `injection-defense` fail-open requirement to match the code rather than the other way round. It required the degradation to be logged whenever the scanner is skipped, including when its url is unset — but `worker/guard.ts` returns silently in that branch and reports only a configured scanner that then fails. Logging an unset url would fire once per screened text in a deployment that has deliberately chosen to run without a scanner, burying the failures worth seeing. The spec now separates the two: a configured scanner that fails is an incident, an unset url is configuration. No code change.
- [x] 10.6 Updated the `domain-model` skill's Source row: it was missing `url` from the kind list, and now names the screening status and what inert means for a Source that has not passed it.
