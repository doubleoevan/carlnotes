## 1. Make the Budget a value the stages pass

- [x] 1.1 `worker/budget.ts`: `charge` keeps mutating the Budget it is given. The paid section charges from parallel tasks under `REVIEW_CONCURRENCY`, so a returned copy per task would lose every charge but the last. `Budget` is already plain data, which is all the activity boundary needs.
- [x] 1.2 `worker/ingest/index.ts`: `ingestFromTopicSources` keeps its signature. The activity wrapping it makes the Budget and returns it, so the value crosses the boundary without every stage function having to hand it back.
- [x] 1.3 `worker/review/index.ts`: `reviewScan` keeps its signature, for the same reason.
- [x] 1.4 Tests for the seam: a Budget serialized and revived between stages carries its spend and per-stage breakdown intact, and a stage starting from a non-zero Budget respects the ceiling already reached.

## 2. Split the pipeline into activities

- [x] 2.1 New `worker/workflows/run-topic-scan-activities.ts` exporting `ingestForScan`, `reviewForScan`, and `finishScan`, each taking and returning plain serializable data (ids, the Budget, the ingest outcome).
- [x] 2.2 `finishScan` owns the write that ends the Scan, the manual-scan email, and the first-succeeded-Scan event, so an outcome is announced once by whoever finishes the Scan.
- [x] 2.3 Each activity opens its own trace span. Record on the span the same per-stage cost `traceStage` records today.

## 3. The workflow

- [x] 3.1 New `worker/workflows/run-topic-scan.ts`: a workflow taking the scan id, topic id, owner id, and whether the Scan is manual, calling the three activities in order and threading the Budget between them.
- [x] 3.2 Retry policies, with the reason stated at the policy: ingest may retry, the paid review stage is `maximumAttempts: 1`, `finishScan` may retry.
- [x] 3.3 A failure in any activity ends the Scan as failed with its reason, matching what a thrown pipeline records today.

## 4. Starting the workflow

- [x] 4.1 `worker/temporal-client.ts`: `startTopicScanWorkflow`, with the workflow id derived from the topic id so one Topic never has two Scans in flight. Reuse the existing lazily built client.
- [x] 4.2 Treat an already-started rejection as "a Scan is already running" and return it as such, rather than letting it throw.
- [x] 4.3 `worker/temporal.ts`: register the second workflow and its activities. The worker takes one `workflowsPath`, so add a workflows barrel or a second worker, and say which and why in a comment.

## 5. Move the callers over

- [x] 5.1 `api/topic/topics.ts`: `createTopic` starts the workflow for the Scan row it opened, in place of the fire-and-forget `processTopicScan`.
- [x] 5.2 `api/topic/scans.ts`: `runManualScan` starts the workflow. The already-started rejection replaces the running-row query, and the email moves out of the `.then`.
- [x] 5.3 `worker/schedule.ts`: the sweep starts workflows. Drop the running-Scan filter from `loadScheduledTopics`, since the workflow id now enforces it, and keep `failStaleScans` running first.
- [x] 5.4 Confirm nothing still calls `processTopicScan` outside the activity, and that `runTopicScan`'s row-claiming logic ends up in exactly one place.

## 6. Operability, before this can ship

- [x] 6.1 README: `bun run dev:temporal` is required for any Scan in development, not only for attachments.
- [x] 6.2 A started workflow with no worker polling is silent at the api. Add the check that would catch it — task-queue depth or worker heartbeat — and say what alerts on it.
- [x] 6.3 Expect a burst of reclaimed rows on the first deploy, from Scans the old path left running. The reaper reports those now, so note it rather than reading it as the new path failing.

## 7. Verify

- [x] 7.1 Kill the worker mid-Scan and confirm the Scan resumes and reaches a terminal status rather than orphaning. Killed the worker six seconds in: the row sat at `running` with no spend, then resumed on restart and ended `succeeded`, 50 found, 30 kept, $0.133866.
- [x] 7.2 Kill it between ingest and review, and confirm ingestion is not paid for twice. Temporal's history records `ingestForScan` at attempt 1, three activities scheduled once each, no failures, and ingestion charged $0.035, matching an uninterrupted Scan.
- [x] 7.3 Ask for a manual Scan on a Topic already scanning, and confirm the refusal comes from the already-started rejection and charges no quota. The second start answered `running` and left no row behind.
- [x] 7.4 `bash scripts/preflight.sh`, then `bun run smoke:scan` against a real Topic. Preflight green, 261 tests. Every scan assertion in the smoke passes; its three remaining failures are the stale Langfuse prompt registry, which predates this change.
