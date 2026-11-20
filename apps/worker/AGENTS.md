# apps/worker/

`workflows/receivePersonalSourcesEmail.ts` and `receivePersonalSourcesEmailActivities.ts` run on
`personal-sources-email`, with four activity slots. Only confirmation IDs and retry delays cross workflow history. The
sweep discovers pending or expired processing leases.

`workflows/summarizePersonalSourcesContext.ts` and `summarizePersonalSourcesContextActivities.ts` run on the
`personal-sources` queue. They debounce committed revisions, rebuild bounded private context, and wake at its earliest
expiry. The sweep calls `recoverPersonalSourcesWork` even when receiving is disabled. Activity errors and results
contain no Personal sources text.

The `@carlnotes/worker` app: the Temporal worker, the sweep, the monthly budget reset, the docs embed, and the
workflows the worker bundles. Nothing imports it. Every process starts through a root script, and the modules only the
sweep reads live here beside it.

Entries: `temporal.ts` (the worker, run as `bun run temporal` in production and `bun run dev:temporal:watch` in dev,
whose Workers `temporalWorkers.ts` creates, one per task queue with its activities and slots, with its scan concurrency
set by `SCAN_CONCURRENCY`, a second scan Worker on `topic-scans-scheduled` for the sweep's scheduled Scans with
`SCHEDULED_SCAN_CONCURRENCY` slots, 8 by default, so a person's first or manual Scan never waits behind them, the
concurrency of each of its attachment and Source screening Workers by `SCREEN_CONCURRENCY`, and a
Worker of its own for the `scan-closing` queue that records a scan's outcome apart from the scan slots. The main queue
group starts 17 Workers and the film group three. A failure that stops it is reported in the `startup` stage before its
Workers poll and in `worker` after, and the process exits once the report sends. It starts only as the process's entry,
so a test imports it without starting a worker), `schedule.ts` (the sweep, `bun run schedule`, or `bun run dev:worker`
on a minute's interval: it reads the daily spend cutoffs once through `@carlnotes/db/dailySpendCutoffs`, starts as many
scheduled scans as the backlog allows through `scheduledTopicScans.ts`, a daily topic past its owner's daily scans
cutoff once a week, and no scheduled scan of a free owner past the scheduled scans cutoff or of a Topic whose first scan
still waits, then copies the viewer
and listener counts through `syncViewerCounts.ts`, retries the pending object deletions through
`retryPendingObjectDeletions.ts`, checks the unchecked images again through `checkUncheckedImages` in
`@carlnotes/pipeline/uncheckedImageChecks` for two minutes a sweep, mails the support inbox one reminder for each
content report open past twelve hours through `reportReminders.ts`, sends the day's notifications emails through
`notificationsEmails.ts`, reports the day's spend across every user through `dailySpend.ts`, which warns past
`GLOBAL_DAILY_SPEND_ALERT_USD` and warns once the past hour's signups reach the `hourly-signups` threshold from the
spend control settings, and reports a Firecrawl credit that a review found spent, once, through
`reportFirecrawlCreditSpent` in `@carlnotes/pipeline/firecrawlCredit`. The day's spend is read through Redis under
`daily-spend:<UTC day>` for five minutes, so a sweep that runs again inside five minutes sums nothing, and a failed read
stores nothing. Each stage runs in its own try: a stage that throws is reported under its stage with the stage's name,
and the stages after it still run. A cron run with a failed stage exits with code 1 once its reports are sent, so its
`scan-sweep` cron monitor counts the run as failed. A sweep that could not read the scan queue reports the read and
starts no scheduled Scan in that run, and a start that cannot reach Temporal is that run's last, for the scheduled
Scans, the rows that were never dispatched, and the pending Source screens), `sweepReportSlots.ts` (the one-hour slot in
Redis that each report and threshold warning of a cron run takes before it is sent, through `limitReportsBySlot` in
`@carlnotes/server/monitoring`. Every cron run is a new process, so the hourly counts in its memory start from zero each
time. One sweep in the hour sends a report, the others send none, and a Redis that cannot say sends it),
`taskQueueReads.ts` (a task queue read whose failure is logged and reported, shared by the minute line and the sweep),
`scanQueue.ts` (the sweep's view of the scan queue: the start of the rows a dying caller never dispatched with the
trigger it would have used, oldest first up to the sweep's dispatch count with the rest left for the next sweep, the
waiting scans started oldest first up to the first scan dispatch limit with no key budget read, the queue's report, and
how many Scans a sweep may start, `SCAN_DISPATCH_LIMIT` minus the backlog, which the waiting scans do not count against.
`readScanDispatchCounts` reads both scan queues: the rows that were never dispatched are sized by `topic-scans`'s
backlog and the scheduled Scans by `topic-scans-scheduled`'s, and a scheduled queue that cannot be read starts no
scheduled Scan. It reads the limit each sweep through `scanDispatchLimit` in `@carlnotes/server/scanSettings`, and 0
starts no scheduled Scan. `scanQueue.test.ts` tests its dispatch and `scanQueueReads.test.ts` its queue reads, dispatch
counts, and limit), `scheduledTopicScans.ts` (the scheduled Topics' Scans, started a page at a time within each owner's
quota, daily topic limit, daily scans cutoff, and budget, the failed Scan that a spent budget saves, and the topic sweep
summary, tested in `scheduledTopicScans.test.ts` and, for its pages, `scheduledTopicScanPages.test.ts`),
`scheduledTopicFilter.ts` (the filter that selects the scheduled Topics over each Topic's
last completed Scan, which `toLastCompletedScans` returns as a subquery to join laterally, and the frequency window
between their Scans), `scheduledTopicPages.ts` (the scheduled Topics' ids read once in sweep order, a Topic that never
completed a Scan first and then the oldest last completed Scan, and the Topics of one page of those ids, which
`startScheduledTopicScanPages` in `scheduledTopicScans.ts` reads until the sweep has started as many Scans as it may,
with a page of the starts it has left, between 20 and 200 Topics), `scheduledTopicLimits.ts` (the limits that the sweep
reads once per owner for a page's Topics inside one request memo: the daily topic limit, the daily topics that scan
weekly past the
daily scans cutoff, with each owner's cutoff cached in Redis for an hour, the owners whose key budget is spent, cached
for a minute, and the free owners past the scheduled scans cutoff, read in one query only while that cutoff is passed,
with `scheduledTopicTestFixtures.ts` for the scheduled topic and the started Scan that its tests, the sweep's, and the
scan queue's share),
`resetMonthlyBudgets.ts` (the monthly budget reset, a daily job run as `bun run reset:monthly-budgets`, which replaces
each user's LiteLLM key through `@carlnotes/models/litellm`), `docsSync.ts` (`bun run docs:embed`, which splits the
pages under `apps/docs/src/content/docs` into sections and embeds them into `docs_chunks`, the sections chat quotes for
a question about the app; a section whose hash is unchanged is not embedded again), and `runMonitoredJob.ts` (the
wrapper every Northflank job's root script runs its command through, inside `doppler run`: the sweep and the reset check
in to their Sentry cron monitors from `CRON_MONITOR_CONFIGS` at start and with their result, and a failed release job,
`migrate`, `docs-sync`, or `edge-purge`, is reported in the `job` stage).

- The sweep and the reset each run under a job lease from `@carlnotes/db/jobLease`, so two overlapping runs cannot
  do the work twice. Each takes the lease's abort signal and checks it between batches: the sweep before each stage and
  each Topic, the reset before each user's key. A run that lost its lease stops and rejects, and the job exits non-zero.
  The sweep selects scheduled Topics in one SQL query and reads each owner's quota, key budget, and daily scans cutoff
  once. For a Topic whose owner's key has spent its budget, the sweep saves a failed Scan with the budget reason instead
  of starting a Scan. The Topics of an owner with no key, or of an owner whose budget read fails, are scanned as usual.
- `syncViewerCounts.ts` runs under its own job lease, `viewer-count-sync`. It takes the topics, profiles, teams, Topic
  Posts, and podcast episodes whose Redis counter changed, raises each one's count column to the counter's estimate and
  never lowers it, and saves each counter to `viewer_counters`. On the first sync, and after a Redis restart, it first
  rebuilds Redis from Postgres: it merges every saved counter back and adds the signed-in people that
  `viewerCountSeeds.ts` loads, each topic's owner, active followers, and finding openers, each published Topic Post's
  author, and each podcast episode's listeners. A shown count never drops, and the views counted since the last sweep
  are lost with a restart. A count whose save fails is listed as changed again for the next sweep. Under the same lease,
  `saveDailyCounts.ts` then adds the day's buffered views and plays from Redis into `daily_view_counts` and
  `daily_play_counts` a batch at a time, with one read of the batch's saved sketches, one Redis merge, and one upsert
  per kind. It drops the plays of a deleted podcast episode and puts a failed batch back for the next sweep. A failed
  batch's report says how many sweeps in a row have failed one, which Redis counts and a sweep that saves every batch
  clears. A take that Redis could not run is reported, and so is a failed batch that Redis could not put back, which
  is lost.
- The sweep starts `workflows/buildDashboardSnapshots.ts` on the `dashboard-snapshots` queue once per UTC day, under the
  id `dashboard-snapshots-<day>`, which only a failed run frees. Its activities in
  `buildDashboardSnapshotsActivities.ts` read the modules under `dashboards/`: `dashboardSubjects.ts` lists each person
  and team with a daily count row in the window, `dashboardDailyCountRows.ts` reads a Dashboard's rows with each item's
  title, path, and visibility and leaves a private topic whose legacy Personal sources text is not converted yet out of
  a team's Dashboard, `dashboardItemCounts.ts` counts each item's viewers by unioning the sketches in Redis through
  `countRowGroups` or sums its plays, `dashboardSummaries.ts` counts the summary strip, `dashboardSeries.ts` builds
  every chart's series for one selection with a map pin per place from `shownPlaces.ts`, at its postal code or city, and
  `dashboardSnapshots.ts` writes the public snapshots and any full ones that differ. An unchanged snapshot is not
  written again and keeps its paragraph and share image. A batch purges its Dashboards' edge cache tags. A new day,
  changed counts, or a missing paragraph queues a paragraph for writing in batches of 25. Builds and deletes share
  a per-Dashboard transaction lock. Public paragraph writes also
  purge the cache tags once saved. The run then deletes daily count rows past 400 days. A one-Dashboard rebuild runs
  the same workflow with a subject under one workflow id per Dashboard, and a change
  during a rebuild signals it to build again.
- `reportReminders.ts` reads the content reports still open and never reminded twelve hours after they were made,
  mails each one to `SUPPORT_EMAIL` through the report email template with its admin console link, and writes the
  report's reminded time, so a report is reminded once. Without `SUPPORT_EMAIL` it reads nothing.
- `notificationsEmails.ts` sends the daily notifications email once the UTC send hour has passed, under its own job
  lease. `notificationsEmailRows.ts` holds its reads. It reads a week of reactions and comments on each owner's Topics,
  Findings, and published Podcast Episodes, the reactions and replies to someone's comment, and the comments that
  mention someone, then sends each recipient what happened since their last email, or the last day for a first one. It
  leaves out the recipient's own writes, an author in a user block with them or under an admin block, a mention on a
  Topic they may no longer open, and a user whose switch is off. The day's `notifications_email_sends` row is written
  before the send, and a rejected send deletes it for the next sweep. A recipient with nothing to read gets a quiet row
  (`is_quiet`) in one insert at the end of the pass, and the recipients read leaves out every user with a row today, so
  a quiet person is read once a day. A quiet row is not an email: the next email starts at the last one that was sent,
  and a first email reaches a day back, or to the last quiet check if that is older. After each pass it deletes a
  recipient's rows that a later row of the same kind follows, so a user keeps at most their latest email row and
  latest quiet row. It makes no model call. `notificationsEmails.test.ts` tests the sweep and
  `notificationsEmailRows.test.ts` its reads, both through the sweep time, the activity rows, and the stubbed connection
  pool in `notificationsEmailTestFixtures.ts`.
-  `retryPendingObjectDeletions.ts` retries the pending keys in `pending_object_deletions` after the leased sweep,
  outside its lease, with a doubling backoff up to a day, and reports a key pending for over a day once, deleting each
  through `deleteStoredObject` in `@carlnotes/db/store`. It reads each key's row again right before the delete, so a key
  that a save cleared since the batch was read keeps its object. Before the sweep starts a Scan row that was opened and
  never dispatched, the sweep reads the row owner's key budget and marks the row failed with the budget reason if that
  budget is spent. A Scan that a user started by hand, and a waiting scan, starts without the budget read. A waiting
  scan has no dispatch time, so the reaper never fails it. The sweep reaps a picked-up Scan that runs past its stages'
  total timeouts, and a Scan still waiting for a worker past the ingest and finish stages' total timeouts, through
  `reapStaleScans` in `@carlnotes/pipeline/staleScans`, and starts the url Source screen of every Source still waiting
  on one through `@carlnotes/pipeline/screen`.
- `reaper.ts` is the sweep's reaper, which runs under the sweep's lease right after `reapStaleScans`, and
  `reapedKinds.ts` holds the five kinds of row it reaps and `reapStaleWork`, which the sweep calls. It reads the rows
  still in progress past their limit: a podcast episode at `recording`, a film at `rendering`, a Topic Post Discussion
  at `recording`, a topic image render at `pending`, and an attachment at `pending`. A limit is the workflow's longest
  run plus the 15-minute `REAPER_MARGIN_MS`, both from `@carlnotes/pipeline/stageTimeouts`, which is the one copy of
  each timeout: the workflow files import their activity options from it. Past the limit the reaper asks Temporal
  whether the row's workflow still runs, through `isWorkflowRunning` in `@carlnotes/pipeline/temporalClient`. A
  workflow that is gone has its work started again once on the same row, which records `restarted_at`, and a row that
  was already started again is failed through the write its own workflow fails it by. A workflow that still runs is left
  and reported, and a day past the limit it is terminated and its row failed. A failed Temporal read leaves the row and
  every row after it for the next sweep. Each kind of row is a `ReapedKind`. A recording that is started again reuses
  its row, plans from its saved script, writes no second script, and takes each chapter whose audio is already stored
  with no speech call. A film's limit runs from its row's last write, because each attempt of a first render writes the
  row. Only a first render is read: a film that renders again stays `ready`, and one marked `rendering` after its image
  was removed keeps its stored film for its rebuild. A film started again renders at the version new films render at, as
  a retry that reuses what was stored, on the platform's bill if its row's cost is zero, and no film is read while films
  are off or paused. A discussion and an image render start again without the note or the image prompt their first
  workflow took, which is never stored. A reaped image render's row is deleted, which gives its regeneration back, and
  an attachment is failed only while it is still pending. `reaperTestFixtures.ts` holds the sweep time and the Temporal
  spies that `reaper.test.ts` and `reapedKinds.test.ts` share.
-  `workflows/` — the Temporal workflows and their activities, one pair of files per workflow: `runTopicScan.ts` (the
  durable Scan, which runs the pipeline's three stages as activities and names the `scan-closing` queue),
  `processAttachment.ts` (a topic attachment's extraction and summaries. The extraction runs in a child process under
  a memory limit, through `@carlnotes/pipeline/attachExtraction`. One attempt has 4.5 minutes, its wait included, and
  a file that is itself at fault, or whose read ran past its time or its memory limit, fails without another
  attempt), `screenSource.ts` (a url Source's screen that
  its page can be read), `sendScanEmail.ts`, `sendPushNotifications.ts`, and `recordPodcastEpisode.ts`, with
  `deliveryRetryPolicy.ts` holding the send retry policy that the email and push workflows share. Temporal bundles a
  workflow file with webpack, so a workflow file imports only `@carlnotes/contracts/scanFailure`,
  `@carlnotes/contracts/podcastEpisodeWork`, `@carlnotes/contracts/topicVideoWork`,
  `@carlnotes/contracts/topicMemoryWork`,
  `@carlnotes/pipeline/stageTimeouts`, `@carlnotes/pipeline/pushWorkflows`, types, and its sibling files, and the
  activities file beside it imports the rest. `temporalWorkers.ts` resolves each workflow by
  `new URL("./workflows/<name>.ts", import.meta.url)`, and `scripts/check-workflow-bundles.ts` bundles every workflow in
  preflight.
- `workflows/renderTopicImage.ts` and `renderTopicImageActivities.ts` run on the `topic-images` queue: the scene, then
  the render and the store, with a spent budget and a rejection non-retryable, and a failure recorded on the row so the
  drawn covers stay. `workflows/backfillTopicImages.ts` is the one-off `topic-image-backfill` workflow that
  `bun run topic-images:backfill` starts, three children at a time, in the `missing`, `redo`, or `resize` mode.
  `workflows/backfillTopicCursor.ts` is the public-first, oldest-first Topic order and its page cursor, which this
  backfill and the film backfill both list by.
  `workflows/topicImageWorkflows.ts` is the one bundle the topic image worker loads, both workflows, and
  `topicImageWorkflowActivities.ts` registers both activity sets as one namespace.
- `workflows/runTopicScanActivities.ts` — the Scan's three stages. `ingestForScan` passes on the discovered Resources
  with the Source each is credited to, each Source's outcome narrowed by `toScannedSource` in
  `@carlnotes/pipeline/ingest/index` to the four fields the scan report reads, and each Source's result. `finishScan`
  reads the urls of the Scan's kept Findings once, and `toScanSourceResults` in `workflows/scanSourceResults.ts` counts
  each one for the Source credited with its Resource, or as earlier if no Source returned it. The found count adds the
  review's `earlierFoundCount`, the earlier Findings it read again that no Source returned. The kept count and
  `source_results` go in the same update as the found count and `problem_sources`, and a payload with no results, from a
  worker before them, writes `null`. A stop and a failure write no results. `reviewForScan` gives each attempt's stage
  Budget a fresh model call wait deadline through `toModelCallWaitDeadlineBudget`, 20 minutes into the review's 30.
  After it, a rate-limited model call stops waiting and fails, and no new Resource starts. A review that a person's
  stop cancelled returns what it scored. One that its worker's shutdown cancelled checkpoints its spend and fails with
  a retryable `WorkerShutdown` failure, so Temporal starts it again on a worker that is staying up, where it skips the
  pages already scored. The review gets three attempts, which cover two deploys close together.
  `runTopicScanActivities.test.ts` tests the ingest and review stages, and `runTopicScanClosingActivities.test.ts` the
  finish, stop, and failure writes.
- A completed Scan's email runs in its own workflow, `workflows/sendScanEmail.ts`, on the `scan-emails` queue that the
  file names, with its own Worker in `temporalWorkers.ts`. The scan workflow starts it as a child workflow that outlives
  the Scan's own, so a retrying email never holds up or fails the Scan. Each activity sends one batch or one report
  through `@carlnotes/pipeline/notify`.
- Push notifications run in `workflows/sendPushNotifications.ts` on the `push-notifications` queue that
  `@carlnotes/pipeline/pushWorkflows` names, with their own Worker in `temporalWorkers.ts`. A succeeded scheduled Scan
  starts `sendScanPushWorkflow` as a child named `scan-push-<scanId>` beside its email, behind
  `patched("scan-push-workflow")`, and the api starts `sendChatMentionPushWorkflow` named
  `chat-mention-push-<roomMessageId>` after a post saved mention
  rows. Each workflow sends once under the shared delivery retry policy, with a ten-minute limit and a heartbeat before
  each chunk's first read and after its send, which stops a cancelled attempt between chunks, sleeps 15 minutes, then
  reads its receipts, and a send or receipt check that fails for good is reported under the `push` stage without a
  token. The activities call `@carlnotes/pipeline/pushNotify` and `pushReceipts`, and a push the service did not take
  throws a `PushFailure`, final if waiting cannot fix it.
- A succeeded Scan's podcast episode is recorded in its own workflow, `workflows/recordPodcastEpisode.ts`, on the
  `episode-recordings` queue that `@carlnotes/contracts/podcastEpisodeWork` names, with its own Worker in
  `temporalWorkers.ts` whose concurrency is set by `PODCAST_RECORDING_CONCURRENCY`. A scheduled Scan's chapters record
  on the `episode-scheduled-chapters` queue, behind `patched("scheduled-chapter-queue")`, which an activities-only
  Worker polls
  with `PODCAST_SCHEDULED_CHAPTER_CONCURRENCY` slots, 32 by default, so a chapter that waits hours for speech capacity
  never holds a recording slot. `workerGauges.ts` puts that queue's pollers, backlog, and oldest wait in the worker's
  minute line beside the scan queue's, and a chapter that waited over an hour for a slot crosses the
  `scheduled-chapter-backlog` threshold. The encode runs on `episode-encodes`, behind
  `patched("podcast-episode-encode-queue")`, on an activities-only Worker with `PODCAST_ENCODE_CONCURRENCY` slots, 2
  by default and one for each of the replica's cores, and an encode that waited 15 minutes crosses
  `podcast-encode-backlog`. The outline, each segment, and a standard chapter retry with the chapter's backoff until
  an hour after they were scheduled, so a model's rate limit delays a podcast episode and does not fail it. The
  image step, `drawPodcastEpisodeImageActivity`, also stores the podcast episode's cover at both sizes once its
  image is settled, through `storePodcastEpisodeCovers` in `@carlnotes/pipeline/podcastCover`, and a cover that
  cannot be stored is reported and never fails the step. The scan
  workflow starts it as a child workflow that outlives the Scan's own,
  after the email workflow, and the podcast episode workflow signals the Scan's email workflow once its outline is
  settled, so the email can name the Podcast Episode. No audio passes between activities except through object storage.
  The encode and a discussion's recording run through `runWithHeartbeat` in `activityHeartbeat.ts`, which the film's
  render, a topic memory update, and a Scan's ingest and review share, the Scan's stages with the Budget's checkpoint
  in each heartbeat: a heartbeat every 30 seconds under a two-minute heartbeat timeout, and a signal that aborts once the
  attempt is cancelled. The steps are in `@carlnotes/pipeline/podcast/`. The plan records no new podcast episode while
  the spend control settings pause new podcast episodes, and a recording under way finishes.
- A published podcast episode's film renders in `workflows/renderTopicVideo.ts` on the `episode-videos` queue, whose
  Worker's concurrency is `TOPIC_VIDEO_CONCURRENCY`, default 1 and 2 on the film service. The recording workflow starts
  the render as an abandoned child after the image step, behind the `topic-video` patch. The workflow's first step
  writes the film's `rendering` row, and its failure mark follows the last attempt, both on the `episode-video-writes`
  queue behind the `topic-video-rendering-row` patch. The main queue group hosts that queue on a Worker with no workflow
  bundle and those two activities alone, so neither write waits behind a render or for a film replica. The film route
  starts the rebuild for a new image on the `episode-video-rebuilds` queue, which has a Worker and a slot of its own.
  The render is one activity, in `workflows/renderTopicVideoActivities.ts` beside the rebuild's, with a four-hour
  timeout, 3 attempts, a heartbeat every 30 seconds, and a two-minute heartbeat timeout, and the steps are in
  `@carlnotes/pipeline/topicVideo/`. An attempt that the worker's shutdown cut short fails with the `WorkerShutdown`
  type and its attempt number, and the workflow schedules the render again with the attempts it had left, at most 20
  times, behind the `topic-video-shutdown-reschedule` patch. The activity's heartbeat also reads whether the podcast
  episode is still published, and a render whose podcast episode was removed stops and ends as skipped. A cancelled
  render marks a first render failed in a scope that the cancellation cannot stop, behind the `settle-cancelled-film`
  patch, and leaves a ready film's row as it is. The activity draws the film's own 16:9 image before the intro and the
  sign-off, and a failed draw leaves the podcast episode's image. Before the chapters it fetches the Resource Images of
  each chapter's Resource, with no scrape, and draws the generated images that give each chapter one distinct image for
  every 30 seconds, up to `TOPIC_VIDEO_GENERATED_CHAPTER_IMAGE_LIMIT` a film, default 40, and a failed draw leaves the
  chapter on the images it has. Each chapter is a montage, encoded as one ffmpeg run for each shot. A render of a ready
  film below the current render version renders it again while it keeps playing, then swaps its files in one update, and
  a failure leaves the film that plays. An editor's regeneration of the film's own image runs as a `renderTopicImage`
  workflow on the `topic-images` queue, whose render row names the film, and its store starts the film's rebuild. A
  concurrency of 0 turns films off: no film Worker polls, and no recording or backfill starts a film. The api still
  queues a rebuild on the `episode-video-rebuilds` queue, which waits until a Worker polls it again.
  `isTopicPodcastEpisodeVideoEnabled` in `workflows/recordPodcastEpisodeActivities.ts` is false at a concurrency of 0
  and while the spend control settings pause new films. The backfill and the rebuild never ask it.
- `workflows/backfillTopicVideos.ts` gives each Topic's latest published podcast episode a film, and of the podcast
  episodes with no film only that one, then re-renders every ready film below the current render version, all on the
  platform's bill. It runs under the fixed id `episode-video-backfill` on the `episode-video-backfill` queue at
  `TOPIC_VIDEO_BACKFILL_CONCURRENCY`, default 1, where 0 creates no backfill Worker and starts no backfill, which
  `readTopicVideoStartup` in `temporalWorkers.ts` decides at the worker's boot, public Topics first, 100 a page with
  `continueAsNew`, each page listed by `workflows/backfillTopicVideosActivities.ts`: the Topics with no film first, then
  the films to render again, without a film whose re-render failed at this version, and with each first render that
  failed and was never started again, which the listing records as started again so it is rendered once more and never
  after that. The listing also returns what the films left are estimated to cost the platform, 24 cents a first film and
  1.3 cents a film rendered again, which the workflow logs at its start and after each batch. Each render is the film's
  own workflow as the backfill's child, under the film's workflow id and on the backfill's queue, behind the
  `topic-video-backfill-child-renders` patch, so Temporal rejects a second render of a film whose render is queued or
  running and the backfill counts it as skipped. Before each batch the backfill reads the `episode-videos` queue through
  `hasWaitingNewTopicVideo` and waits while a new film waits for a film Worker, a minute between reads, behind the
  `topic-video-backfill-new-film-wait` patch. It logs the counts so far and the films left after each batch.
  `temporal.ts` starts or joins it once the Workers poll, without waiting, and `bun run films:backfill`, the root script
  `scripts/backfill-topic-videos.ts`, starts or joins it and prints the summary. A podcast episode missing its inputs or
  failing every attempt gets a failed film row, so no later listing finds it again, and a re-render that fails for good
  leaves the film that plays and records the failed render version. The queue names live in
  `@carlnotes/contracts/topicVideoWork`, which the workflow files may import.
- `workflows/workflowReplays.test.ts` replays each history under `workflows/replayHistories/` on the workflow code as
  it is now. Each history was recorded from the workflow code before the change that its file name gives: a film
  that rendered, failed, was cancelled, and was still rendering, a backfill's first page, last page, and a page
  with a render under way, a recording that published and started its film, a scheduled recording with its encode
  under way, a discussion, a Scan that succeeded, a scheduled Scan in review, and a topic memory backfill with
  failures in a row. A change that adds a command to a workflow or moves a step to another queue sits behind
  `patched` and adds a history recorded before it, so a workflow under way at the deploy goes on.
- `workerDemand.ts` serves a replica's demand at `/metrics` on `WORKER_METRICS_PORT`, 9464 by default, for the
  platform's autoscaling: `carlnotes_film_demand` on a film replica, the renders its film Workers have taken plus the
  film queue's backlog divided by its pollers, and `carlnotes_scan_demand` on a main worker, over both scan queues.
  A queue that cannot be read answers 503 with no number. `workerGauges.ts` chooses the queues in a replica's minute
  line by its queue
  group: a film replica gauges `episode-videos` and `episode-video-writes` and counts the films left to render,
  keeping the count for ten minutes because it is a pass over every Topic.
- `temporal.ts` starts Sentry (`@carlnotes/server/monitoring`) before Langfuse's tracer (`@carlnotes/models/telemetry`)
  and logs the connection pool, the event loop delay, the scan queue, and Redis once a minute, and the sweep reports a
  queue it could not read, a queue nothing polls, and a backlog older than 15 minutes, all through `describeScanQueue`
  in `@carlnotes/pipeline/scanWorkflowClient`.
- Smoke scripts: `scan.smoke.ts` (`bun run smoke:scan`) runs a full Scan, ingest then review, on a seeded topic and
  sends its report to Resend's test inbox; `review.smoke.ts` (`bun run smoke:review`) scans one busy feed four times,
  with the second, third, and fourth checks in `reviewAgainChecks.ts`:
  the first reports its time, limit overshoot, and kept resources, the second scores none of the pages that the Topic's
  limit removed, the third scores exactly the three removed pages that changed (other content, a url Source, a rated
  chapter), and the fourth reviews everything again after an edited prompt; `links.smoke.ts` (`bun run smoke:links`)
  checks the links a url Source finds; `podcastEpisode.smoke.ts` (`bun run smoke:podcast-episode`) plans, scripts,
  records, publishes, and removes a short podcast episode through the workflow's own activity functions, seeding its
  rows through `@carlnotes/pipeline/podcast/podcastEpisodeSmokeFixtures`.
- Imports: `@carlnotes/pipeline`, `@carlnotes/models`, `@carlnotes/emails`, `@carlnotes/db`, `@carlnotes/server`, and
  `@carlnotes/contracts`, each module by its package path, plus `@temporalio/worker`, `@temporalio/workflow`, and
  `@temporalio/activity`. Never `@carlnotes/api` or another app.
- Tests: `bun test apps/worker`; `*.smoke.ts` hit real services and run under `doppler run`.
- Workflow tests run a workflow in `@temporalio/testing`'s time-skipping test server, in-process, on a queue no other
  worker polls, through `workflows/workflowTestFixtures.ts`. The first run downloads the test server binary, about
  65 MB, into the temp folder, and later runs reuse it. `recordPodcastEpisode.test.ts`, `runTopicScan.test.ts`,
  `renderTopicVideo.test.ts`, and `backfillTopicVideos.test.ts` use it, the last two with its film workers
  (`toFilmWorkers`) and recorded short writes (`toRecordedWrites`). The test server skips no time while an
  activity waits for its retry, so a test of a retry's backoff moves the clock with `testEnvironment.sleep`, on a
  test server of its own.

`workflows/personalSourcesContextLoop.ts` shares the durable revision decisions with deterministic virtual-time tests;
Temporal supplies replayable waits and activity calls.

- `workflows/publishTopicPost.ts` and `publishTopicPostActivities.ts` run on the `topic-posts` queue:
  `publishTopicPostWorkflow` writes a published Topic Post's summary, starts its image's render, and starts its first
  discussion 15 minutes later. `summarizeTopicPostWorkflow` writes the summary again after an edit: one workflow per
  post, which waits 30 seconds and summarizes the stored text, so the edits saved in that time share one rewrite. Every
  step is best effort. The image render itself is `renderTopicImageWorkflow`, which stores a Topic Post render's files
  under the post.

Topic Post Discussions: `publishTopicPostWorkflow` waits 15 minutes after the summary and the image, then starts the
post's first discussion, billed to its author, through `startTopicPostPublishDiscussionActivity`.
`workflows/recordTopicPostDiscussion.ts` holds `recordTopicPostDiscussionWorkflow`: the script, then the one speech
call with its encode and store, closing the row as failed if either fails for good. Its activities are in
`workflows/recordTopicPostDiscussionActivities.ts`, and both are exported from `recordPodcastEpisode.ts` and
`recordPodcastEpisodeActivities.ts`, so they run on the `episode-recordings` queue. `notificationsEmailRows.ts`
joins a reaction's and a comment's Topic Post, sends a post's activity to its author as well as to its topic's owner,
once if they are one person, and `notificationsEmails.ts` names the post by its title with a link to its page.

`workflows/topicMemories.ts` runs one succeeded Scan's Journal consolidation on its own queue, `topic-memories`, with
`TOPIC_MEMORY_CONCURRENCY` slots on a replica, 2 by default. `workerGauges.ts` puts that queue's pollers, backlog, and
oldest wait in the worker's minute line, and an update that waited over 15 minutes for a slot crosses the
`topic-memory-backlog` threshold. Its backfill reads the latest five succeeded Scans of a Topic oldest first. After
three Scans in a row fail, the backfill waits ten minutes and tries the last of them once more, behind
`patched("topic-memory-backfill-pause")`, so a rate limit or an outage slows it down and never walks every Topic
failing. `bun run topic-memories:backfill` under Doppler starts or joins the operator run. An update gets
`TOPIC_MEMORY_UPDATE_ATTEMPTS` attempts. One that finds another attempt's lease on its Scan fails with a retry delay of
a whole attempt's time, so its attempts are not spent while the other still runs, and a 401 on a key that the owner
replaced during the update is tried again on the new key. The activity gives the update a wait deadline half a minute
before the attempt's own, and reports the last attempt's failure by its error class and its status and error codes,
never by its message. The Scan workflow reports a topic memory child that could not start through
`reportTopicMemoriesNotStarted` on the closing queue, behind `patched("topic-memory-start-report")`, and a report that
fails is only logged, so the Scan's podcast episode, email, and push still start.
`workflows/failingTopicMemoryStartTestFixtures.ts` is the workflow interceptor that the Scan workflow's test loads by
path to fail that start.

A recording records its film render version in the child workflow input after the `topic-video-chapter-scenes-v4` patch.
Earlier histories and automatic backfills keep version 3. New recordings render at version 4 unless
`TOPIC_VIDEO_ANIMATED_CHAPTERS=false`. Replaying an activity keeps its recorded version. FFmpeg reads a reviewed
animation clip in place of its still during a Finding shot. It applies the original camera move and transition to that
input. Eligible new pictures share one bounded vision request per Finding chapter. The private plan stores each
confirmed effect and its region. A failed selection leaves the montage playable. Comments and both bookends keep the
montage and the host illustration’s reviewed steam loop. Encode cancellation uses the activity signal. The film slot's
deadline starts once the render holds the slot.

`workerQueueGroup.ts` selects the queues. The main queue group runs scans and recordings and dispatches new films.
The films queue group polls the film queue, the rebuild queue, and the backfill's queue. A replica has
`TOPIC_VIDEO_CONCURRENCY` render slots, which a new film's render and a backfill's render wait for in one line, oldest
first. A render gives its slot back while it waits on a provider for an image, a chapter's plan, or a clip. A rebuild
has a slot of its own. A selected upgrade checks for outstanding new films before admission, and the backfill starts no
render while a new film waits for a film Worker. A newly arrived film can wait for a backfill render that has already
started. The automatic backfill stays at version 3.

For a new version 4 film, the video model can animate one eligible public Finding’s generated picture for five seconds. Free accounts get one unique picture per UTC month, Plus gets three and Premium gets seven. An admin owner can generate additional pictures on their model key. The platform pays for the first Free picture each month. Optional platform-paid upgrades skip video generation. The worker stops calling the animation model after it selects eight distinct local effects across the film. The reusable host steam uses neither allowance.

The Scan smoke test renders its model prompt samples through `scanPromptChecks.ts`.
