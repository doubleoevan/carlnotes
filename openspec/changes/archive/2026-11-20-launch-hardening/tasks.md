# Tasks

Part A of the launch hardening work. Group 0 audits the topic memory changes that reached main after this change was
proposed. Groups 1 to 11 are the request's items One to Eleven, one group each. Groups 12
and 13 hold findings from the closing read, each marked with its id from design.md's findings table. Group 14 is
the integration checks. Every workflow change says whether it needs `patched`. Every new index on an existing table
is two steps (design D15): the by-hand concurrent build in production, then the migration in migration 0119's shape.

## 0. Audit topic memories before the first group (added at apply, 2026-11-19)

Five topic memory changes reached main between November 15 and 18, built fast. This group audits them against their
artifacts and the living spec `topic-memories`, and fixes what a fix can fix. Each finding has a J id in design.md's
"Topic memories audit" table, and each task below is its own commit-ready step.

- [x] 0.1 Audit the five changes for performance, security, correctness, and tests that exercise real behavior.
      Verify: every finding is in design.md's table with its evidence, its severity, and where it went
- [x] 0.2 (J1) Resolve who may rate a topic memory with the edit rule, `toTopicEditRole`, in the feedback write and in
      both `canRate` reads, so a team that only holds a share never rates. Verify: a test that a leader of a share
      team is refused and sees no rating control, and that the owning team's leader still rates
- [x] 0.3 (J3) Count only the feedback of users who may rate now, wherever feedback is read: the correction, the
      prompt notes, the saved mark, and the search's notes. Verify: a test that a former leader's note is in no prompt
- [x] 0.4 (J4) Skip the paid update of a Scan once protected rows fill the Topic's limit, because every new row would
      be evicted in the transaction that adds it. Verify: a test that such a Scan is marked updated with no model call
- [x] 0.5 (J5) Keep a rating note and a memory's text, subject, value, and person on one line at the write and in the
      prompt line, and skip a row that does not fit the block's bytes instead of ending the block. Verify: a test that
      a note with a line break cannot start a second row, and that a long first row leaves the next rows in
- [x] 0.6 (J6) Send a rated memory's thumbs to the propose prompt without its note. Verify: a test that the propose
      prompt holds no note text
- [x] 0.7 (J7) Let a reconcile verdict replace a row's wording only if the row has no rating and the Scan is no older
      than the row's last one. The audit's third condition, that the two claims share a subject, a claim type, and a
      contained value, is not applied: the living spec lets a model-confirmed update name the same fact more fully
      across a classification the model changed, and a smoke case covers that on purpose. Verify: tests for each
- [x] 0.8 (J8) Run every model call of an update through `runModelCall`, so a rate limit or a 5xx waits and tries
      again inside the attempt, and give reconciliation a timeout of its own. The optional premium extraction keeps
      one attempt, because its transient failure is already skipped. A cancelled update ends its wait at once.
      Verify: a test that a 429 followed by a success finishes the attempt with one extra call
- [x] 0.9 (J9) Report an update that fails its last attempt, with the error's name and codes alone, and report a
      child that could not start, as the email, push, and podcast starts are. Verify: tests for both reports
- [x] 0.10 (J10) Read the update slots from `TOPIC_MEMORY_CONCURRENCY`, default 2, and gauge the `topic-memories`
      queue in the worker's minute line with a backlog threshold. Verify: the reader's test and a gauge test
- [x] 0.11 (J11) Keep one running total of an update's spend, stop starting model calls at the update's limit, save
      what was checked, and write the Scan's cost once a stage. The limit is the 12 cents an update already reserves:
      dev's 265 recorded updates cost 1 cent at the median and 8.7 cents at most, so it stops only a runaway update.
      Verify: a test that an update past its limit starts no further call and still commits
- [x] 0.12 (J12) Reconcile a Journal past the byte budget in batches against each batch's nearest rows, in place of
      one premium call a candidate. Verify: a test that 30 candidates over budget make 2 calls
- [x] 0.13 (J13) Pause the backfill after failures in a row and try the same Scan again, so a rate limit does not
      walk every Topic failing. The platform's bill for the backfill is task 9.2a. Verify: a workflow test
- [x] 0.14 (J14) Read a Topic's rejected wording once before the write loop, and insert subjects after it in one
      statement, so the Topic lock is held for tens of statements. Verify: a test that 20 writes send one rejected read
- [x] 0.15 (J15) Keep a memory's newest 30 Finding ids, and archive a version only if its wording or date changed.
      Verify: tests for both
- [x] 0.16 (J16) Count a Topic page's takeaways without reading the rows that can join no group: the count's read
      returns a number for them and only the rows that share a key with another row. No cache is added, because a
      visitor's page is already served from the half-minute page cache and the read is then 36 bytes on most
      Journals. Verify: a query budget test of the Topic page with 100 memories
- [x] 0.17 (J17) Let a failed memory read leave the review with no memory block, and report it. The same read backs
      the podcast script, the Topic Post Discussion script, and the podcast episode plan, so one guarded read covers
      all four. Verify: a test
- [x] 0.18 (J18) Show the caller's own rating and note for a group from the member they rated, read a correction
      from any member of the group in the prompt, and let a thumbs-down with no note reject every member, so the fact
      does not stay under another wording. Verify: a test that a newer duplicate does not hide a saved note, and a
      test that a rejection clears the group
- [x] 0.19 (J19) Check whether a rejection withholds a fact or its wording before changing the guard. It withholds
      the wording on purpose: the living spec says "rejected wording", and a smoke case keeps a paraphrase whose
      sibling wording was rejected. The guard is left as it is, and withholding by subject, claim type, and value is
      the owner's decision, proposed as a queue row. Verify: the design table's J19 row names the evidence
- [x] 0.20 (J20) Try an update again if its owner's key changed during a 401, and wait out the attempt deadline if
      another attempt holds the lease. Verify: tests for both
- [x] 0.21 (J21) Check whether an ingest retry may search again before changing the saved search. It may not, on
      purpose: the living spec `source-ingestion` says a retry issues no additional provider requests and an
      interrupted search is reported on the Source, and a smoke case checks one paid call a Scan. The saved search is
      left as it is, and searching again once after a hard kill is the owner's decision, proposed as a queue row.
      Verify: the design table's J21 row names the evidence
- [x] 0.22 (J22) Small fixes: resolve subjects through one map an update, read an article once an update, leave a
      stopped Scan out of the backfill, and order the reconcile Journal by first Scan time. The fifth, taking an
      update's reservation out of a chat turn's check, is not applied: the reservation is what keeps several updates
      of one owner from passing the month's budget together, and it can reject a chat turn only while the owner has
      under 12 cents left and an update is running. Verify: a test each
- [x] 0.23 (J25) Tests that exercise real behavior: the orchestrator, the grouped and paged read, the membership
      predicate, the route's refusals, the MCP tool, the guards for malformed model output, the idempotent write, a
      failing child, and the heartbeat. Verify: each named gap in the tests audit has a test in the gate, or a reason
      it has none, in the design table's J25 row
- [x] 0.24 (ship review) Widen a matched row's first and last Scans if a later Scan repeats its claim, so the row
      ages from its last sighting and an older Scan's wording cannot replace it. Verify: a test that a repeating Scan
      becomes the row's last Scan with no archived copy and no decision, and that a replay writes nothing
- [x] 0.25 (ship review) Save the match's spend on the Scan row before the write marks the Scan updated. Verify: a
      test that the match's cost is on the Scan row when the completion write starts
- [x] 0.26 (ship review) Start no smaller match after a truncated match reaches the update's spend limit. Verify: a
      test that the halves are left unmatched with one call made
- [x] 0.27 (ship review) Start no smaller claim check after an unreadable check reaches the update's spend limit, and
      end the checked claims at the first batch it cut short, so each verdict keeps its claim's index. Verify: a test
      that a check spending the limit makes one call and approves no claim

## 1. Reap podcast episodes stuck recording (item 1)

- [x] 1.1 Move the recording workflow's timeouts and retry policies from `apps/worker/workflows/recordPodcastEpisode.ts`
      into `packages/pipeline/stageTimeouts.ts`, export `MAX_PODCAST_EPISODE_RECORDING_MS` as a formula over them, and
      add `toPodcastEpisodeWorkflowId(scanId)` used at `runTopicScan.ts:236`. No value and no id string changes, so no
      `patched`. Verify: a unit test pins the sum, and `bun scripts/check-workflow-bundles.ts` passes
- [x] 1.2 Add `restarted_at` to `episodes` and the partial index `episodes (created_at) where status = 'recording'`
      (D15). Verify: `packages/db/schema.test.ts` asserts the column and the index SQL
- [x] 1.3 Add a workflow status read to `packages/pipeline/temporalClient.ts`, in the shape of
      `cancelTopicScanWorkflow`'s describe: running, closed, or not found, and a thrown transport error. Verify: a unit
      test for each of the four results
- [x] 1.4 Add a client start for the recording workflow, for a row whose Scan workflow is gone: same workflow type,
      id, queue, and input as the child start. Verify: a workflow test that a recording started by the client
      reuses its `recording` row, its saved script, and its stored chapters, and finishes with no Scan email workflow
      to signal
- [x] 1.5 Write the reaper module in `apps/worker/` and call it after `reapStaleScans()` in `schedule.ts`: select
      rows at `recording` older than the limit plus the 15-minute margin; ask Temporal; a gone workflow is started
      again once and `restarted_at` set; a row already restarted is failed through `failPodcastEpisode`; a running
      workflow is left and reported; a day past the limit it is terminated and the row failed; a status read that
      throws leaves the row alone. Verify: tests for each branch, for a published row left alone, and for a row with
      no Scan id failed without a restart
- [x] 1.6 Add the status predicate to `publishPodcastEpisode`'s update and roll back if no row changed. Read the
      status in the chapter and image steps and stop for a row that is no longer recording, or not published for the
      image. Verify: a test that a late publish never writes over a failed row, and that a chapter of a failed row
      makes no speech call
- [x] 1.7 Docs: `apps/worker/AGENTS.md` (the sweep's new step, the shared timeouts) and `packages/pipeline/AGENTS.md`.
      Verify: both name `stageTimeouts.ts` as the one copy of the numbers
- [x] 1.8 (ship review) Delete a publish's audio after an update that changed no row only if the row failed or was
      removed, so a publish attempt that overlaps an earlier one never deletes the audio that the earlier one
      published. Verify: a test that a publish whose row an overlapping attempt published deletes nothing

## 2. A queue of their own for scheduled chapters (item 2)

- [x] 2.1 Add `PODCAST_EPISODE_SCHEDULED_CHAPTER_TASK_QUEUE` (`episode-scheduled-chapters`) and a second flex proxy on
      it in `recordPodcastEpisode.ts`, chosen behind `patched("scheduled-chapter-queue")`. Keep the old proxy for
      recordings from before the deploy. Verify: a workflow test with a scheduled trigger runs its chapters on the
      new queue's Worker and its plan, outline, and encode on the old one; the bundle check passes
- [x] 2.2 Add `PODCAST_SCHEDULED_CHAPTER_CONCURRENCY`, default 32, and an activities-only Worker on the queue in
      `apps/worker/temporal.ts`, copied from the scan-closing Worker. Verify: a unit test of the setting's reader
      (unset is 32, 0 is 32)
- [x] 2.3 Let `describeScanQueue` take a queue's name, and add the scheduled chapter queue's backlog and oldest age to
      the worker's minute line, with a threshold crossing well under the six-hour schedule-to-close. Verify:
      `scanQueue.test.ts` covers the named queue, and a test crosses the threshold
- [x] 2.4 Docs: `.env.example`, `apps/docs/development-services.md`, `apps/docs/runtime-architecture.md`,
      `apps/worker/AGENTS.md`. Verify: each names the queue and the setting

## 3. Report a Temporal server the sweep cannot read (item 3, with finding O6)

- [x] 3.1 Report a failed queue read in `reportScanQueue` through `reportError` in the `scheduled-scan` stage, and in
      the worker's minute gauges (group 2's `readGaugedQueue` already reports it there). Verify: `scanQueue.test.ts`
      asserts the report with the queue's name
- [x] 3.2 Stop the sweep's scheduled starts at the first transport failure, as `recoverPersonalSourcesWork` does, and
      skip them if the queue read failed. The relay of rows never dispatched and the Source screens stop the same
      way, through `isTemporalTransportFailure`. Verify: a test with a failing start makes one attempt and one report
- [x] 3.3 Count sweeps in a row with a failed daily count batch in Redis, raised by a sweep with a failed batch and
      deleted by a clean one, and put the count in the existing report. Report a take that finds Redis down and a
      put-back that fails. Verify: `saveDailyCounts.test.ts` covers the count and both reports
- [x] 3.4 (finding O6) Run each stage of `runSweep` in its own try, report a failure, go on to the next stage, and
      flush monitoring in a `finally`. A cron run with a failed stage exits with code 1. Verify: a test where the
      leased stage throws still saves the daily counts and reports the spend
- [x] 3.6 (finding O6) Take a one-hour Redis slot per condition, or per stage and message, before a cron run of the
      sweep sends a warning or a report, and send anyway if Redis cannot say. Verify: a test that two sweep runs
      send one `hourly-signups` warning, and that a Redis failure still sends
- [x] 3.7 Docs: `apps/worker/AGENTS.md` and `apps/docs/deployment.md` (the reports, the failed run, and the slot).
      Verify: both list the new reports

Task 3.5, the sweep's finish time and a `sweep-stale` reading, is dropped: the `scan-sweep` cron monitor already
reports a sweep that stops or dies early (design D13).

## 4. A web service split from the api (item 4, with findings P1 and P3)

- [x] 4.1 Rerun the render measurement before anything changes: the two `oha` commands in A.4 against a public topic
      page through the `app` service's own Northflank hostname, reading each replica's next minute line and its
      replica count. Verify: both p99 readings are recorded in design.md A.4. Never write that hostname in the repo
- [x] 4.2 Read the process name from `PROCESS_NAME`, which the `web` root script sets, in `apps/api/processName.ts`
      for `apps/api/index.ts`, add `"web"` to `runtimeGauges.ts`' names, and fire the event loop warning for `api`
      and `web`. `GET /api/health` names the process that answered. Verify: `runtimeGauges.test.ts` (a `web` stall
      warns, a `worker` stall does not, and a `web` line says `web`) and `webProcess.test.ts`, which evaluates the
      entry a second time under the `web` name and reads its health body
- [x] 4.3 Read the server render's base url from `API_ORIGIN` in `apps/web/src/lib/webApiClient.ts`, defaulting to
      loopback, behind the `window` test the file already had and not through `createIsomorphicFn`: the MCP views'
      bundle is built without the compiler that removes a server side, so it would run the read in the browser.
      Verify: a unit test with and without the setting, and a test that the configuration sets no headers
- [x] 4.4 Add the root scripts `web` and `api` and document them in the README's Development section. Verify:
      `bun run web` boots locally and answers `/api/health`, `/api/health/ready`, and a page
- [x] 4.5 (finding P3) Size a pool by shares in `packages/db/index.ts`: the caller passes its shares (the api, the web
      service, the sweep, the reset, and the film queue group one; the worker's main queue group and the unset queue
      group two), the default count becomes 14, and the comment says what it counts. Verify: `packages/db/index.test.ts`
      pins the default, a one-share and a two-share size at 901 and at 209, and the startup line's text
- [x] 4.6 Add `deploy-web` to `infra/northflank/release-main.json` after `deploy-app` and before `run-edge-purge`, and
      update the workflow's description. Verify: `scripts/releaseWorkflow.test.ts` asserts the step order and each
      deploy step's service
- [x] 4.7 Tests over the fake bundle in `indexTestFixtures.ts`: under the `web` name the entry serves the health
      routes, a page, a document, the docs, and a Specials page, and under the `api` name it still serves every page
      path and `/mcp`. Verify: the tests pass
- [x] 4.8 Docs: the deployment guide gains a service map (service, command, plan, replicas, path routes, health
      checks) and the release order; root `AGENTS.md` module map and the root-script rule; `apps/api/AGENTS.md`;
      `apps/web/AGENTS.md`; `packages/db/AGENTS.md`; `packages/server/AGENTS.md`; the README's process table (it
      says six Workers, the worker hosts 14) and load test paragraph; `.env.example`. Verify: every path the docs
      name exists
- [ ] 4.9 By hand in Northflank and Doppler, in the migration plan's order: create `web` (the build image,
      `bun run web`, the `app-health-checks.json` body, `nf-compute-100-2`, 2 to 4 replicas at 70% cpu); raise
      `DATABASE_POOL_COUNT` and the Neon compute's maximum and restart every process; apply `release-main.json`.
      Verify: each process's startup line prints the expected pool size
- [ ] 4.10 (with finding P1) Add the path routes: to `web` the preview regex with `topic-posts`, and the prefixes for
      podcast covers, favicons, avatars, team avatars, and the stored image routes; to `app` the prefixes `/api`,
      `/mcp`, and the two oauth well-known paths; the base path to `web`; one exact route for `/api/health/ready` to
      `web`, so the uptime monitor watches the service that renders pages. Leave `/api/podcast-feeds` on `app`. Verify:
      a public page's second request is an edge hit, a chat stream and `/api` bypass the cache, a view records its
      place, a forged forwarded header is still counted on both services, and the web log holds no trusted proxies
      warning
- [ ] 4.11 Rerun task 4.1's measurement after the routes, once with `API_ORIGIN` unset and once set in the web
      service's own variables. Verify: both p99 readings and the choice are recorded in design.md A.4

## 5. Correct one stale claim (item 5, with finding W5)

- [x] 5.1 (finding W5) In the review activity, throw on a cancellation whose reason is the worker's shutdown instead
      of returning what it has, so Temporal retries and the review resumes after the pages already scored. Raise
      `REVIEW_ATTEMPTS` to 3. Both are an activity body and an option, so no `patched`. Verify: a test that a
      shutdown cancellation throws, that a person's stop still returns, and that the stale scan limit follows the
      new attempt count
- [x] 5.2 Reword `README.md:216` to say what a restart mid-review does after 5.1, and check no other doc repeats the
      30-minute claim. Verify: a grep for the old sentence finds nothing

## 6. Reap films stuck rendering and Topic Post Discussions stuck recording (item 6, with findings R6 and R7)

- [x] 6.1 Move the film's and the discussion's timeouts into `stageTimeouts.ts` and export each longest run, and the
      topic image render's and the attachment's with them, because their limits are derived the same way. Verify:
      unit tests pin the four sums, and the bundle check passes
- [x] 6.2 Add `restarted_at` to `topic_videos`, `topic_post_discussions`, `topic_image_renders`, and
      the attachments table. Verify: schema tests
- [x] 6.3 Add a client start for the film render workflow under `toTopicVideoWorkflowId`, and an optional
      `isPlatformBilled` and `isRestart` on the workflow's input passed to the activity, where a restarted version 4
      render runs as a retry that reuses what was stored. A new optional input field changes no command. Verify:
      `temporalClient.test.ts`, and a workflow test that the fields reach the activity
- [x] 6.4 Reap a film at `rendering` whose `updated_at` is past its limit, through group 1's module: restart once
      (billed to the platform if the row's cost is zero), then fail with a report. A `ready` row is never read, nor
      a row that kept its stored film for a rebuild, and no film is read while films are off or paused.
      Verify: tests for each branch, and a test that a re-render's ready row is never reaped
- [x] 6.5 Reap a discussion at `recording` past its limit on `coalesce(restarted_at, created_at)`: restart once
      on the same row, then fail through `failTopicPostDiscussion`. Verify: tests for each branch, and that a
      restart writes no second row
- [x] 6.6 (finding R7) Reap a topic image render at `pending` and an attachment at `pending` the same way: one
      restart, then the render row is deleted (so its regeneration is given back) and the attachment marked failed.
      Verify: tests for each
- [x] 6.7 Delete the topic image render row on a failed workflow start in `startTopicImageRender`, as
      `startTopicPostDiscussion` does. Verify: a test copied from `topicPostDiscussions.test.ts:132`
- [x] 6.8 (finding R6) Report a failed discussion. Verify: a test asserts the report
- [x] 6.9 Docs: `apps/worker/AGENTS.md`, `packages/pipeline/AGENTS.md`, `packages/db/AGENTS.md`. Verify: each names
      the five kinds of row the sweep reaps

## 7. Films on a service of their own that scales out (item 7)

- [x] 7.1 Read `WORKER_QUEUE_GROUP` (`films`, `main`, or unset for every Worker) in a module a test can import, and gate
      in `apps/worker/temporal.ts`: which Workers are created, the backfill start, the Personal sources email settings
      check, the extra gauges, the gauge line's queue group, and the pool's shares. Shipped by the animated films
      change, except the pool's shares (task 4.5) and the gauges, built here: `toGaugedQueues` gives each queue group
      its queues, and the line names its `queueGroup`. Verify: unit tests for the queue group's parse and each queue
      group's queue list
- [x] 7.2 Add the root scripts `temporal:films` and `temporal:main`, setting the queue group after `doppler run --`, and
      document them in the README. Shipped by the animated films change. Verify: each boots locally and logs only its
      queue group's Workers
- [x] 7.3 Set every ffmpeg thread count to 2 in `videoEncode.ts`: each input's decoder, the filter graph, and the
      encoder. A thread count changes no pixel and the H.264 headers stay identical, so the stream copy join holds.
      Verify: `videoEncode.test.ts` asserts the arguments, and a shot encoded before and after joins and plays (134
      frames with identical md5s, and 268 frames joined with no decode error)
- [x] 7.4 Bound the lower third's input to the seconds it shows in the shot and let its overlay pass through after
      it ends. Measured: 27% less CPU on a chapter's second shot with identical frames. Verify: the argument test,
      and a frame md5 of one shot before and after
- [x] 7.5 Leave the still at 5120 by 2880 for launch. Changing it means a render version bump and a re-render of every
      film. Verify: the choice is recorded in design.md D6
- [x] 7.5a Replaced by the benchmark in `apps/docs/film-rendering.md`: on Northflank's 4 vCPU and 8 GB a 624-second
      film rendered in 214 seconds, about two cores wide, with 399 MiB of memory and a 252 MiB work folder. Verify: D6
      sizes the slots and the disk from it
- [x] 7.5b (added at apply) Run two renders a replica: the render slots are `TOPIC_VIDEO_CONCURRENCY` of them, a
      render gives its slot back while it waits on a provider, and the slot's deadline starts once the slot is taken.
      Verify: `topicVideoSlot.test.ts` covers two slots, the provider wait, and the wait that costs no render time
- [x] 7.6 Serve the worker's demand gauges at a Prometheus endpoint: for the films queue group the renders its film
      Workers have taken plus the film queue's backlog divided by the queue's pollers, and for the main queue group
      the same for scans. Verify: `workerDemand.test.ts` reads the endpoint's text for each queue group
- [x] 7.7 Add the film service's Release step to `release-main.json` before `deploy-worker`. Shipped by the animated
      films change. Verify: `scripts/releaseWorkflow.test.ts` asserts the order
- [ ] 7.8 By hand in Northflank (the film service already runs `bun run temporal:films` on `nf-compute-400`, and the
      worker already runs `bun run temporal:main`): set `temporal-worker`'s termination grace above two minutes; on
      `temporal-films` set `TOPIC_VIDEO_CONCURRENCY=2`, raise the disk to 4 GB, and scale from 1 to 4 replicas on
      `carlnotes_film_demand` at 2, or on cpu at 70% if custom metrics are not on this plan. Verify: the film service
      polls the film, rebuild, and backfill queues, the worker polls `episode-video-writes`, and a test film renders
- [x] 7.9 Docs: `apps/worker/AGENTS.md`, the deployment guide's service map, capacity table, queue table, and release
      order, the film worker guide, and the README's process table. Verify: each names the queue group setting, both
      scripts, and the film service's queues

## 8. A film queue that reports its backlog and renders the newest first (item 8, with findings R1 and R2)

- [x] 8.1 Gauge the `episode-videos` backlog, its oldest age, and the films left to re-render in the film replica's
      minute line, and report a film queue nothing polls from the sweep. Count the remaining films over every Topic,
      not the current page. A film replica also gauges `episode-video-writes`, which its films wait on. Verify: gauge
      and sweep tests
- [x] 8.2 (finding R1) Give the film workflow a first activity on a short-write queue that writes the `rendering` row,
      behind `patched`, and move the failure mark to the same queue. The main queue group hosts that queue's Worker,
      with no workflow bundle. The row is written for a published podcast episode alone. Verify: a workflow test that
      a queued film has its row before a render slot is free, a replay of a film started before the change, and the
      bundle check
- [x] 8.3 Give rebuilds a queue and a slot of their own on the film queue group. Tasks already scheduled on
      `episode-videos` stay there, so that Worker keeps the rebuild registered. Verify: a test that a rebuild runs while
      a render holds the render slot
- [x] 8.4 Have the backfill wait before each batch of renders while the live film queue has a backlog, behind
      `patched`. Verify: a workflow test that the backfill starts no render until the read finds no new film waiting
- [x] 8.5 Stop a render if its podcast episode was removed: check on the heartbeat timer, abort the render's signal,
      and return a skip. Verify: a test that a removal mid-render ends the render as skipped and uploads nothing
- [x] 8.6 Store each encoded shot under the render version, keyed by a hash of its arguments and each input file's
      content, with a deletion date two days out. A retry lists the prefix once and skips what is stored. Delete the
      shots on success, a final failure, and a removal. A version 4 chapter's scene is encoded through the same step.
      Verify: a test that a second attempt encodes only the shots not stored, that a stored shot that fails to
      download is encoded again, and a run with real ffmpeg and the dev bucket that downloads byte for byte and joins
- [x] 8.7 (finding R2) Report an attempt that a worker shutdown cancelled as its own failure type, and have the
      workflow schedule it again without counting it, behind `patched`, at most 20 times. A heartbeat timeout still
      counts. Lower the heartbeat timeout to 2 minutes. Verify: workflow tests where three shutdown-cancelled attempts
      do not fail the film, a failure before a shutdown still counts, and the twenty-first shutdown fails the film,
      and a replay of a render started before the change
- [x] 8.8 Docs: `apps/worker/AGENTS.md`, `packages/pipeline/AGENTS.md`, `packages/db/AGENTS.md` (the shot keys).
      Verify: each names the queues and the stored shots
- [x] 8.9 (added at apply) Replay the workflows that this change edits on histories recorded from the code before it:
      `apps/worker/workflows/workflowReplays.test.ts` over `apps/worker/workflows/replayHistories/`. Verify: a film
      that rendered, failed, was cancelled, and was still rendering, and a backfill's two pages and a page under way,
      each replay with no determinism error, and a step taken out of its patch fails the replay

- [x] 8.10 (ship review) Give a new film the next free render slot ahead of every backfill render waiting for one.
       Verify: a slot test where a new film waiting after a backfill render starts first

## 9. A backfill whose cost is recorded (item 9, with findings S3 and R8)

- [x] 9.1 Add the `spends` table (a kind, a nullable user, a nullable Topic and podcast episode, a cost, a time) and
      its eighth sum in `loadSpendSince`, with `otherDollars` for the rows that bill a user and `platformDollars` for
      the rows with no user in the recorded spend and the day's gauge line. Verify: `quotas.test.ts` shows a platform
      row in the day's total and in neither the free-plan spend nor a user's month, and the same three sums read
      0.2 and 0.3, 0.2 and 0, and 0.2 and 0 on real Postgres (`probes/spendsCheck.ts` on the disposable database)
- [x] 9.2 Record the platform's render minutes, each generated chapter image, the film's own image, each animation
      plan of a platform-billed render, and the first animated picture of a Free owner's month as platform rows where
      each skips its cost today. Verify: tests that a platform-billed render's minutes, a chapter image, and the film's
      own image are `spends` rows with no user while the film row's cost stays zero
- [x] 9.2a (finding J13) Run the topic memory backfill on the platform's key, and record its model spend as platform
      rows in `spends`, never in an owner's budget, the free-plan spend, or the old Scan's cost. An update after a
      person's own Scan stays billed like the Scan's other steps. Verify: a test that a backfilled Scan's owner is
      neither reserved against nor paused by their cutoff, and that the spend is a `spends` row and not on the Scan
- [x] 9.3 (finding S3) Record a url attachment's fetch, a url Source's screen fetch, and a source suggestion's search
      as the user's rows, check the spent budget before the fetch and the search, and put the routes behind the tool
      caller limiter. A spent budget rejects a url attachment with a 402, fails a url Source with that reason, and
      leaves a suggestion to the Topic's words alone. Verify: tests of the paid call's gate and row, the route's 402,
      the MCP tool's line, the Source's failed check, and the search that a spent budget skips
- [x] 9.4 (finding S3) Keep a text moderation verdict by the text's hash for a day so a paragraph is classified
      once, and record moderation as a platform row, so the day's total and its alert show the cost. No new limit
      on saves. Verify: a test that a repeated save classifies nothing new, and that each call that runs writes a
      platform row
- [x] 9.5 Read the backfill concurrency so that 0 starts no backfill and creates no backfill Worker. Built before this
      change: `isTopicVideoBackfillEnabled` and `readTopicVideoStartup`. Verify: `podcastEpisodeSettings.test.ts` and
      `temporal.test.ts` cover the reader and the boot at 0
- [x] 9.6 Log the backfill's estimated total cost and remaining films at its start and after each batch. The
      estimate is 24 cents a first film and 1.3 cents a film rendered again. Verify: the backfill's workflow test
      asserts both lines
- [x] 9.7 Run each backfill render as a child workflow under `toTopicVideoWorkflowId`, with `patched`
      read once at the top of a run, a rejected duplicate counted as skipped, and the backfill's Worker keeping the
      old activities registered. Verify: a workflow test of the rejected duplicate, and a replay of a backfill
      started before the change
- [x] 9.8 On a cancellation, mark a first render failed in a non-cancellable scope and leave a re-render's ready row
      as it is, with no failed version set, at every render version under the `settle-cancelled-film` patch. Verify:
      a workflow test of the mark at version 3 and version 4, a cancelled backfill whose child settles its row, and a
      row test that a cancelled mark fails a first render and leaves a ready film
- [x] 9.9 (finding R8) List each failed first render once in the backfill, by a row that is `failed` and was never
      restarted, leaving out a row that failed for missing inputs, which stays skipped once. The listing records the
      row as started again. Verify: the listing's test for both
- [x] 9.10 Docs: `apps/worker/AGENTS.md`, `packages/db/AGENTS.md`, `packages/models/AGENTS.md`,
      `packages/pipeline/AGENTS.md`, the README's backfill line, and the cutoffs' wording and the day's spend line in
      the deployment guide, with the first-day cost worked out again for version 4 films. Verify: each says where the
      platform's cost is recorded
- [x] 9.11 (ship review) Report a user's paid call whose spend row cannot be written, and still return the call's
      result. Verify: a test that the failed write is reported and the caller gets the result

## 10. Small worker fixes (item 10, with findings R4 and R5)

- [x] 10.1 Make `timeoutMs` required on `runFfmpeg`, give the audio join 8 minutes and the activity's signal, and give
      the podcast cover's run a timeout. Verify: the type check names no caller without one, and `ffmpeg.test.ts`
- [x] 10.2 (finding R5) Heartbeat the encode and the discussion's recording through the film's heartbeat helper,
      moved to a file both import, and add a heartbeat timeout to both proxies. An option changes no command.
      Verify: activity tests for the heartbeat and the signal
- [x] 10.3 Replace the per-recipient badge count with one grouped `loadUpdateCounts(userIds)` a chunk, and heartbeat
      before the chunk's first read. Compare the old and the new count on seeded rows before deleting the old one.
      Verify: `pushNotify.test.ts`, and a test that the grouped count equals the single count for a team member, a
      person on no team, and a person with a blocked author
- [x] 10.4 Read the day's total through `cacheJson` for five minutes under a key named for the UTC day, never storing
      a failed read. Verify: `dailySpend.test.ts` shows one load across two sweeps
- [x] 10.5 Add an index led by the time column on each of the seven summed tables and on `users` (D15). Verify:
      schema tests, and an `EXPLAIN` of each sum through the app's driver recorded in design.md
- [x] 10.6 Add the partial index `scans (started_at, id) where status = 'running'`, a partial index on pending
      Sources, and write the status literal into each filter so the planner can prove the predicate (D15).
      Verify: an `EXPLAIN` of the waiting read, the reaper's stale Scan read, and the pending Source read recorded in
      design.md
- [x] 10.7 Record a quiet day in `notifications_email_sends` with a column that marks it, in one insert at the end
      of the pass, leave quiet rows out of the next email's start, and move the filter on today into SQL. Verify:
      `notificationsEmails.test.ts` shows a quiet person read once that day and mailed the next day's activity
- [x] 10.8 Store a discussion's speech audio before the encode and look for it first on a retry; record it for
      deletion on publish and on failure. Verify: a test that a retry makes no speech call
- [x] 10.9 Store a generated chapter image under a key that is not the served one before its check, move it on a
      pass, and leave a marker on a rejection so it is never drawn again. Add both keys to the film's key list.
      Verify: a test that a rejected image is drawn once across two renders, and that nothing unchecked is ever at
      the served key
- [x] 10.10 Keep the model's drawn bytes under a key in `renderTopicImageOriginal`, read first on a retry, for the
      topic image, the podcast episode's image, and the film's own image. Delete it once the image is current.
      Verify: a test that a retry after a failed upload draws nothing
- [x] 10.11 (finding R4) Check for the stored chapter before the chapter activity calls speech. Verify: a test that a
      retry after a stored chapter makes no speech call and adds no cost
- [x] 10.12 Docs: `packages/pipeline/AGENTS.md`, `packages/db/AGENTS.md`, `packages/models/AGENTS.md`. Verify: each
      names the changed helper
- [x] 10.13 (ship review) Delete a podcast episode image's files after a write that changed no row or failed only if
      the episode's image is under another hash, because two overlapping draws that read the same kept bytes store
      their files under one hash. A podcast episode with no image yet keeps them for its retry. Verify: tests that a
      draw losing under the same hash deletes nothing, one losing under another hash deletes its own files, and a
      failed write keeps its files
- [x] 10.14 (ship review) Delete a discussion's encoded audio after a publish that changed no row only if the row does
      not play the audio under that key, so a recording attempt that overlaps a published one keeps its MP3. Verify: a
      test that a discussion an overlapping attempt published deletes only its speech
- [x] 10.15 (ship review) Leave a film shot's pending deletion in place if the shot's delete fails, so the sweep tries
      it again. Verify: the shot delete clears no pending row itself, and each accepted delete clears its own

## 11. Stop paying to score the pages the Topic's own limit removed (item 11, with finding W8)

- [x] 11.1 Add the `filtered_findings` table (Topic and Resource as its key, the two hashes, the score, the bonus, a
      time) with its Resource index, in a migration that opens with the lock timeout. Add the noun to the
      `domain-model` skill. Verify: a schema test in the bookmarks pattern
- [x] 11.2 Write the row as the filter deletes a Finding, in one transaction, for each removed Finding that has a
      context hash. Verify: a test through the stubbed pool, and that a retried review writes the same rows
- [x] 11.3 Skip a page whose row still holds, inside the selection's first branch: the same context hash, the same
      content hash, a bonus at least this Scan's, and no rated chapter waiting. A url Source's own page stays
      outside it. Verify: tests that a changed context, changed content, a stronger bonus, a url Source's page, and
      a rated chapter's page each still reach the model, and that a changed topic memory changes no hash and sends
      no page back
- [x] 11.4 Rank the Topic's Findings with the filtered rows of this Scan's rediscovered pages through
      `findingIdsToFilter`, send each filtered row that ranks inside the limit back to the model, and delete a row when
      its page is sent, just before the paid stage. A filtered row ranks as the oldest, so a tie stays with the
      Finding. Verify: tests that an open place takes the best filtered page, a raised limit and a newly exempt Finding
      each open one, a full Topic judges nothing again, and a page judged again that ends with no Finding leaves no
      row
- [x] 11.5 Read the newest succeeded Scan that wrote a recap for the Topic's notes card and the feed card, as
      `apps/api/seo.ts` does for the description (X5). Verify: a test that a Scan with an empty recap does not
      blank the note
- [x] 11.6 (finding W8, close) Compare a page for duplicates only with pages this Topic has judged, its Findings and
      its filtered rows, plus this Scan's own candidates. Verify: a test that a story another Topic stored first is
      still scored for this one
- [x] 11.7 Extend `bun run smoke:review` to scan twice and assert that the second Scan scores none of the pages its
      own limit removed, then that each of four changes sends a filtered page back to the model: an edited prompt, a
      changed content hash, a url Source that names the page, and a rating on a chapter whose Finding is gone.
      Verify: one pass against real rows on a full dev Topic, with each Scan's scored count recorded in design.md
- [x] 11.8 Docs: the Brew diary page under `apps/docs/src/content/docs/feed/` states that a Scan which rediscovers
      only pages it already judged reviews nothing and writes no recap; `packages/pipeline/AGENTS.md`;
      `packages/db/AGENTS.md`; the comments at `review/filter.ts:51-54` and `review.smoke.ts:276-277`. Verify:
      `bun run docs:embed` runs, and the comments match the code

- [x] 11.9 (ship review) Keep a page's reviewed context hash only if Firecrawl reports the page unreadable, by a
      failed status that is no fault on its side or a page with no content, and read the page again after any other
      failed fetch. Treat Firecrawl's 408 as a fault that is tried again. Verify: tests for a 404, a 408, and a timeout

## 12. Findings: capacity and retries in the worker

- [x] 12.1 (finding W2) Start a scheduled Scan's workflow on `topic-scans-scheduled`, chosen by the trigger in the
      client, with a second Worker on the same bundle and activities and the setting `SCHEDULED_SCAN_CONCURRENCY`,
      default 8. A Scan's activities run on its workflow's queue, so the workflow file does not change. Size the
      sweep's dispatch from the scheduled queue's backlog and gauge both queues. Verify: a test that a manual Scan's
      activities never queue behind scheduled ones, and that a Scan started before the deploy finishes on the old
      queue
- [x] 12.2 (finding O2) Measure a worker replica's memory and cpu at 16 and 24 scan slots on real Scans, and set
      `SCAN_CONCURRENCY`'s default from it. Verify: the readings are recorded in design.md
- [ ] 12.3 (finding O2) By hand in Northflank: scale the main worker from 2 to 4 replicas on the scan demand gauge
      from 7.6, or on cpu if custom metrics are not on this plan, and count its maximum in `DATABASE_POOL_COUNT`.
      Verify: a burst of queued Scans in dev adds a replica's worth of pollers
- [x] 12.4 (finding R3) Move the audio encode to `episode-encodes` with slots equal to the replica's cores, behind
      `patched`. Verify: a workflow test, a replay of a podcast episode started before the change, and the bundle
      check
- [x] 12.5 (finding W3) Give the outline and script segment activities a backoff like the chapter's and a
      schedule-to-close of an hour, and a standard chapter a schedule-to-close of an hour in place of five
      attempts. Bring `MAX_PODCAST_EPISODE_RECORDING_MS` in line. Verify: a workflow test where a rate limit of two
      minutes delays a podcast episode and does not fail it
- [x] 12.6 (finding W4) Retry a Firecrawl 429 and 5xx with backoff inside the review's model call deadline, report a
      spent credit once a sweep as a threshold crossing, and write a Finding whose fetch failed without its reviewed
      context hash so the next Scan reads the page. Verify: `review/fetch.test.ts` for each
- [x] 12.7 (finding W6) Read scheduled Topics oldest-due first, a page at a time, until the sweep's dispatch count is
      filled, and read an owner's key budget through `cacheJson` for a minute. Verify: `schedule.test.ts` shows
      limits read only for the Topics a sweep can start, and the order
- [x] 12.8 (finding W7) Return only the url, the credited Source, and the two flags from ingest, with the review and the
      finish accepting both shapes, and limit a stored snippet to 8,000 characters at ingest (dev's p99 is 7,994).
      Topic memories stay out of the payload: an activity loads them. Verify: a test that a payload from a worker
      before the change still completes, and that the widest dev Scan's payload is under 200 KB (the plan said
      100 KB, and dev's urls alone weigh 90 KB for 688 Resources at their mean of 131 characters: design D19)
- [x] 12.9 Docs: `apps/worker/AGENTS.md` (the queues table, 17 Workers), `.env.example`, the README. Verify: each
      queue and setting is named

- [x] 12.10 (ship review) Keep a failed Scan's saved cost and stage costs if they are higher than what its last
      stage returned, so a review that saved its spend and then failed never lowers the Scan's cost. Verify: a test
      of the failed Scan's update

## 13. Findings: the processes

- [x] 13.1 (finding O3) Drain the api on SIGTERM: fail `/api/health/ready`, stop taking requests, let requests in
      flight finish, end event streams so clients reconnect, wait up to a drain limit, then flush monitoring,
      analytics, and telemetry and close the pool. The `web` name runs the same handler. Verify: a subprocess test
      where a request in progress at SIGTERM completes and a stream's client is told to reconnect
- [x] 13.2 (finding O8) Count renders and sheds per minute in the api's and the web service's minute line with a
      `render-shed` threshold crossing, and serve a small static page that retries in 2 to 6 seconds, with the same
      Retry-After, in place of the text line. Verify: `pageGuards.test.ts` covers the count and the page
- [x] 13.3 (finding O1) Send one `error-loop` threshold crossing the first time a stage and message reaches the
      report limit. Verify: a monitoring test
- [x] 13.4 (finding P2) Move the cover modules beside `cardElementPng.ts` in `packages/pipeline`, draw both sizes
      from one PNG in a child process that exits after the draw (the plan said a worker thread replaced every few
      draws, which measured as returning no memory: design D14), store both from the worker's podcast episode image
      step, keep the route's draw as the fallback, and add the chain's length to the minute line. The image step's
      body changes and the workflow does not. Verify: a test that the image step stores both sizes, that a stored
      cover is served with no draw, and a memory reading of 40 draws in the built image recorded in design.md
- [x] 13.5 (found in the `launch-hardening-safety` ship, 2026-11-13) Add the process's resident memory to the
      minute gauge line, and read an `app` replica under load. Two attachment extraction child processes may take
      640 MB each on a 2,048 MB replica beside the api and its 104 MB of large chat bodies, and the limits were
      measured on macOS alone. Lower the api's extraction memory limit or its child process count if the reading
      shows the api does not fit. Verify: a gauge test for the field, and the reading recorded in design.md
- [x] 13.6 Docs: `apps/api/AGENTS.md` (the drain, the shed count, the cover's move), `packages/pipeline/AGENTS.md`,
      root `AGENTS.md` routing table row for the podcast cover. Verify: every path named exists

## 14. Integration checks

- [x] 14.1 `bun run check` is green, the workflow bundle check included
- [x] 14.2 Replay a backfill, a render, and a podcast episode started before the change against the new workflow
      code with `Worker.runReplayHistory`, from histories exported from dev before the deploy: a render whose history
      holds the `topic-video-chapter-scenes-v4` and `settle-cancelled-film` patches, and a Scan whose history holds
      the `topic-memory-update` patch, among them. Verify: each replays with no non-determinism error. Done with
      thirteen histories recorded from main's workflow code on the test server, so no fixture holds dev's data.
      `settle-cancelled-film` is in a film's history and `topic-video-chapter-scenes-v4` in a recording's, which is
      where main's code records each
- [x] 14.3 One pass of the podcast episode smoke and the MCP smoke with its Dashboard sections. Verify: both pass
- [x] 14.4 A burst of 20 new podcast episodes in dev with the backfill running. Verify: each new film's row is
      written at once and each new film starts before any queued re-render, with the order recorded in design.md
- [x] 14.5 One film rendered after the change compared by eye with a version 3 film. Verify: the two are recorded
      as the same, or the difference named
- [x] 14.6 Kill the dev worker mid-render and mid-review. Verify: the render resumes from its stored shots without
      spending an attempt, and the review resumes after the pages already scored
- [x] 14.7 Stop dev's Temporal with a podcast episode recording, a film rendering, and a discussion recording, then
      start it empty. Verify: each row is started again once by the sweep and finishes

## Workflow follow-up

- Ship through `/ship`, which archives the change with `openspec archive launch-hardening --yes`.
- Before the push: build each new index by hand in production (D15), because the push starts a release and the
  release runs the migration. Record any migration applied by hand in dev in dev's migration table.
