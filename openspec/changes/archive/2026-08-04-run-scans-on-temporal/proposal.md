## Why

A Scan is a long, expensive, multi-stage job that today runs inside whichever process happened to ask for it. All three entry points — the first Scan `createTopic` opens, `runManualScan`, and the scheduled sweep — call the pipeline and do not await it. The `scans` row is written as `running` first, so the row's lifetime is tied to a process that restarts on every deploy.

When that process goes away mid-Scan, nothing throws. `processTopicScan` catches errors and records `failed`, but a process that dies never reaches its own catch. The row stays `running` with no one left to finish it, and the only thing that reclaims it is `failStaleScans`, on a thirty-minute delay, from the sweep or a manual Brew.

This is not hypothetical. A Topic created while no worker was running sat `running` for forty minutes and was reclaimed only by hand. The reaper closes the row but the work is simply lost: the reader waited, nothing was scanned, and the spend that did happen bought nothing.

Attachment processing already solved this. It runs on Temporal, where the workflow — not the process — owns the job, and a crash resumes rather than orphans. Scans are the same shape and should run the same way.

## What Changes

- A Scan runs as a Temporal workflow. The three entry points start a workflow instead of calling the pipeline directly, and return as soon as it is accepted.
- The pipeline is split into activities along the boundaries it already has — ingest, review, and the write that ends the Scan — so a crash resumes at the last completed stage rather than re-running the whole Scan and re-spending for it.
- The Budget stops being a mutable object threaded through the stages and becomes a value each activity returns and the next receives, since Temporal serializes activity arguments and results.
- The manual-scan email and the `first_scan_completed` event move into the workflow, so they fire once the Scan actually finishes rather than once the caller's promise settles.
- The workflow id is derived from the Topic, so one Topic can never have two Scans running at once. This replaces the running-row check the sweep does today.
- `failStaleScans` stays as a backstop. The `scans` row is still written before the workflow starts, so a failure in that gap can still leave a row behind that no workflow owns.

## Capabilities

### New Capabilities
- `durable-scans`: a Scan survives the death of the process that started it, resumes at its last completed stage, and can never run twice concurrently for one Topic

### Modified Capabilities
- `scheduled-scans`: the sweep starts workflows rather than running Scans in its own process, and no longer needs to skip Topics with a Scan in flight, since the workflow id enforces that
- `curation`: the review stage's Budget crosses an activity boundary, so what a Scan has spent is carried as a value between stages rather than accumulated in one object

## Impact

- Affected specs: `scheduled-scans`, `curation`, plus the new `durable-scans`
- Affected code: `worker/scan.ts` (pipeline split into activities), `worker/budget.ts` (Budget becomes serializable), `worker/temporal-client.ts` (start a scan workflow), `worker/temporal.ts` (register the second workflow and its activities), `worker/schedule.ts` (sweep starts workflows; the running-Scan filter goes), `api/topic/scans.ts` and `api/topic/topics.ts` (start a workflow instead of a fire-and-forget call), new `worker/workflows/run-topic-scan.ts` and its activities
- Operational: scanning newly depends on a reachable Temporal worker. Today a missing worker breaks only attachments; after this it stops all scanning, including manual. This has to be supervised in production before it ships, and `bun run dev:temporal` becomes required for scans in development
- Out of scope: moving any other background work onto Temporal; changing what a Scan costs, keeps, or emails; the `SCAN_STALE_MS` window, which stays as the backstop's threshold
