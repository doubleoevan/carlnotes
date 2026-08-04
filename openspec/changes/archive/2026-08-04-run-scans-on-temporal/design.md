## Context

`runTopicScan` writes the `scans` row, then `processTopicScan` runs the pipeline: `ingestFromTopicSources`, `reviewScan`, and a final write that ends the Scan with its counts and cost. The whole thing is wrapped in one Langfuse observation and one try/catch that records `failed`.

All three callers start it without awaiting: `createTopic` for a Topic's first Scan, `runManualScan` for a Brew, and the scheduled sweep. The first two run inside the api process, which restarts on every deploy and on every source edit in development.

A process that dies never reaches its own catch, so the row keeps the `running` it was written with. `failStaleScans` is the only thing that reclaims it, thirty minutes later, and only when the sweep runs or someone Brews. The work itself is gone either way — the reader waited, nothing was scanned, and whatever the Scan spent before dying bought nothing.

Attachment processing already has the answer. `startAttachmentWorkflow` starts a Temporal workflow keyed by the attachment id, `worker/temporal.ts` runs a worker over `process-attachment.ts` and its activities, and the workflow owns the job rather than the process that asked for it.

Two facts shape the design. `Budget` is plain data — five numbers and two nested objects of numbers, with `charge` and `canSpend` as free functions over it — so it crosses an activity boundary as-is. And the pipeline's stages already have clean seams, each taking the Budget and the Scan row and returning a result.

## Goals / Non-Goals

**Goals:**
- A Scan finishes even when the process that started it goes away.
- A Scan that dies partway resumes at its last completed stage rather than paying again for what it already did.
- One Topic can never have two Scans running at once, enforced rather than queried.
- The reader sees the same thing they see today: a Topic page that lands already brewing.

**Non-Goals:**
- Moving any other background work onto Temporal.
- Changing what a Scan discovers, keeps, costs, or emails.
- Removing `failStaleScans`. The row is still written before the workflow starts, so that gap still needs a backstop.
- Per-Resource durability inside review. The unit of resumption is a stage, not a Resource.

## Decisions

### The pipeline splits into three activities, not one

The alternative was one activity wrapping the existing pipeline. It is a smaller diff and it does fix orphaning, since Temporal would own the lifecycle. It was rejected because it gives up the thing worth having: a Scan that dies during review would restart from ingestion and pay for it twice, so the retry policy would have to be `maximumAttempts: 1`, which is just today's behaviour with extra machinery.

The seams are `ingest`, `review`, and `finalize`, because those are the seams the pipeline already has. `Budget` being plain data is what makes this cheap: each activity takes the Budget it was given and returns the Budget it leaves behind, and the workflow threads that value through.

Charging stays mutation *inside* an activity. The paid section fetches and scores under bounded concurrency, so several tasks charge the same Budget at once; a `charge` that returned a copy would give each parallel task its own and keep only whichever finished last. Mutation within a stage and a value across the boundary are not in tension — the boundary is the only place the Budget has to be serializable, and it already is.

### The row is written first and the workflow takes its id

The workflow could create the `scans` row itself, which would close the write-then-start gap entirely. It was rejected because `createTopic` writes the row inside the transaction that creates the Topic, so the Topic page lands showing a Scan already under way. Moving the write into the workflow would make a new Topic briefly show no Scan at all, and would put a row's existence behind a queue.

So the callers keep writing the row and pass the scan id. The cost is the gap this leaves — a process that dies between the write and the start — which is why the backstop stays.

### The workflow id is derived from the Topic

`scan-<topicId>`. Temporal refuses to start a second workflow with a live id, so one Topic can never have two Scans in flight. That replaces the query the sweep does today to skip Topics with a running Scan, and it replaces the `runningScan` check in `runManualScan`. An already-started rejection is the "a scan is already running" answer, read from the server rather than from a row that might be stale.

### Paid stages do not retry blindly

Temporal retries activities by default, which for a stage that spends money means spending it again. `ingest` may retry: it dedupes on canonical url, so a re-run converges. `review` may not retry automatically, because its fetch and scoring calls are the spend. It gets `maximumAttempts: 1` and a failure ends the Scan as `failed`, which is what happens today. `finalize` may retry, since it is one idempotent write.

### The email and the activation event move into the workflow

`runManualScan` currently emails from a `.then` on the promise it did not await, and `runScanPipeline` tracks `first_scan_completed` inline. Both move into the workflow's final step, where they fire because the Scan finished rather than because a caller's promise settled. This also means a Scan that resumes after a crash still emails exactly once.

### Tracing accepts one span per stage

Today one Langfuse observation wraps the whole pipeline. Activities run as separate tasks, so that single span cannot survive the split. Each activity opens its own, and the workflow id is what correlates them. This is a real loss of a nested view in exchange for durability, and it is worth it — `traceStage` already records per-stage cost, which is the part anyone reads.

## Risks / Trade-offs

**Scanning starts depending on Temporal.** Today a missing Temporal worker breaks only attachments — `smoke:attach` fails and nothing else notices. After this, no worker means no scans at all, including manual ones, and the failure is silent at the api: `workflow.start` succeeds against a queue nobody polls. This has to be supervised in production before it ships, and it needs an alert on task-queue depth rather than on the api. In development `bun run dev:temporal` becomes required for any scan, which is new friction worth calling out in the README.

**A deploy mid-migration.** Rows written by the old code path are running with no workflow behind them, and rows written by the new path have one. `failStaleScans` reclaims the first kind on its usual delay, so the two coexist without special handling — but the first deploy will produce a burst of reclaimed rows, which is exactly the signal the new `reportError` in the reaper will fire on. Expect it, and do not read it as the new path failing.

**Double spend if a retry policy is wrong.** The whole reason review is `maximumAttempts: 1` is that its activities buy things. A future change that relaxes that, or that moves a paid call into a retrying activity, spends real money per attempt. This is the sharpest edge in the design and belongs in a comment at the retry policy, not only here.

**Resumption is only as good as the seams.** A crash inside review resumes by re-running review, not by resuming mid-review, so a Scan that dies after scoring twenty of thirty Resources pays for those twenty again. Finer seams are possible later; this design deliberately stops at three because per-Resource activities would multiply Temporal round-trips for the pipeline's hottest loop.
