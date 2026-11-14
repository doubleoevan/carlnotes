# Tasks

Part A of the launch hardening work. Groups 1 to 11 are the request's items One to Eleven, one group each. Groups 12
and 13 hold findings from the closing read, each marked with its id from design.md's findings table. Group 14 is
the integration checks. Every workflow change says whether it needs `patched`. Every new index on an existing table
is two steps (design D15): the by-hand concurrent build in production, then the migration in migration 0119's shape.

## 1. Close out podcast episodes stuck recording (item 1)

- [ ] 1.1 Move the recording workflow's timeouts and retry policies from `apps/worker/workflows/recordPodcastEpisode.ts`
      into `packages/pipeline/stageTimeouts.ts`, export `MAX_PODCAST_EPISODE_RECORDING_MS` as a formula over them, and
      add `toPodcastEpisodeWorkflowId(scanId)` used at `runTopicScan.ts:236`. No value and no id string changes, so no
      `patched`. Verify: a unit test pins the sum, and `bun scripts/check-workflow-bundles.ts` passes
- [ ] 1.2 Add `restarted_at` to `episodes` and the partial index `episodes (created_at) where status = 'recording'`
      (D15). Verify: `packages/db/schema.test.ts` asserts the column and the index SQL
- [ ] 1.3 Add a workflow status read to `packages/pipeline/temporalClient.ts`, in the shape of
      `cancelTopicScanWorkflow`'s describe: running, closed, or not found, and a thrown transport error. Verify: a unit
      test for each of the four results
- [ ] 1.4 Add a client start for the recording workflow, for a row whose Scan workflow is gone: same workflow type,
      id, queue, and input as the child start. Verify: a workflow test that a recording started by the client
      reuses its `recording` row, its saved script, and its stored chapters, and finishes with no Scan email workflow
      to signal
- [ ] 1.5 Write the close-out module in `apps/worker/` and call it after `failStaleScans()` in `schedule.ts`: select
      rows at `recording` older than the limit plus the 15-minute margin; ask Temporal; a gone workflow is started
      again once and `restarted_at` set; a row already restarted is failed through `failPodcastEpisode`; a running
      workflow is left and reported; a day past the limit it is terminated and the row failed; a status read that
      throws leaves the row alone. Verify: tests for each branch, for a published row left alone, and for a row with
      no Scan id failed without a restart
- [ ] 1.6 Add the status predicate to `publishPodcastEpisode`'s update and roll back if no row changed. Read the
      status in the chapter and image steps and stop for a row that is no longer recording, or not published for the
      image. Verify: a test that a late publish never writes over a failed row, and that a chapter of a failed row
      makes no speech call
- [ ] 1.7 Docs: `apps/worker/AGENTS.md` (the sweep's new step, the shared timeouts) and `packages/pipeline/AGENTS.md`.
      Verify: both name `stageTimeouts.ts` as the one copy of the numbers

## 2. A queue of their own for scheduled chapters (item 2)

- [ ] 2.1 Add `PODCAST_EPISODE_SCHEDULED_CHAPTER_TASK_QUEUE` (`episode-scheduled-chapters`) and a second flex proxy on
      it in `recordPodcastEpisode.ts`, chosen behind `patched("scheduled-chapter-queue")`. Keep the old proxy for
      recordings from before the deploy. Verify: a workflow test with a scheduled trigger runs its chapters on the
      new queue's Worker and its plan, outline, and encode on the old one; the bundle check passes
- [ ] 2.2 Add `PODCAST_SCHEDULED_CHAPTER_CONCURRENCY`, default 32, and an activities-only Worker on the queue in
      `apps/worker/temporal.ts`, copied from the scan-closing Worker. Verify: a unit test of the setting's reader
      (unset is 32, 0 is 32)
- [ ] 2.3 Let `describeScanQueue` take a queue's name, and add the scheduled chapter queue's backlog and oldest age to
      the worker's minute line, with a threshold crossing well under the six-hour schedule-to-close. Verify:
      `scanQueue.test.ts` covers the named queue, and a test crosses the threshold
- [ ] 2.4 Docs: `.env.example`, `apps/docs/development-services.md`, `apps/docs/runtime-architecture.md`,
      `apps/worker/AGENTS.md`. Verify: each names the queue and the setting

## 3. Report a Temporal server the sweep cannot read (item 3, with finding O6)

- [ ] 3.1 Report a failed queue read in `reportScanQueue` through `reportError` in the `scheduled-scan` stage, and in
      the worker's minute gauges. Verify: `scanQueue.test.ts` asserts the report with the queue's name
- [ ] 3.2 Stop the sweep's scheduled starts at the first transport failure, as `recoverPersonalSourcesWork` does, and
      skip them if the queue read failed. Verify: a test with a failing start makes one attempt and one report
- [ ] 3.3 Count sweeps in a row with a failed daily count batch in Redis, raised by a sweep with a failed batch and
      deleted by a clean one, and put the count in the existing report. Report a take that finds Redis down and a
      put-back that fails. Verify: `saveDailyCounts.test.ts` covers the count and both reports
- [ ] 3.4 (finding O6) Run each stage of `runSweep` in its own try, report a failure, go on to the next stage, and
      flush monitoring in a `finally`. Verify: a test where the leased stage throws still saves the daily counts and
      reports the spend
- [ ] 3.5 (finding O6) Save the sweep's finish time to Redis, and have the worker's minute line cross a `sweep-stale`
      threshold past forty minutes (production's sweep runs every 15 minutes for at most 10). Verify: a gauge test
      with an old and a fresh finish time
- [ ] 3.6 (finding O6) Take a one-hour Redis slot per condition before the sweep sends a warning or a report, and
      send anyway if Redis cannot say. Verify: a test that two sweep runs send one `hourly-signups` warning, and
      that a Redis failure still sends
- [ ] 3.7 Docs: `apps/worker/AGENTS.md` and `apps/docs/deployment.md` (the reports and the `sweep-stale` reading).
      Verify: both list the new reports

## 4. A web service split from the api (item 4, with findings P1 and P3)

- [ ] 4.1 Rerun the render measurement before anything changes: the two `oha` commands in A.4 against a public topic
      page through the `app` service's own Northflank hostname, reading each replica's next minute line and its
      replica count. Verify: both p99 readings are recorded in design.md A.4. Never write that hostname in the repo
- [ ] 4.2 Read the process name from a setting the `web` root script sets, in `apps/api/index.ts`, add `"web"` to
      `runtimeGauges.ts`' names, and fire the event loop warning for `api` and `web`. Verify:
      `runtimeGauges.test.ts` (a `web` stall warns, a `worker` stall does not) and a boot test whose gauge line says
      `web`
- [ ] 4.3 Read the server render's base url from `API_ORIGIN` in `apps/web/src/lib/webApiClient.ts` through
      `createIsomorphicFn`, defaulting to loopback. Verify: a unit test with and without the setting, and a test that
      the server configuration sets no headers
- [ ] 4.4 Add the root scripts `web` and `api` and document them in the README's Development section. Verify:
      `bun run web` boots locally and answers `/api/health`, `/api/health/ready`, and a page
- [ ] 4.5 (finding P3) Size a pool by shares in `packages/db/index.ts`: the caller passes its shares (the api, the web
      service, the sweep, the reset, and the film role one; the worker's main role and the unset role two), the
      default count becomes 14, and the comment says what it counts. Verify: `packages/db/index.test.ts` pins the
      default, a one-share and a two-share size at 901 and at 209, and the startup line's text
- [ ] 4.6 Add `deploy-web` to `infra/northflank/release-main.json` after `deploy-app` and before `run-edge-purge`, and
      update the workflow's description. Verify: the file parses and its step order is asserted by a test or by
      `jq`
- [ ] 4.7 Tests over the fake bundle in `indexTestFixtures.ts`: under the `web` name the entry serves the health
      routes, a page, a document, the docs, and a Specials page, and under the `api` name it still serves every page
      path and `/mcp`. Verify: the tests pass
- [ ] 4.8 Docs: the deployment guide gains a service map (service, command, plan, replicas, path routes, health
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

- [ ] 5.1 (finding W5) In the review activity, throw on a cancellation whose reason is the worker's shutdown instead
      of returning what it has, so Temporal retries and the review resumes after the pages already scored. Raise
      `REVIEW_ATTEMPTS` to 3. Both are an activity body and an option, so no `patched`. Verify: a test that a
      shutdown cancellation throws, that a person's stop still returns, and that the stale scan limit follows the
      new attempt count
- [ ] 5.2 Reword `README.md:216` to say what a restart mid-review does after 5.1, and check no other doc repeats the
      30-minute claim. Verify: a grep for the old sentence finds nothing

## 6. Close out films stuck rendering and Topic Post Discussions stuck recording (item 6, with findings R6 and R7)

- [ ] 6.1 Move the film's and the discussion's timeouts into `stageTimeouts.ts` and export each longest run. Verify:
      unit tests pin both sums, and the bundle check passes
- [ ] 6.2 Add `restarted_at` to `topic_podcast_episode_videos`, `topic_post_discussions`, `topic_image_renders`, and
      the attachments table. Verify: schema tests
- [ ] 6.3 Add a client start for the film render workflow under `toTopicPodcastEpisodeVideoWorkflowId`, and an optional
      `isPlatformBilled` on the workflow's input passed to the activity. A new optional input field changes no
      command. Verify: `temporalClient.test.ts`, and a workflow test that the flag reaches the activity
- [ ] 6.4 Close out a film at `rendering` whose `updated_at` is past its limit, through group 1's module: restart once
      (billed to the platform if the row's cost is zero), then fail with a report. A `ready` row is never read.
      Verify: tests for each branch, and a test that a re-render's ready row is never closed out
- [ ] 6.5 Close out a discussion at `recording` past its limit on `coalesce(restarted_at, created_at)`: restart once
      on the same row, then fail through `failTopicPostDiscussion`. Verify: tests for each branch, and that a
      restart writes no second row
- [ ] 6.6 (finding R7) Close out a topic image render at `pending` and an attachment at `pending` the same way: one
      restart, then the render row is deleted (so its regeneration is given back) and the attachment marked failed.
      Verify: tests for each
- [ ] 6.7 Delete the topic image render row on a failed workflow start in `startTopicImageRender`, as
      `startTopicPostDiscussion` does. Verify: a test copied from `topicPostDiscussions.test.ts:132`
- [ ] 6.8 (finding R6) Report a failed discussion. Verify: a test asserts the report
- [ ] 6.9 Docs: `apps/worker/AGENTS.md`, `packages/pipeline/AGENTS.md`, `packages/db/AGENTS.md`. Verify: each names
      the five kinds of row the sweep closes out

## 7. Films on a service of their own that scales out (item 7)

- [ ] 7.1 Read `WORKER_ROLE` (`films`, `main`, or unset for every Worker) in a module a test can import, and gate in
      `apps/worker/temporal.ts`: which Workers are created, the backfill start, the Personal sources email settings
      check, the extra gauges, the gauge line's process name, and the pool's shares. Verify: unit tests for the
      role's parse and each role's queue list
- [ ] 7.2 Add the root scripts `temporal:films` and `temporal:main`, setting the role after `doppler run --`, and
      document them in the README. Verify: each boots locally and logs only its role's Workers
- [ ] 7.3 Set every ffmpeg thread count to 2 in `videoEncode.ts`: each input's decoder, the filter graph, and the
      encoder. A thread count changes no pixel and the H.264 headers stay identical, so the stream copy join holds.
      Do this first: it also bounds the shared worker's memory before the film service exists. Verify:
      `videoEncode.test.ts` asserts the arguments, and one film rendered before and after joins and plays
- [ ] 7.4 Bound the lower third's input to the seconds it shows in the shot and let its overlay pass through after
      it ends. Measured: 27% less CPU on a chapter's second shot with identical frames. Verify: the argument test,
      and a frame md5 of one shot before and after
- [ ] 7.5 Leave the still at 5120 by 2880 for launch, and judge the 2560 still enlarged inside ffmpeg by eye from the
      clips in `logs/launch-hardening/research/film/`. Changing it means a render version bump and a re-render of every
      film. Verify: the choice is recorded in design.md
- [ ] 7.5a Measure one render in the built Linux image on a 2 vCPU, 4 GB container: the worker's and ffmpeg's peak
      memory together, the temp folder's peak bytes and whether it is on disk or in memory, and the render's seconds
      over the film's length. Verify: the readings are recorded in design.md A.8 beside the laptop's, and the film
      service's memory and disk are set from them
- [ ] 7.6 Serve the worker's demand gauges at a Prometheus endpoint: for the films role its running renders plus the
      film queue's backlog divided by the queue's pollers, and for the main role the same for scans. Verify: a
      test reads the endpoint's text for each role
- [ ] 7.7 Add the film service's Release step to `release-main.json` beside `deploy-worker`. Verify: as 4.6
- [ ] 7.8 By hand in Northflank: set the worker's and the film service's termination grace above two minutes; create the
      film service (`bun run temporal:films`, `nf-compute-200`, the disk from 7.5a, 1 to 4 replicas on the film demand
      gauge, or cpu at 70% if custom metrics are not on this plan); then switch the worker's command to `bun run
      temporal:main`. Verify: the film service polls both film queues before the worker stops, and a test film renders
      on it
- [ ] 7.9 Docs: `apps/worker/AGENTS.md`, the deployment guide's service map and release order, the README's process
      table. Verify: each names the role setting and both scripts

## 8. A film queue that reports its backlog and renders the newest first (item 8, with findings R1 and R2)

- [ ] 8.1 Gauge the `episode-videos` backlog, its oldest age, and the films left to re-render in the worker's minute
      line, and report a film queue nothing polls from the sweep. Count the remaining films over every Topic, not
      the current page. Verify: gauge and sweep tests
- [ ] 8.2 (finding R1) Give the film workflow a first activity on a short-write queue that writes the `rendering`
      row, behind `patched`, and move the failure mark to the same queue. The main role hosts that queue's Worker,
      with no workflow bundle. Verify: a workflow test that a queued film has its row before a render slot is
      free, a replay of a film started before the change, and the bundle check
- [ ] 8.3 Give rebuilds a queue and a slot of their own on the film role. Tasks already scheduled on `episode-videos`
      stay there, so that Worker keeps the rebuild registered. Verify: a test that a rebuild runs while a render
      holds the render slot
- [ ] 8.4 Have the backfill wait before each render while the live film queue has a backlog. Verify: a workflow test
      that a new podcast episode's film runs ahead of a queued backfill render
- [ ] 8.5 Stop a render between shots if its podcast episode was removed: check on the heartbeat timer, abort the
      render's signal, and return a skip. Verify: a test that a removal mid-render ends the activity as skipped and
      uploads nothing
- [ ] 8.6 Store each encoded shot under the render version, keyed by a hash of its arguments and each still's
      content, with a deletion date past the render's last attempt. A retry lists the prefix once and skips what
      is stored. Delete the shots on success, a final failure, and a removal. Verify: a test that a second attempt
      encodes only the shots not stored, and that a stored shot that fails to download is encoded again
- [ ] 8.7 (finding R2) Report an attempt that a worker shutdown cancelled as its own failure type, and have the
      workflow schedule it again without counting it, behind `patched`. A heartbeat timeout still counts. Lower the
      heartbeat timeout to 2 minutes. Verify: a workflow test where three shutdown-cancelled attempts do not fail
      the film, and a replay of a render started before the change
- [ ] 8.8 Docs: `apps/worker/AGENTS.md`, `packages/pipeline/AGENTS.md`, `packages/db/AGENTS.md` (the shot keys).
      Verify: each names the queues and the stored shots

## 9. A backfill whose cost is recorded (item 9, with findings S3 and R8)

- [ ] 9.1 Add the `spends` table (a kind, a nullable user, a nullable Topic and podcast episode, a cost, a time) and
      its eighth sum in `loadSpendSince`, with `platformDollars` in the recorded spend and the day's gauge line.
      Verify: `quotas.test.ts` shows a platform row in the day's total and in neither the free-plan spend nor a
      user's month
- [ ] 9.2 Record the platform's render minutes, each generated chapter image, and the film's own image as platform
      rows where each skips its cost today. Verify: a test that a platform-billed render's cost reaches the day's
      total and the film row's cost stays zero
- [ ] 9.3 (finding S3) Record a url attachment's fetch, a url Source's screen fetch, and a source suggestion's search
      as the user's rows, check the spent budget before the fetch and the search, and put the three routes behind
      the tool caller limiter. Verify: route tests for the spend row, the budget rejection, and the limiter
- [ ] 9.4 (finding S3) Keep a text moderation verdict by the text's hash for a day so a paragraph is classified
      once, and record moderation as a platform row, so the day's total and its alert show the cost. No new limit
      on saves. Verify: a test that a repeated save classifies nothing new, and that the cost reaches the day's
      total
- [ ] 9.5 Read the backfill concurrency so that 0 starts no backfill and creates no backfill Worker. Verify: a unit
      test of the reader, and a boot test at 0
- [ ] 9.6 Log the backfill's estimated total cost and remaining films at its start and after each batch. Verify:
      the backfill's workflow test asserts both lines
- [ ] 9.7 Run each backfill render as a child workflow under `toTopicPodcastEpisodeVideoWorkflowId`, with `patched`
      read once at the top of a run, a rejected duplicate counted as skipped, and the backfill's Worker keeping the
      old activities registered. Verify: a workflow test of the rejected duplicate, and a replay of a backfill
      started before the change
- [ ] 9.8 On a cancellation, mark a first render failed in a non-cancellable scope and leave a re-render's ready row
      as it is, with no failed version set. Verify: a workflow test for each
- [ ] 9.9 (finding R8) List each failed first render once in the backfill, by a row that is `failed` and was never
      restarted, leaving out a row that failed for missing inputs, which stays skipped once. Verify: the listing's
      test for both
- [ ] 9.10 Docs: `apps/worker/AGENTS.md`, `packages/db/AGENTS.md`, the README's backfill line, and the
      `monthly-budget-cutoffs` and `daily-spend-cutoffs` wording in the deployment guide. Verify: each says where
      the platform's cost is recorded

## 10. Small worker fixes (item 10, with findings R4 and R5)

- [ ] 10.1 Make `timeoutMs` required on `runFfmpeg`, give the audio join 8 minutes and the activity's signal, and give
      the podcast cover's run a timeout. Verify: the type check names no caller without one, and `ffmpeg.test.ts`
- [ ] 10.2 (finding R5) Heartbeat the encode and the discussion's recording through the film's heartbeat helper,
      moved to a file both import, and add a heartbeat timeout to both proxies. An option changes no command.
      Verify: activity tests for the heartbeat and the signal
- [ ] 10.3 Replace the per-recipient badge count with one grouped `loadUpdateCounts(userIds)` a chunk, and heartbeat
      before the chunk's first read. Compare the old and the new count on seeded rows before deleting the old one.
      Verify: `pushNotify.test.ts`, and a test that the grouped count equals the single count for a team member, a
      person on no team, and a person with a blocked author
- [ ] 10.4 Read the day's total through `cacheJson` for five minutes under a key named for the UTC day, never storing
      a failed read. Verify: `dailySpend.test.ts` shows one load across two sweeps
- [ ] 10.5 Add an index led by the time column on each of the seven summed tables and on `users` (D15). Verify:
      schema tests, and an `EXPLAIN` of each sum through the app's driver recorded in design.md
- [ ] 10.6 Add the partial index `scans (started_at, id) where status = 'running'`, a partial index on pending
      Sources, and write the status literal into each filter so the planner can prove the predicate (D15).
      Verify: an `EXPLAIN` of the waiting read, the stale close-out, and the pending Source read recorded in
      design.md
- [ ] 10.7 Record a quiet day in `notifications_email_sends` with a column that marks it, in one insert at the end
      of the pass, leave quiet rows out of the next email's start, and move the filter on today into SQL. Verify:
      `notificationsEmails.test.ts` shows a quiet person read once that day and mailed the next day's activity
- [ ] 10.8 Store a discussion's speech audio before the encode and look for it first on a retry; record it for
      deletion on publish and on failure. Verify: a test that a retry makes no speech call
- [ ] 10.9 Store a generated chapter image under a key that is not the served one before its check, move it on a
      pass, and leave a marker on a rejection so it is never drawn again. Add both keys to the film's key list.
      Verify: a test that a rejected image is drawn once across two renders, and that nothing unchecked is ever at
      the served key
- [ ] 10.10 Keep the model's drawn bytes under a key in `renderTopicImageOriginal`, read first on a retry, for the
      topic image, the podcast episode's image, and the film's own image. Delete it once the image is current.
      Verify: a test that a retry after a failed upload draws nothing
- [ ] 10.11 (finding R4) Check for the stored chapter before the chapter activity calls speech. Verify: a test that a
      retry after a stored chapter makes no speech call and adds no cost
- [ ] 10.12 Docs: `packages/pipeline/AGENTS.md`, `packages/db/AGENTS.md`, `packages/models/AGENTS.md`. Verify: each
      names the changed helper

## 11. Stop paying to score the pages the Topic's own limit removed (item 11, with finding W8)

- [ ] 11.1 Add the `filtered_findings` table (Topic and Resource as its key, the two hashes, the score, the bonus, a
      time) with its Resource index, in a migration that opens with the lock timeout. Add the noun to the
      `domain-model` skill. Verify: a schema test in the bookmarks pattern
- [ ] 11.2 Write the row as the filter deletes a Finding, in one transaction, for each removed Finding that has a
      context hash. Verify: a test through the stubbed pool, and that a retried review writes the same rows
- [ ] 11.3 Skip a page whose row still holds, inside the selection's first branch: the same context hash, the same
      content hash, a bonus at least this Scan's, and no rated chapter waiting. A url Source's own page stays
      outside it. Verify: tests that a changed context, changed content, a stronger bonus, a url Source's page, and
      a rated chapter's page each still reach the model
- [ ] 11.4 Rank the Topic's Findings with the held rows of this Scan's rediscovered pages through
      `findingIdsToFilter`, send each held row that ranks inside the limit back to the model, and delete a row when
      its page is sent, just before the paid stage. A held row ranks as the oldest, so a tie stays with the
      Finding. Verify: tests that an open place takes the best held page, a raised limit and a newly exempt Finding
      each open one, a full Topic judges nothing again, and a page judged again that ends with no Finding leaves no
      row
- [ ] 11.5 Read the newest succeeded Scan that wrote a recap for the Topic's notes card and the feed card, as
      `apps/api/seo.ts` does for the description (X5). Verify: a test that a Scan with an empty recap does not
      blank the note
- [ ] 11.6 (finding W8, close) Compare a page for duplicates only with pages this Topic has judged, its Findings and
      its filtered rows, plus this Scan's own candidates. Verify: a test that a story another Topic stored first is
      still scored for this one
- [ ] 11.7 Extend `bun run smoke:review` to scan twice and assert that the second Scan scores none of the pages its
      own limit removed, then that each of four changes sends a held page back to the model: an edited prompt, a
      changed content hash, a url Source that names the page, and a rating on a chapter whose Finding is gone.
      Verify: one pass against real rows on a full dev Topic, with each Scan's scored count recorded in design.md
- [ ] 11.8 Docs: the Brew diary page under `apps/docs/src/content/docs/feed/` states that a Scan which rediscovers
      only pages it already judged reviews nothing and writes no recap; `packages/pipeline/AGENTS.md`;
      `packages/db/AGENTS.md`; the comments at `review/filter.ts:51-54` and `review.smoke.ts:276-277`. Verify:
      `bun run docs:embed` runs, and the comments match the code

## 12. Findings: capacity and retries in the worker

- [ ] 12.1 (finding W2) Start a scheduled Scan's workflow on `topic-scans-scheduled`, chosen by the trigger in the
      client, with a second Worker on the same bundle and activities and the setting `SCHEDULED_SCAN_CONCURRENCY`,
      default 8. A Scan's activities run on its workflow's queue, so the workflow file does not change. Size the
      sweep's dispatch from the scheduled queue's backlog and gauge both queues. Verify: a test that a manual Scan's
      activities never queue behind scheduled ones, and that a Scan started before the deploy finishes on the old
      queue
- [ ] 12.2 (finding O2) Measure a worker replica's memory and cpu at 16 and 24 scan slots on real Scans, and set
      `SCAN_CONCURRENCY`'s default from it. Verify: the readings are recorded in design.md
- [ ] 12.3 (finding O2) By hand in Northflank: scale the main worker from 2 to 4 replicas on the scan demand gauge
      from 7.6, or on cpu if custom metrics are not on this plan, and count its maximum in `DATABASE_POOL_COUNT`.
      Verify: a burst of queued Scans in dev adds a replica's worth of pollers
- [ ] 12.4 (finding R3) Move the audio encode to `episode-encodes` with slots equal to the replica's cores, behind
      `patched`. Verify: a workflow test, a replay of a podcast episode started before the change, and the bundle
      check
- [ ] 12.5 (finding W3) Give the outline and script segment activities a backoff like the chapter's and a
      schedule-to-close of an hour, and a standard chapter a schedule-to-close of an hour in place of five
      attempts. Bring `MAX_PODCAST_EPISODE_RECORDING_MS` in line. Verify: a workflow test where a rate limit of two
      minutes delays a podcast episode and does not fail it
- [ ] 12.6 (finding W4) Retry a Firecrawl 429 and 5xx with backoff inside the review's model call deadline, report a
      spent credit once a sweep as a threshold crossing, and write a Finding whose fetch failed without its reviewed
      context hash so the next Scan reads the page. Verify: `review/fetch.test.ts` for each
- [ ] 12.7 (finding W6) Read scheduled Topics oldest-due first, a page at a time, until the sweep's dispatch count is
      filled, and read an owner's key budget through `cacheJson` for a minute. Verify: `schedule.test.ts` shows
      limits read only for the Topics a sweep can start, and the order
- [ ] 12.8 (finding W7) Return only the url, the credited Source, and the two flags from ingest, with the review and the
      finish accepting both shapes, and limit a stored snippet to 8,000 characters at ingest (dev's p99 is 7,994).
      Verify: a test that a payload from a worker before the change still completes, and that the widest dev Scan's
      payload is under 100 KB
- [ ] 12.9 Docs: `apps/worker/AGENTS.md` (the queues table, 17 Workers), `.env.example`, the README. Verify: each
      queue and setting is named

## 13. Findings: the processes

- [ ] 13.1 (finding O3) Drain the api on SIGTERM: fail `/api/health/ready`, stop taking requests, let requests in
      flight finish, end event streams so clients reconnect, wait up to a drain limit, then flush monitoring,
      analytics, and telemetry and close the pool. The `web` name runs the same handler. Verify: a subprocess test
      where a request in progress at SIGTERM completes and a stream's client is told to reconnect
- [ ] 13.2 (finding O8) Count renders and sheds per minute in the api's and the web service's minute line with a
      `render-shed` threshold crossing, and serve a small static page that retries in two seconds in place of the
      text line. Verify: `pageGuards.test.ts` covers the count and the page
- [ ] 13.3 (finding O1) Send one `error-loop` threshold crossing the first time a stage and message reaches the
      report limit. Verify: a monitoring test
- [ ] 13.4 (finding P2) Move the cover modules beside `cardElementPng.ts` in `packages/pipeline`, draw both sizes
      from one PNG in a worker thread replaced every few draws, store both from the worker's podcast episode image
      step, keep the route's draw as the fallback, and add the chain's length to the minute line. The image step's
      body changes and the workflow does not. Verify: a test that the image step stores both sizes, that a stored
      cover is served with no draw, and a memory reading of 40 draws in the built image recorded in design.md
- [ ] 13.5 (found in the `launch-hardening-safety` ship, 2026-11-13) Add the process's resident memory to the
      minute gauge line, and read an `app` replica under load. Two attachment extraction child processes may take
      640 MB each on a 2,048 MB replica beside the api and its 104 MB of large chat bodies, and the limits were
      measured on macOS alone. Lower the api's extraction memory limit or its child process count if the reading
      shows the api does not fit. Verify: a gauge test for the field, and the reading recorded in design.md
- [ ] 13.6 Docs: `apps/api/AGENTS.md` (the drain, the shed count, the cover's move), `packages/pipeline/AGENTS.md`,
      root `AGENTS.md` routing table row for the podcast cover. Verify: every path named exists

## 14. Integration checks

- [ ] 14.1 `bun run check` is green, the workflow bundle check included
- [ ] 14.2 Replay a backfill, a render, and a podcast episode started before the change against the new workflow
      code with `Worker.runReplayHistory`, from histories exported from dev before the deploy. Verify: each
      replays with no non-determinism error
- [ ] 14.3 One pass of the podcast episode smoke and the MCP smoke with its Dashboard sections. Verify: both pass
- [ ] 14.4 A burst of 20 new podcast episodes in dev with the backfill running. Verify: each new film's row is
      written at once and each new film starts before any queued re-render, with the order recorded in design.md
- [ ] 14.5 One film rendered after the change compared by eye with a version 3 film. Verify: the two are recorded
      as the same, or the difference named
- [ ] 14.6 Kill the dev worker mid-render and mid-review. Verify: the render resumes from its stored shots without
      spending an attempt, and the review resumes after the pages already scored
- [ ] 14.7 Stop dev's Temporal with a podcast episode recording, a film rendering, and a discussion recording, then
      start it empty. Verify: each row is started again once by the sweep and finishes

## Workflow follow-up

- Ship through `/ship`, which archives the change with `openspec archive launch-hardening --yes`.
- Before the push: build each new index by hand in production (D15), because the push starts a release and the
  release runs the migration. Record any migration applied by hand in dev in dev's migration table.
