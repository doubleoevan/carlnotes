# Proposal

## Why

A launch traffic wave would find rows that stay in progress for good, a person's Scan and film waiting behind the
platform's own scheduled and backfill work, and page renders on the event loop that holds every chat stream. Dev
holds 13 films stuck at rendering today, scan capacity is fixed at about 290 first Scans an hour, and a full Topic
pays to score pages it already judged on 85% of what a later Scan scores. This is Part A of the last work before
launch: the worker, the sweep, and the web service. Parts B, C, and D are the changes
`launch-hardening-page-reads`, `launch-hardening-browser-load`, and `launch-hardening-safety`.

## What Changes

- **Close-outs.** The sweep closes out a podcast episode stuck recording, a film stuck rendering, a Topic Post
  Discussion stuck recording, a pending topic image render, and a pending attachment. Each limit is derived from
  its workflow's own timeouts in one shared module. Past its limit a row whose workflow is gone is started again
  once, then failed.
- **Queues of their own.** A scheduled Scan's chapters, scheduled Scans themselves, the audio encode, a film's
  failure mark, and a film rebuild each get a queue, so a person's work never waits behind the platform's.
- **A web service.** The unapplied `split-web-from-api` change is folded in and deleted. A `web` service from the
  same image takes pages, documents, feeds, docs, the Specials pages, and public files through Northflank path
  routing, while the `app` service keeps serving every path. The api drains on a deploy.
- **A film service that scales.** The film Workers run as a service of their own through a role setting, sized from
  a measurement and scaled on the film backlog. A render stores each encoded shot, resumes on a retry, stops if its
  podcast episode is removed, and does not count an attempt a deploy interrupted.
- **A backfill whose cost is recorded.** The platform's render and image cost, and four paid calls that record
  nothing today, land in one spends table that the day's total reads and the free-plan cutoffs do not. A new film
  always goes ahead of a backfill re-render, and a duplicate render is rejected.
- **A review that scores a page once.** A Finding the Topic's limit removed leaves a row, and the next Scan skips
  its page while that row still holds, with every rule that must still reach the model kept.
- **Capacity for Scans.** The main worker scales on the scan backlog, and a deploy mid-review no longer ends the
  Scan early.
- **Small worker fixes.** Timeouts and heartbeats on the audio encode, one grouped badge count per push chunk, the
  day's spend read through a cache, indexes for the sweep's reads, a recorded quiet day for the notifications
  email, and paid results stored before the next step.
- **Reports that reach someone.** A Temporal server the sweep cannot read, a sweep that stops running, and an error
  that loops are each reported once across runs.

No route, field, or MCP tool return that a released build reads is removed or changed.

## Capabilities

### New Capabilities

- `stale-work-close-out`: the sweep's close-out of work whose workflow is gone: each limit derived from the
  workflow's timeouts, the restart once, and the rows it never touches.

### Modified Capabilities

- `static-serving`, `deploy-mechanics`, `docs-site`, `workspace-structure`: the web service on the api's own entry,
  its path routes and health checks, the worker's roles as services, the release order, and the drain on a deploy.
- `request-capacity`: pools sized by shares.
- `performance-telemetry`, `monitoring-analytics`: each service's gauge line, the new queues' backlogs, renders and
  sheds a minute, the sweep's finish time, and warnings sent once an hour across sweeps.
- `edge-caching`, `ui-routing`: the purge after the web service deploys, and where a server render reads the api.
- `durable-scans`, `scheduled-scans`, `scan-stopping`, `source-ingestion`: scheduled Scans on a queue of their own,
  a review that retries on a worker shutdown, the sweep's order, and what ingest returns.
- `curation`, `topic-detail-page`: filtered Findings that keep a page from being scored again, the duplicate check
  within a Topic, and the notes card reading the newest recap that was written.
- `podcast-episode-rendering`, `topic-post-discussions`, `topic-images`: the scheduled chapter queue, the encode
  queue, retries that wait, results stored before the next step, and close-outs.
- `topic-podcast-episode-video-rendering`, `stored-object-deletion`: the film service, a row written when a film is
  queued, stored shots, uncounted interrupted attempts, and the backfill's child workflows.
- `daily-spend-cutoffs`, `monthly-budget-cutoffs`, `content-moderation`: the spends table, kept out of the
  free-plan spend where the platform paid, and a moderation verdict kept by the text's hash.
- `push-notifications`, `notifications-email`, `podcast-feeds`: the grouped badge count, the quiet day, and covers
  drawn off the request path.

## Impact

- `apps/worker`: `temporal.ts` (roles, six new Workers, a metrics endpoint), `schedule.ts`, a close-out module, the
  recording, film, backfill, and discussion workflows, and their activities.
- `packages/pipeline`: `stageTimeouts.ts`, `review/`, `podcast/`, `topicPodcastEpisodeVideo/`, `topicPosts/`,
  `topicImages/`, `temporalClient.ts`, `scanWorkflowClient.ts`, `pushDelivery.ts`, and the cover modules moved in.
- `packages/db`: tables `filtered_findings` and `spends`, a `restarted_at` column on five tables, eleven indexes,
  `index.ts` (pool shares), `quotas.ts`, `updateCounts.ts`.
- `apps/api`: `index.ts` (the process name, the drain, the shed count), `apps/web/src/lib/webApiClient.ts`.
- `infra/northflank/release-main.json`, root `package.json` scripts, `README.md`, `AGENTS.md`, the worker's, the
  api's, the pipeline's, and the db's AGENTS files, and `apps/docs/deployment.md`.
- By hand in Northflank and Doppler: the `web` and film services, their autoscaling, each service's termination
  grace, `DATABASE_POOL_COUNT`, and the path routes.
- The unapplied `split-web-from-api` change is folded in here, and its folder is removed with this proposal.
