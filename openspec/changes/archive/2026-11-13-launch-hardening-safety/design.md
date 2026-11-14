# Design

This is Part D of the launch hardening work, launch safety. The split into four changes, the places where a
person's experience would change, every finding from the closing read, and every stale claim are listed once, in
`launch-hardening`'s design under "Read this first". This change shares no requirement with `launch-hardening` and
ships before it, after it, or beside it.

## Context

See proposal.md for why. What shapes the approach:

- A setting set in Doppler reaches a process only at its start, and a worker restart costs each film render in
  flight an attempt and a review one of its attempts. The Limits card is one row read through a 60-second cache
  that a save deletes, so a switch there takes effect with no restart (A.21).
- The image check is one call to a free endpoint with a 4-second limit and no retry. A failed check posts the image
  today, on 26 server modules that read an avatar key and 62 that read an image hash (A.22).
- `contracts/0.1.0.json` is enforced by the freeze check though no release is recorded, so an upload response keeps
  its shape and a response enum gains no value.
- What only a dashboard knows (a plan, a quota, a restore window, an alert rule) is marked for the owner and never
  invented.

## Goals / Non-Goals

**Goals:**

- One place that says what to watch during a wave, how to add capacity, and every switch as a last resort, with a
  test behind each switch.
- No image reaches anyone but its owner unchecked.
- No high or critical advisory reaches a shipped path unreviewed, and a new one turns CI red without blocking a
  hotfix.
- A written answer to "what comes back, and how" for every store.
- One request from one free account cannot stop the product for everyone.

**Non-Goals:**

- An unchecked state for text (finding S6). It touches every comment, post, name, and tag read and needs its own design.
- A status page, a maintenance mode, or an invite-only mode.
- A new spend limit, or any change to the cutoffs' rules.

## Decisions

### D1. The runbook is three parts in one section of the deployment guide

- **Chose:** `## Launch runbook` after Deploy alerts in `apps/docs/deployment.md`: what to watch (each gauge field
  and queue backlog with its threshold and a normal range), how to add capacity (each service and queue, the pool
  count first), then every switch as a last resort (where it is set, whether it needs a restart, what it stops,
  what keeps working, what a person sees, how to undo it). Before the three parts sits a pre-wave checklist: the
  launch-day cutoffs (X1), the owner checks, the alert rules, and the deploy freeze. A Rollback part follows.
- **Why:** nothing lists the switches together today, no normal range is recorded for any gauge, and three of the
  conditions the code warns about reach nobody under the four documented alerts.
- **The normal ranges** are read from a week of production gauge lines by a task, never guessed.

### D2. Three switches move to the Limits card, and two readers learn to take 0

- **Chose:** the Limits card gains "pause new podcast episodes", "pause new films", and the generated chapter image
  limit as an override, stored on `spend_control_settings` and each read inside an activity, so none needs a restart
  or a workflow version. It also gains "the home shows pinned items only" (finding S4) and the unverified accounts
  switch extended to chat, voice, and manual Scans (finding S9). While that switch is on, chat and voice say to
  verify the address, and a manual Scan waits without a word, because a living rule says nobody is told about a
  waiting Scan. Every one is off by default. The film backfill
  concurrency and `SCAN_DISPATCH_LIMIT` are read so that 0 means none.
- **Why:** `PODCAST_SPEECH_MODEL` set empty, the only way to stop recording today, also hides every published
  podcast episode, responds 404 for every feed, and needs two restarts. The worker's concurrencies stay in Doppler,
  because a Worker's slots are fixed when it is created: capacity there is replicas.
- **Rejected:** moving the speech model itself (it is configuration), a new settings table (the one row, its cache,
  and its card already do the job), and a permanent rule that only verified owners reach the home's unpinned rows
  (it would change what an honest new person gets on a quiet day, so it is a switch).
- **A missing field in a cached settings value reads as off, and a missing field in a posted one leaves the stored
  value alone**, so a rolling deploy, an admin page loaded before it, and an older admin tab change nothing.

### D3. An unchecked image is one the public pointer never moved to

- **Chose:** a public-bound upload whose check could not run is stored, and a row in a new table `unchecked_images`
  names it. The user's avatar key, the team's, and each image hash keep their old values, so every existing read keeps
  serving the previous image or the default with no change. The owner sees the unchecked image at once: an avatar
  through one nullable column on the user's row that the session returns, the other images through an uploader-only
  branch in their file routes and an overlay in the subject's own page read. The upload response keeps its shape and
  gains an optional `isImageUnchecked`. The sweep checks unchecked images again each run, oldest first, stops the batch
  at the first call that fails, promotes a clean image through the function that publishes its kind today, deletes a
  rejected one, and reports an image unchecked for over a day.
- **Public-bound** means every user avatar and team avatar, and a topic-bound image whose Topic is invite or public: the
  line the text check already draws. A private Topic's image keeps today's behavior, with one addition (finding R19,
  close): its failed check also writes an `unchecked_images` row marked published, so the sweep checks it in the
  background and removes it like an admin removal if it is flagged. Without that, the image goes public unchecked the
  day its Topic does. If you would sooner check a private Topic's images at the moment it turns public, that is the
  alternative.
- **Why:** hiding a published image would mean a filter in 88 modules, the share cards and the film render among
  them, and one missed read leaks. Not moving the pointer changes no reader.
- **The note:** "Only you can see this image until Carl finishes checking it." and "Only you can see this photo until
  Carl finishes checking it." for an avatar, in the voice of "Carl couldn't check that image just now."
- **A rejected unchecked image** is deleted and the previous image stays. The owner is told nothing more, as a removal
  tells nothing today.
- **A check that was skipped for want of a key still passes**, so a development stack needs no key. Only a failed check
  saves an image as unchecked.
- **Rejected:** a status on each of six tables, and failing the upload as a body image does (the owner's experience
  would change).
- **Amended during the apply, for the mobile app:** the app's image elements send no session, so an unchecked image
  could not load there, and the unchecked avatar's url would have stored the published avatar on the uploader's phone
  under the url the unchecked one takes once it is published. Each unchecked url an overlay returns, and the app's own
  unchecked avatar, is marked with `unchecked=1`. The app sends its stored session cookie with a marked path alone and
  stores none of those bytes. A marked avatar request gets the file at exactly the version it names or a 404, and never
  a redirect, because a native image loader carries a hand-set cookie across a redirect, which would send the session to
  a provider's photo host. Sending the cookie with every image request was rejected for that reason.
- **Amended at ship, after the audits:** an upload, a drop, and the sweep each take one lock on the subject, and the
  sweep acts only on the unchecked image it read. A visibility change is never blocked: a private Topic's published
  unchecked images go back to their uploaders in the transaction that makes it invite or public, and everyone else sees
  the placeholder, the coffee mug in an image box with no file. A flagged published image is removed with no render. A
  check the worker skips keeps the image unchecked. A ready film drawn from an unpublished or flagged image is marked
  rendering in the same write, so its Podcast Episode plays as audio until the film's intro and sign-off are rebuilt.
  A film draws no unchecked upload in the first place: a render shows the next checked image in the film's order, a
  ready film keeps playing as it was rendered while an unchecked upload would be its image, and the sweep starts the
  rebuild once a published upload passes its check. So the mark is a second guard, for a render that read its image
  in the moment before the upload's record was committed. The sweep's retry of a pending object deletion reads the
  key's row again right before the delete, so a key that a save cleared since the batch was read keeps its object.

### D4. An admin resets a reported avatar and regenerates a reported podcast episode image from the reports that exist

- **Chose:** the `profile` and `podcastEpisode` reports gain a Remove action: "Reset avatar" for a profile with an
  upload or a provider photo, and "Regenerate" for the podcast episode's image, which draws a new one on the
  platform's key as removing a topic image does. The team avatar and the film's image get the same on their
  reports. The reset purges the avatar's edge tag.
- **Why:** shipped builds and the MCP `report_content` tool already send those two kinds, so the action has to work
  on them whatever else is added.
- **Rejected:** new report kinds `avatar` and `podcastEpisodeImage`: an enum migration and a second report option on
  two pages in both apps, and old-kind reports would still have no action.

### D5. Advisories are gated by a script, in a CI job of its own

- **Chose:** `eas-cli` to `^27.7.2` and a lockfile refresh (clears 17 highs), a root override of `dompurify` to
  3.4.17 (clears the critical and one high), and a reviewed allowlist of three with a reason and a date each:
  Tiptap's Markdown parser (not installed), `basic-ftp` (the evals' tooling), and zod 3 (a dev tool; the app's own
  zod is checked to stay past the fix). `scripts/check-dependency-advisories.ts` reads `bun audit --json`, keeps high
  and critical, drops the allowlisted, and fails on what is left or on an entry that matches nothing. It runs in a
  CI job of its own.
- **Why:** `bun audit --json` ignores both `--audit-level` and `--ignore`, and a native ignore covers every version
  of a package for good. A job of its own keeps an advisory nobody caused apart from the gate's own result, so a
  red gate still means a failing check. No release waits on either: since 5d19693a a push to `main` releases
  without waiting for CI.
- **Rejected:** adopting Dependabot's grouped update (it fails the type check and silently drops two patches), and
  overriding Tiptap (extensions built for another version in the notes editor, days before launch).
- **Amended during the apply:** the override gives the notes editor's chunk DOMPurify 3.4.17 and the audit lists no
  dompurify advisory, but the web bundle still holds a second copy. Every posthog-js release through 1.448.0 ships a
  built module with DOMPurify 3.4.13 inside it, which no override reaches and no audit sees. Neither advisory
  applies to that copy: the module never sets `SAFE_FOR_TEMPLATES` and adds no hook, and what it sanitizes comes
  from the PostHog project's own settings. Task 3.2's verification names the notes editor's chunk instead of one
  copy.

### D6. Recovery says what each store costs to lose, and Temporal starts empty

- **Chose:** `## Recovery` in the deployment guide, one part per store: Postgres (the steps, and what a restore
  brings back that it should not), R2 (what comes back by itself, what comes back for a cost, what is gone), Redis
  (what a loss costs and what an outage fails), Temporal, and the stores the item does not name: LiteLLM's database
  and the two secrets that cannot be made again, `CHAT_TEXT_KEY` and `BETTER_AUTH_SECRET`. A lost Temporal store is
  started empty, never restored from an older copy, and the sweep's close-outs bring the rows back.
- **Why:** the request's sentence about Redis is not true as written (A.21), and the section is only useful if it is.
- **With it (finding R21):** a Dashboard that is rebuilt because something was published keeps its old snapshots
  until the rebuild has new ones to write, and the embedding centroid keeps an in-process copy for an hour, so a
  Redis outage neither empties a Specials page nor turns each related read into an 8-second query. A Topic made
  private, deleted, or moved still deletes its snapshots at once, as the living rule for a privacy change says.
- **Not changed:** an account close still responds 503 while Redis is unreachable. It rejects the close so that a
  closed account's session cannot survive in Redis, and the section says so.

### D7. One request cannot take a replica down

- **Chose:** a workbook is read with the streaming reader and holds only the rows the text keeps. A zip's declared
  unpacked size is checked before a Word file or a workbook is opened. Extraction runs in a child process with a
  memory limit, in the api and in the worker, so a kill ends one file. An avatar's pixel size is read on upload, and
  every avatar is resized to the drawn size before a card inlines it. A chat turn is authorized before its body is
  read, and large bodies are admitted by bytes in progress. The attachment upload goes behind the tool caller limiter
  that avatars and chat already use.
- **Why:** measured, a 9.5 MB workbook took a process to 1.5 GB in 3.7 seconds, on the worker's main thread, with
  three attempts (finding S1). None of this changes what an honest person gets: the text already keeps 150 rows.
- **Rejected:** a smaller upload limit, which would be a new limit for everyone.
- **Amended during the apply:** a workbook that declares 4 MB or less unpacked is still read whole, and only a larger
  one is streamed. exceljs's streaming reader reads merged cells, phonetic runs, TRUE and FALSE formula results, and
  trailing whitespace differently from its whole-file reader, so streaming every workbook would change the stored
  context of ordinary ones. Read whole, a 4 MB workbook stays within about 200 MB. The limits chosen: 1 GB of declared
  unpacked size for any zip, 640 MB of memory for one extraction's child process, and two child processes at once in
  the api, one per sender.
- **Amended at ship, after the audits:** a large chat body waits its turn for twenty seconds at most and then gets the
  busy response of a file that waited behind other files, because the server closes a connection that sends nothing
  for two minutes, with no response at all. One user's large bodies are read one at a time, so one account takes no
  more of the 104 MB than one body. A body's bytes stay counted while its route still works on it, even if its
  request was dropped, and a request dropped while it waits is never read. This narrows "nobody is turned away" to
  "nobody waits past twenty seconds without a reply that says to send it again".

## Risks / Trade-offs

- [An unchecked avatar's upload grace would delete it after an hour] → saving the avatar as unchecked clears the pending
  deletion in the transaction that writes its row, and a rejection records it again.
- [An unchecked film image must not rebuild the film] → saving the film image as unchecked stores the file only, and the
  promote starts the rebuild.
- [An overlay served to anyone but the uploader] → each overlaid read is confirmed private for a session first, and
  a test serves a second account the published image.
- [`eas-cli` 25 to 27 is two majors of a build tool] → the task runs a preview build, an update, and a dry-run submit.
- [The advisory script calls the npm registry] → no release waits on CI, so a registry outage cannot block a
  deploy.
- [A pause switch read fails open] → a failed settings read reports and reads every switch as off, by design.

## Migration Plan

One migration: the `unchecked_images` table, the unchecked avatar column, and the new columns on
`spend_control_settings`, each added with a constant default, so no write waits. Nothing is switched on by the deploy.
The owner checks in the runbook's pre-wave list are done by hand before the wave.

## Open Questions

- **The moderation endpoint's rate limit** is recorded nowhere. The sweep's recheck stops at the first failed call,
  so it cannot add to an outage.
- **Whether `bun audit` exits differently while the registry is down.** No release waits on the job either way.

## Appendix A: counts and measurements, taken 2026-11-13 at 32d3dded

Each entry was written as it was taken, read-only. The closing read's findings (A.25 to A.28) are in
`launch-hardening`'s design. Since these were taken, 5d19693a removed CI's `release` job: a push to `main` now
starts `release-main` through its push trigger, and the `NORTHFLANK_WORKFLOW_ID` variable is gone.

### A.21 Emergency switches and recovery (items 21, 24), by reading and by dev rows

Claims that no longer match the code:

- **"Redis loss drops buffered counts and nothing else" is false.** A loss of Redis's data also costs: the day's view
  claims (a repeat view that day counts again), every day-long count (suggestions 30, social writes 200, reports 50,
  Dashboard paragraphs), sign-up gate tokens signed in the last 5 minutes (those people pass the challenge again),
  the day's opener, open spend reservations, the session copies (read from Postgres until the next refresh, nobody is
  signed out), chat room messages published while the subscriber was down, and a reload of every cache.
- **"Every use degrades without failing a request" has exceptions while Redis is unreachable.** Closing an account
  responds 503 by design (`apps/api/users.ts:96-99`), so a closed account's session cannot survive in Redis. The
  nightly Dashboard build throws, because its viewer counts are sketch unions that Redis computes
  (`apps/worker/dashboards/dashboardSnapshots.ts:59-72`). A publish or a visibility change deletes a Dashboard's
  snapshots first and then starts a rebuild that fails (`packages/pipeline/dashboardRebuild.ts:57-75`), so those
  Specials pages stay empty until the next good nightly build. A sign-out during the outage cannot delete the Redis
  copy of the session, so if Redis returns with its data the old cookie works until the session's next refresh, up
  to a day (unverified by test).
- **A lost Temporal database also leaves** pending attachments, pending topic image renders, and Topic Post steps
  (summary, image, first discussion) that nothing closes out or starts again. **No Temporal schedule exists** to
  recreate: the sweep starts the nightly Dashboard build, the worker's boot starts the film backfill, and the sweep
  and the monthly reset are Northflank cron jobs.
- **`PODCAST_SPEECH_MODEL` set empty is far wider than "stop recording".** It hides every published podcast episode
  from the topic page and its own page, responds 404 for the public and the listener feeds, drops episodes from the
  sitemap reads, turns voice chat and spoken replies off, and fails every podcast episode being recorded at its next
  chapter
  (`packages/server/podcastEpisodeSettings.ts:13-22`, `apps/api/podcast/podcastEpisodeRows.ts:77-200`). Topic Post
  Discussions still start, pay for a script, then fail at the speech call.
- **Two "switches" cannot be set to 0.** The film backfill concurrency reads 0 as 1, and a running backfill keeps the
  concurrency it started with through every continue-as-new. `SCAN_DISPATCH_LIMIT` reads 0 as 100.
- **"Nothing proves each one works" is partly stale.** Most switches have a test. The gaps: the empty speech model's
  recording stop, both film concurrency readers, and `SCAN_DISPATCH_LIMIT`.
- **The unverified first scan switch's label is inverted:** "Allow unverified email sign-ups to scan" checked means
  the switch is off (`apps/web/src/components/admin/DailySpendCutoffsCard.tsx:207-213`).

How a setting reaches a process: the image and every root script start under `doppler run`, which injects the
environment at process start. Nothing watches for a change, so a Doppler change reaches `app` and `temporal-worker`
only after a restart, and the sweep on its next cron run. A worker restart costs each film render in progress one of
its 3 attempts and up to 4 hours of work, and a review one of its 2 attempts. The Limits card is one row,
`spend_control_settings` (`packages/db/schema/spendControlSettings.ts:8-34`), read through a 60-second `cacheJson`
that a save deletes (`apps/api/spendControlSettings.ts:116-138`). A failed read reports and reads every switch as
off. An activity can call `loadSpendControlSettings()`; a workflow function cannot.

The switch inventory:

| Switch | Set in | Restart | Stops | A person sees | Test today |
|---|---|---|---|---|---|
| Podcast episodes daily cutoff, default $65 | Doppler default, Limits card | none for the card | a free user's repeat podcast episodes | nothing; the Scan succeeds with no new podcast episode | `planPodcastEpisode.test.ts:199,221` |
| Scheduled scans daily cutoff, default $100 | same | none | free owners' scheduled Scans; free first and manual Scans wait | a Scan under way, with no word about waiting | `schedule.test.ts:268` |
| Chat daily cutoff, default $150 | same | none | a free user's chat turn, voice request, and message to Carl | "Carl is taking a break until midnight UTC. Ask him again then." | `chatTurnAuthorization.test.ts` |
| First scan dispatch limit, default 5 | same | none | nothing by itself; paces the waiting Scans, 0 starts none | a Scan under way for as long as it waits | `scanQueue.test.ts:142,185,203` |
| Unverified first scan switch, off | Limits card only | none | an unverified password sign-up's first Scan waits | a Scan under way until they verify | `dailySpendCutoffs.test.ts:263,300` |
| `PODCAST_SPEECH_MODEL` empty | Doppler | `app` and worker | see above | no podcast section, a missing page, a feed 404 | none sets it empty |
| Generated chapter image limit, default 40, 0 off | Doppler | worker | image generation for films rendered meanwhile | a film with fewer images, for good | `videoChapterImages.test.ts:198,218` |
| Film concurrency, default 1, 0 off | Doppler | worker | both film Workers, the backfill's start, a new podcast episode's film | no film on a new podcast episode; the api still queues rebuilds on a queue nothing polls | none for the reader |
| Film backfill concurrency, default 1 | Doppler | worker | nothing: 0 reads as 1 | nothing changes | none |
| `SCAN_DISPATCH_LIMIT`, default 100 | Doppler | none (cron) | nothing: 0 reads as 100 | a later Scan | at the default only |
| Mobile minimum version | admin page | none, within 60 s | every api request from an older build, with a 426 | "Carl needs a newer app" | `appVersionGate.test.ts:30-65` |
| Edge purge | `bun run edge:purge`, and every release | none | nothing; empties the edge, so every visitor page reaches the origin | nothing | `edgeCache.purge.test.ts` |
| `RENDER_CONCURRENCY`, default 16 | Doppler | `app` | nothing (it is capacity) | "the site is busy, try again in a moment" | none |

No maintenance mode, read-only mode, invite-only mode, or feature flag service exists. Turnstile has no off switch.

What to watch: the api's minute line holds `pool.totalCount`, `idleCount`, `waitingCount`, `eventLoopDelayMs.p99Ms`
and `maxMs`, and `redis.isConnected`, `cacheHitCount`, `cacheMissCount`, `errorCount`, `usedMemoryBytes`,
`maxMemoryBytes` (`packages/server/runtimeGauges.ts:62-69`). The worker's adds `scanQueue.pollerCount`,
`backlogCount`, `oldestBacklogAgeMs`. The sweep writes `{"gauges":"daily-spend", ...}` and its dispatch counts. Only
the `topic-scans` backlog is gauged; 13 queues are not. **No normal range is recorded anywhere** for any field: the
only recorded numbers are the alert thresholds, so the runbook's normal ranges come from a week of production lines.

The deployment guide (`apps/docs/deployment.md`, 213 lines) has the headings Prompt registry, MCP view bundles,
Container image, Release jobs, Spend control settings, and Deploy alerts. It has no launch, capacity, backup, or
recovery heading.

Recovery, from the code, with what only a dashboard knows marked for the owner:

- **Postgres on Neon.** The repo records the pooler and the pool sizing and nothing about the plan, the restore
  window, or the branches (owner). A restore is a `DATABASE_URL` change in Doppler and a restart of every process,
  then the migration job. It brings back rows people deleted after the restore time, and the privacy page promises
  deleted data leaves backups within 90 days (`apps/web/src/pages/PrivacyPage.tsx:202,222`), so the window must be 90
  days or less and those deletions are repeated by hand. Objects are not restored with it. `users.litellm_virtual_key`
  returns to a key the proxy may have retired, and the code returns a stored key without asking the proxy
  (`packages/models/litellm.ts:37-45`), so those users' model calls fail until their keys are replaced. Stripe is
  mirrored by webhook only, so its events since the restore time are sent again. Encrypted rows need the same
  `CHAT_TEXT_KEY`.
- **R2.** One bucket through one client (`packages/db/store.ts:316-332`); nothing in the repo configures versioning or
  lifecycle rules (owner). Gone for good if deleted: avatars, topic attachments, chat and room attachments, Topic
  Post body images, an uploaded topic image, a published podcast episode's audio (no code records one again). Comes
  back for a cost: a generated image (one image call, and it will differ), a film (a render, though nothing triggers
  one for a `ready` row), a discussion (a regenerate on the person's bill). Comes back by itself: share cards,
  podcast covers, Dashboard share images, a Resource's content and images, link previews, favicons.
- **Redis.** Above. After a restart the next sweep rebuilds the unique viewer counters from Postgres with no step from
  the owner. Persistence, `maxmemory`, and the eviction policy are the owner's to confirm.
- **Temporal.** Rows a loss leaves: a Scan (closed out today after 24 h 15 min or 48 h 21 min, or started again if
  never dispatched), a Source screen (started again every sweep), Personal sources work (recovered by the sweep), a
  podcast episode at `recording` (item 1), a first render at `rendering` and a discussion at `recording` (item 6), a
  topic image render at `pending` and an attachment at `pending` (nothing today). The recovery rule is to start
  Temporal empty, never from an older copy: old workflows would run again against rows that moved on.
- **Other stores.** Doppler holds two secrets that cannot be made again without losing data: `CHAT_TEXT_KEY` and
  `BETTER_AUTH_SECRET` (session cookies, unsubscribe links, podcast cover keys, sign-up tokens, and the person hashes
  in the counts). LiteLLM's own database holds every virtual key and budget. Cloudflare's rules, Northflank's cron
  schedules and service sizes, and the Sentry alerts are in no file.

Found outside the items:

- **Medium, only while Redis is unreachable: related reads recompute the embedding centroid**, whose only cache is
  Redis. In dev the query took 8.6 s cold over its 20,000-row sample (`apps/api/topic/relatedness.ts:28,91-112`).
- **Medium, only while Redis is unreachable: a publish empties its owner's Dashboards** (above).
- **Low to medium: a sign-out during a Redis outage can leave the session usable for up to a day** (above).
- **Low:** with films off, the api still starts rebuild workflows on a queue nothing polls.

### A.22 Image moderation and dependency advisories (items 22, 23), by reading and by `bun audit`

Claims that no longer match the code:

- **`REMOVABLE_REPORT_SUBJECT_KINDS` also holds `noteComment` and `topicPostBodyImage`**
  (`packages/contracts/reports.ts:14-22`).
- **No chat image is public.** A chat room read, stream, and attachment download all need an active team membership
  (`apps/api/chat/roomAccess.ts:52-57`), so chat images keep today's behavior.
- **"Dependabot opens updates" holds for version updates only.** Security updates are enabled, yet the alerts api
  shows 0 open against 58 audit advisories: every high and critical one is transitive and no alert names `bun.lock`.

The image check today (`apps/api/moderation.ts:53-90`, `packages/models/moderation.ts:20-137`): one call to OpenAI's
free `omni-moderation-latest` endpoint, 4,000 ms, one attempt, no retry, no budget. A 400, 413, 415, or 422 is
`unreadable` and rejects the upload. Every other non-200, a 429 included, is `failed`: logged, reported in
`api-route`, and the image posts. `skipped` (no key) posts with no report. Its callers and who sees each image:

| Image | Call site | Public or private |
|---|---|---|
| User avatar | `apps/api/avatars.ts:86` | always public: `GET /api/avatars/:userId` has no session check and is edge cached |
| Team avatar | `apps/api/avatars.ts:111` | always public, whatever the team's visibility |
| Topic image upload, and by url from MCP `set_topic_image` | `apps/api/topic/topicImagesRoute.ts:111`, `topicImageEdits.ts:150` | by the topic: public is edge cached, any other is served only to a session `topic:view` grants |
| Podcast episode image, film image, Topic Post image uploads | `podcastEpisodeImagesRoute.ts:110`, `topicPodcastEpisodeVideoImagesRoute.ts:168`, `topicPostImagesRoute.ts:303` | by the topic |
| Chat room image | `apps/api/chat/roomPosts.ts:47` | private, team members only |

A Topic Post body image fails closed: a check that fails or is skipped returns `503 { error:
"moderation-unavailable" }` (`topicPostImagesRoute.ts:141-158`). A Resource's page photos and a film's generated
chapter images call `classifyImage` in the worker and already fail closed.

Facts the design rests on:

- **An unchecked state in every read would touch 26 server modules that read an avatar key and 62 that read an image
  hash**, the bytes the server itself draws from included: share cards, the podcast cover, the feeds, the page heads,
  the home cards, search, news, the MCP reads, the Scan email, and the film render. One missed read leaks, and a card
  drawn once is stored and reused.
- **The released contract.** `contracts/releases.json` is `[]`, but `scripts/check-contract-freeze.ts` checks every
  snapshot on disk that is not retired, so `contracts/0.1.0.json` (191 routes) is live. Upload responses are frozen
  as `{ ok: true }`, `{ image }`, and `{ posterUrl }`. `avatarSource` and `imageOrigin` are response enums and may not
  gain a value. An optional field passes. The report subject kind enum appears only in requests.
- **The signed-in user's own avatar is drawn from the session everywhere** (`packages/core/hooks/useAvatar.ts:21,46`),
  and the session's user is the `users` row.
- **The upload grace deletes a key that is never made current after an hour** (`packages/db/store.ts:17,46-52`).
- **`replaceTopicPodcastEpisodeVideoImage` starts the rebuild of the film's intro and sign-off**, so an unchecked film
  image stores the file only and the promote starts the rebuild.
- **`replaceAvatar`, the team's transaction, and `refreshSessionUser` live in `apps/api`**, which the worker cannot
  import. The promote functions for the other four kinds are already in `packages/pipeline`.
- **The admin console** removes a reported topic image by dropping the upload and starting a render on the platform's
  key (`apps/api/report/adminReports.ts:319-361`). `saveAvatarSource(userId, "generated")` already resets an avatar
  (`apps/api/avatars.ts:155-157`) but purges no edge tag. No `removePodcastEpisodeImageUpload` exists; the render
  workflow already draws a podcast episode's image from its row, so no workflow code changes. An avatar and a
  podcast episode's image are reported today only as part of a `profile` or `podcastEpisode` report, which shipped
  builds and the MCP `report_content` tool send.
- **Existing copy to match:** "Carl couldn't check that image just now. Try again in a moment."
  (`packages/core/lib/topicPosts.ts:63`).

`bun audit` on Bun 1.4.3, 2026-11-13: **58 advisories in 19 packages: 1 critical, 21 high, 23 moderate, 13 low**, of
2,281 packages. The production image installs `apps/api`, `apps/docs`, `apps/web`, `apps/worker`, and the nine
packages with `--production`, never `apps/mobile`.

| Package, installed | High and critical | Pulled in by | Reaches a shipped path | Applies | Smallest fix |
|---|---|---|---|---|---|
| dompurify 3.4.11 | 1 critical, 1 high | `react-native-enriched-html@1.1.1`, which pins it | the web app's browser bundle | no: the package calls `sanitize` in string mode with none of the affected options | root override to 3.4.17, already in the lockfile for posthog-js |
| @tiptap/core 3.27.1 | 1 high | the same package, which pins every `@tiptap/*` | the web bundle | no: the flaw is in the Markdown attribute parser, and `@tiptap/markdown` is not installed | allowlist; the real fix is enriched-html 1.2.0, which needs the repo's 693-line patch made again |
| minimatch 5.1.2 | 3 high | `eas-cli@25.3.0`, and exceljs through archiver | installed in the image, never run: the pipeline only reads workbooks | no | a lockfile refresh to 5.1.9 |
| nanoid 3.3.8, joi 17.11.0, tar 7.5.19 | 3, 2, 1 high | `eas-cli@25.3.0`'s exact pins | dev tooling | no | `eas-cli` 27.7.2 |
| node-forge 1.4.0 | 8 high | `eas-cli@25.3.0` and Expo's build tooling | dev and build tooling | no | `eas-cli` 27.7.2 and a refresh to 1.4.3 |
| basic-ftp 5.3.1 | 1 high | promptfoo, for the evals | dev tooling | no | allowlist: the fix is outside get-uri's range |
| zod 3.25.76 | 1 high | `expo-mcp@0.2.4`; the app's own zod is 4.6.7 | dev tooling | no | allowlist, with a check that the workspaces' zod stays at 4.6.6 or later |

17 of the 21 highs come from `eas-cli@25.3.0`'s exact pins, and its fixed pins start at 27.7.2 (published
2026-11-10, so past the three-day release age in `bunfig.toml:4` from 2026-11-13 17:07 UTC). `bun audit` takes
`--audit-level` and `--ignore`, and both set the exit code, but `--json` output ignores both. CI runs `bun audit`
with `continue-on-error: true` in the `gate` job (`.github/workflows/ci.yml:30-32`), and `release` needs `gate`
(`:75`). Dependabot PR #71 (the grouped update) fails `tsc` and drops two patches from the lockfile; PR #53
(`eas-cli` 26.0.0) clears nothing.

Found outside the items:

- **Medium: a private topic's unchecked image becomes public unchecked.** The text is classified again if a private
  topic goes invite or public (`apps/api/topic/saveTopicGate.ts:45,98-99`); nothing checks its images.
- **Medium-low: a generated image is never image-checked**, and its prompt's text check fails open
  (`apps/api/topic/imageEdits.ts:28-37`). Only a film's chapter images are checked.
- **Medium-low: under a moderation outage a body image upload fails for every author**, and the film backfill's
  generated images and each Resource's photos call the same endpoint, so the wave and the backfill can rate limit it
  together.
- **Low-medium: `.bun-version` is 1.4.3 and the Dockerfile runs 1.4.4.** Dependabot's docker update moved the image
  and not the file.
- **Medium: a Dependabot bump of a patched package drops its patch without failing the install.** `markdown-to-jsx`
  is declared `^9.10.4` in five workspaces while patched at 9.10.4.
- **Low:** an unset `OPENAI_API_KEY` skips every image check with no report. The team avatar and the film's image
  have the same admin gaps as the avatar and the podcast episode image.

## Appendix B: records from the apply, 2026-11-13

### B.1 The api with Redis stopped (task 4.1)

A second api ran on port 3100 from this change's code against the dev database and a throwaway Redis container, never
the dev stack's. No `web` service exists yet, so the api rendered the pages. The same requests ran with that Redis up
and then stopped.

| Request | Redis up | Redis stopped |
|---|---|---|
| The home page | 200 | 200 in 792 ms |
| A public profile page | 200 | 200 in 511 ms |
| A public Topic's page | 200 | 200 in 724 ms |
| `GET /api/home` | 200 | 200 in 934 ms |
| A Topic's related topics | 200 in 11,063 ms, the first centroid query | 200 in 491 ms, from the in-process centroid |
| Sign in with a password | 200 | 200 in 269 ms |
| The session read | 200 | 200 |
| Post a view | 204 | 204 |
| A chat turn | 200 with a reply | 200 with a reply in 4,972 ms |
| Close the account | not run | 503, "closing an account is unavailable for a moment. try again" |

Only the account close failed, with its 503, and the account stayed as it was.

### B.2 Each runbook switch, set once in dev and unset (task 6.2)

Each switch was set in the dev database's settings row through the admin route, or for a Doppler setting in the
environment of one process, and put back. The cutoffs, the pauses, and the limits were read on the second api, whose
cache was its own, because the dev stack's sweep was still running the code it started with and kept rewriting the
shared cached settings without the new fields.

| Switch | How it was set | What was seen |
|---|---|---|
| Chat daily cutoff | an override of $1, with the day's free-plan spend at $1.20 | a free user's chat post got 429 `chat paused`, an admin's passed, and the cleared override passed again |
| Scheduled scans daily cutoff | an override of $1 | the cutoff read as passed, and a free user's first and manual Scans read as waiting; an admin's did not |
| Podcast episodes daily cutoff | an override of $1 | a free user read as past the cutoff, and an admin did not |
| First scan limit | an override of 0 | the first scan dispatch limit read 0; cleared, it read 5 |
| Unverified accounts | the switch on | an unverified password account's chat post got 403 `email unverified`, a verified account's passed, and with the switch off both passed |
| Pause new podcast episodes | the switch on | the plan of two dev Scans with new Findings logged "new podcast episodes are paused" and wrote no row, and the Topic's public feeds responded 200 |
| Pause new films | the switch on | the reader that starts a new podcast episode's film returned false, and true once off |
| Generated image limit | an override of 0 | the film's limit read 0; cleared, it read 40 |
| Show only pinned items on the home | the switch on | the home's seven lists went from 12, 8, 13, 12, 24, 3, and 9 cards to 5, 0, 0, 1, 0, 1, and 1 within a minute |
| `SCAN_DISPATCH_LIMIT` | 0 for one process | the limit read 0 and a sweep's dispatch count read 0; unset, both read 100 |
| `TOPIC_PODCAST_EPISODE_VIDEO_BACKFILL_CONCURRENCY` | 0 for one process | the backfill read as off, and a new podcast episode's film still read as started |
| `TOPIC_PODCAST_EPISODE_VIDEO_CONCURRENCY` | 0 for one process | a new podcast episode's film read as not started, and the backfill as off |
| `PODCAST_SPEECH_MODEL` | empty on a third api, port 3101 | the Topic's public feeds responded 404, its read held no podcast and no latest podcast episode, and the podcast episode's own read responded 404. The second api responded 200 for each |
| Mobile minimum version | Android at 99.0.0, cleared in the same second | an Android 0.1.0 request got 426 with the minimum and the store url, and the web's request got 200 |
| Edge purge | `bun run edge:purge` in dev, which holds no Cloudflare values | "skipped the edge purge: CLOUDFLARE_ZONE_ID and CLOUDFLARE_API_TOKEN are not both set" |

The pauses, the image limit, and the three Doppler settings were seen through the reader that the worker's activity
calls, with the switch set in dev, and not through a whole Scan, recording, or render. Every setting is back at its
default.

Two facts found on the way:

- **Production's sweep runs every 15 minutes** (the `scan-sweep` cron job's schedule, read from Northflank), so the
  first scan limit of 5 starts 20 waiting Scans an hour. The findings in `launch-hardening`'s design that say 300 an
  hour assumed a sweep every minute, which is the dev stack's.
- **A process on older code rewrites the cached settings without the new fields**, and the new switches then read as
  off until a process on this code reads the row again. In production that is an old replica during a rolling
  deploy. In dev it is the sweep, which does not watch its files, until the dev stack restarts.

### B.3 The dev proxy at production's version (task 1.10)

The dev stack's LiteLLM moved from v1.94.0 to production's v1.106.4, by the same image digest. Its migrations
applied and the proxy reported healthy. The smoke suite then showed one difference between the two versions:

- **The newer proxy charges the key for a transcription.** The speech smoke test assumed, as the config's comment
  and the `speech-model-routing` spec said, that the pass-through's Interactions route charges the key nothing. On
  v1.106.4 a transcription raised its key's spend by exactly the app's own estimate ($0.000432 in one measured call).
  Production has run that version, so its keys have been charged for transcriptions while dev and CI saw no charge.
- **Nothing in the app counts a transcription twice.** The monthly budget cutoffs and the daily spend cutoffs read the
  api's own spend rows. Only the key's own budget and the admin console's per-user spend read the key, and both are
  now closer to the app's sum.
- **What changed with it:** the smoke test waits for the transcription's charge and checks it against the app's
  transcription rate, the config's comment and the models guide say the key is charged, and this change modifies the
  `speech-model-routing` requirement to match.

One check in the speech smoke test depends on the model: a spoken "stockists" came back as "stock is still" in one
run of three. That check is as it was before this change.

All 27 suites of `bun run smoke` passed on the new image: scan, store, attach, search, reddit, x, links, speech,
podcast-episode, review, chat, eval, subscribers, profile, social, news, seo, teams, room, rooms, chat-turns,
push-devices, invites, mcp, tools, podcast-episodes, and search-plans.

### B.4 An unchecked image, from upload to publication (task 6.3)

Three more apis ran from this change's code against the dev database and the throwaway Redis: one whose every request to
the image moderation endpoint failed like a dropped connection, one with `OPENAI_API_KEY` unset, and the second api of
B.1 as another replica. The recheck ran as one sweep's unchecked image check, in a process that could reach the
endpoint. The owner, a second signed-in account, and a visitor each had a browser context of their own in the machine's
Chrome.

| Step | What was seen |
|---|---|
| Key unset: an avatar, a public Topic's image, and a private Topic's image uploaded | each posted as today: no `isImageUnchecked`, no `unchecked_images` row, and all three people got the avatar and the public Topic's image with `public, max-age=31536000, immutable` |
| Endpoint blocked: the same three uploads | the avatar and the public Topic's image returned `isImageUnchecked: true`, with one `unchecked_images` row each. The user's row kept its generated avatar and the Topic's row kept no image. The private Topic's image published at once, with an `unchecked_images` row marked published |
| The owner, while the images were unchecked | the account page and the owner's own profile showed the photo with "Only you can see this photo until Carl finishes checking it." The Topic's page showed the image from its `unchecked=1` path, served `private`. The session held the unchecked avatar's key |
| The owner uploads through the Topic's image dialog, endpoint blocked | the upload returned unchecked, the dialog showed the image with "Only you can see this image until Carl finishes checking it.", and the page's header showed it after the dialog closed |
| A second account and a visitor, while the images were unchecked | neither saw a note, the photo, or the Topic's image. The unchecked file's own url responded 404 for both, and a `unchecked=1` avatar path responded 404 `private, no-store` for the visitor |
| One sweep's check with the endpoint reachable | "3 published, 0 deleted": the avatar, the public Topic's image, and the private Topic's published unchecked image. All three people then got the avatar and the image with public caching, and the owner's note was gone |
| An unchecked image over a published one | the owner saw the unchecked image while the second account and the visitor still got the published one. After the check all three got the new one |

One thing found on the way, which is as it was before this change: a visitor's Topic read is cached for 30 seconds
and the file route serves a Topic's current image alone, so for up to 30 seconds after an image is replaced, by this
check or by any upload or render today, a visitor's read names a file the api no longer serves. Task 7.10 of
`launch-hardening-page-reads` was added to delete the cached page on an image change.

### B.5 The workbook and the avatar, measured again (tasks 5.1 and 5.4)

On the machine of A.28, with the same generated files:

- **The 9.5 MB workbook** of 100,000 rows by 20 columns took a process from 32 MB to 1,514 MB before this change. Read
  with the streaming reader it peaks at 132 to 165 MB, in 2.4 to 2.6 seconds instead of 4.8. The serialized text, the
  table text, and the chat's clip are the same characters as before, and inside the child process the read passes
  under a 150 MB limit.
- **The 12,000 by 12,000 pixel PNG** of 436 KB is rejected on upload as too large, and the process's memory rises by
  0.5 MB. A stored avatar is drawn into a card at 56 by 56 pixels, and the card's draw raises memory by 32.5 MB at
  its peak, under the 50 MB the task allows.

These numbers are from macOS. Linux was not measured.
