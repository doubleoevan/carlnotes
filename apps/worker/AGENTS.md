# apps/worker/

The `@carlnotes/worker` app: the Temporal worker, the sweep, the monthly budget reset, the docs embed, and the
workflows the worker bundles. Nothing imports it. Every process starts through a root script, and the modules only the
sweep reads live here beside it.

Entries: `temporal.ts` (the worker, run as `bun run temporal` in production and `bun run dev:temporal:watch` in dev,
with its scan concurrency set by `SCAN_CONCURRENCY`, the concurrency of each of its attachment and Source screening
Workers by `SCREEN_CONCURRENCY`, and a Worker of its own for the `scan-closing` queue that records a scan's outcome
apart from the scan slots. A failure that stops it is reported in the `startup` stage before its Workers poll and in
`worker` after, and the process exits once the report sends), `schedule.ts` (the sweep, `bun run schedule`, or
`bun run dev:worker` on a minute's interval: it starts as many scheduled scans as the backlog allows, a daily topic past
its owner's daily scans cutoff once a week, then copies the viewer and listener counts through `syncViewerCounts.ts`,
retries the pending object deletions through `retryPendingObjectDeletions.ts`, mails the support inbox one reminder for
each content report open past twelve hours through `reportReminders.ts`, and reports the day's spend across every user
through `dailySpend.ts`, which warns past `GLOBAL_DAILY_SPEND_ALERT_USD`), `scanQueue.ts` (the sweep's view of the scan
queue: the start of the rows a dying caller never dispatched, the queue's report, and how many Scans a sweep may start,
`SCAN_DISPATCH_LIMIT` minus the backlog), `scheduledTopicLimits.ts` (the limits that the sweep reads once per owner
inside one request memo: the daily topic limit, the daily topics that scan weekly past the daily scans cutoff, with each
owner's cutoff cached in Redis for an hour, and the owners whose key budget is spent, with
`scheduledTopicTestFixtures.ts` for the scheduled topic that its tests and the sweep's share), `resetMonthlyBudgets.ts`
(the monthly budget reset, a daily job run as `bun run reset:monthly-budgets`, which replaces each user's LiteLLM key
through `@carlnotes/models/litellm`), and `docsSync.ts` (`bun run docs:embed`, which splits the pages under
`apps/docs/src/content/docs` into sections and embeds them into `docs_chunks`, the sections chat quotes for a question
about the app; a section whose hash is unchanged is not embedded again).

- The sweep and the reset each run under a database claim from `@carlnotes/db/claim`, so two overlapping runs cannot
  do the work twice. Each takes the claim's abort signal and checks it between batches: the sweep before each stage and
  each Topic, the reset before each user's key. A run that lost its claim stops and rejects, and the job exits non-zero.
  The sweep selects scheduled Topics in one SQL query and reads each owner's quota, key budget, and daily scans cutoff
  once. For a Topic whose owner's key has spent its budget, the sweep saves a failed Scan with the budget reason instead
  of starting a Scan. The Topics of an owner with no key, or of an owner whose budget read fails, are scanned as usual.
- `syncViewerCounts.ts` runs under its own claim, `viewer-count-sync`. It takes the topics and podcast episodes whose
  Redis counter changed, raises each one's count column to the counter's estimate and never lowers it, and saves each
  counter to `viewer_counters`. On the first sync, and after a Redis restart, it first rebuilds Redis from Postgres: it
  merges every saved counter back and adds the signed-in people that `viewerCountSeeds.ts` loads, each topic's owner,
  active followers, and finding openers, and each podcast episode's listeners. A shown count never drops, and the
  views counted since the last sweep are lost with a restart. A topic or podcast episode whose save fails is listed as
  changed again for the next sweep.
- `reportReminders.ts` reads the content reports still open and never reminded twelve hours after they were made,
  mails each one to `SUPPORT_EMAIL` through the report email template with its admin console link, and writes the
  report's reminded time, so a report is reminded once. Without `SUPPORT_EMAIL` it reads nothing.
-  `retryPendingObjectDeletions.ts` retries the pending keys in `pending_object_deletions` after the claimed sweep,
  outside its claim, with a doubling backoff up to a day, and reports a key pending for over a day once, deleting each
  through `deleteStoredObject` in `@carlnotes/db/store`. Before the sweep starts a Scan row that was opened and never
  dispatched, the sweep reads the row owner's key budget and marks the row failed with the budget reason if that budget
  is spent. A Scan that a user started by hand starts without the budget read. The sweep closes out a picked-up Scan
  that runs past its stages' total timeouts, and a Scan still waiting for a worker past the ingest and finish stages'
  total timeouts, through `failStaleScans` in `@carlnotes/pipeline/staleScans`, and starts the url Source screen of
  every Source still waiting on one through `@carlnotes/pipeline/screen`.
-  `workflows/` — the Temporal workflows and their activities, one pair of files per workflow: `runTopicScan.ts` (the
  durable Scan, which runs the pipeline's three stages as activities and names the `scan-closing` queue),
  `processAttachment.ts` (a topic attachment's extraction and summaries), `screenSource.ts` (a url Source's screen that
  its page can be read), `sendScanEmail.ts`, and `recordPodcastEpisode.ts`. Temporal bundles a workflow file with
  webpack, so a workflow file imports only `@carlnotes/contracts/scanFailure`, `@carlnotes/pipeline/stageTimeouts`,
  types, and its sibling files, and the activities file beside it imports the rest. `temporal.ts` resolves each workflow
  by `new URL("./workflows/<name>.ts", import.meta.url)`, and `scripts/check-workflow-bundles.ts` bundles every workflow
  in preflight.
- `workflows/runTopicScanActivities.ts` — the Scan's three stages. `ingestForScan` passes on the discovered Resources
  with the Source each is credited to, each Source's outcome narrowed by `toScannedSource` in
  `@carlnotes/pipeline/ingest/index` to the four fields the scan report reads, and each Source's result. `finishScan`
  reads the urls of the Scan's kept Findings once, and `toScanSourceResults` counts each one for the Source credited
  with its Resource, or as earlier if no Source returned it. The found count adds the review's `earlierFoundCount`, the
  earlier Findings it read again that no Source returned. The kept count and `source_results` go in the same update as
  the found count and `problem_sources`, and a payload with no results, from a worker before them, writes `null`. A stop
  and a failure write no results.
- A completed Scan's email runs in its own workflow, `workflows/sendScanEmail.ts`, on the `scan-emails` queue that the
  file names, with its own Worker in `temporal.ts`. The scan workflow starts it as a child workflow that outlives the
  Scan's own, so a retrying email never holds up or fails the Scan. Each activity sends one batch or one report through
  `@carlnotes/pipeline/notify`.
- A succeeded Scan's podcast episode is recorded in its own workflow, `workflows/recordPodcastEpisode.ts`, on the
  `episode-recordings` queue that the file names, with its own Worker in `temporal.ts` whose concurrency is set by
  `PODCAST_RECORDING_CONCURRENCY`. The scan workflow starts it as a child workflow that outlives the Scan's own, after
  the email workflow, and the podcast episode workflow signals the Scan's email workflow once its outline is settled, so
  the email can name the Podcast Episode. No audio passes between activities except through object storage. The steps
  are in `@carlnotes/pipeline/podcast/`.
- `temporal.ts` starts Sentry (`@carlnotes/server/monitoring`) before Langfuse's tracer (`@carlnotes/models/telemetry`)
  and logs the connection pool, the event loop delay, the scan queue, and Redis once a minute, and the sweep reports a
  queue nothing polls and a backlog older than 15 minutes, both through `describeScanQueue` in
  `@carlnotes/pipeline/temporalClient`.
- Smoke scripts: `scan.smoke.ts` (`bun run smoke:scan`) runs a full Scan, ingest then review, on a seeded topic and
  sends its report to Resend's test inbox; `review.smoke.ts` (`bun run smoke:review`) scans one busy feed and reports
  its time, limit overshoot, and kept resources; `links.smoke.ts` (`bun run smoke:links`) checks the links a url Source
  finds; `podcastEpisode.smoke.ts` (`bun run smoke:podcast-episode`) plans, scripts, records, publishes, and removes a
  short podcast episode through the workflow's own activity functions, seeding its rows through
  `@carlnotes/pipeline/podcast/podcastEpisodeSmokeFixtures`.
- Imports: `@carlnotes/pipeline`, `@carlnotes/models`, `@carlnotes/emails`, `@carlnotes/db`, `@carlnotes/server`, and
  `@carlnotes/contracts`, each module by its package path, plus `@temporalio/worker`, `@temporalio/workflow`, and
  `@temporalio/activity`. Never `@carlnotes/api` or another app.
- Tests: `bun test apps/worker`; `*.smoke.ts` hit real services and run under `doppler run`.
