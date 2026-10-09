# worker/

Temporal worker and the scan pipeline. Entries: `temporal.ts` (the worker,
with its scan concurrency set by `SCAN_CONCURRENCY`), `schedule.ts` (the sweep that starts scheduled scans),
`resetMonthlyBudgets.ts` (the monthly budget reset, a daily job run as `bun run reset:monthly-budgets`),
`worker/index.ts` (what api may import).

- The sweep and the reset each run under a database claim from `db/claim.ts`,
  so two overlapping runs cannot do the work twice. The sweep selects scheduled Topics in one SQL query
  and reads each owner's quota and key budget once. For a Topic whose owner's key has spent its budget, the sweep saves
  a failed Scan with the budget reason instead of starting a Scan. The Topics of an owner with no key, or of an owner
  whose budget read fails, are scanned as usual.
  Before the sweep starts a Scan row that was opened and never dispatched, the sweep reads the row owner's key budget
  and marks the row failed with the budget reason if that budget is spent.
  A Scan that a user started by hand starts without the budget read.
  The sweep closes out a picked-up Scan that runs past its stages' total timeouts,
  and a Scan still waiting for a worker past the ingest and finish stages' total timeouts.
  `concurrency.ts` runs tasks a few at a time for the review's scoring, the sweep's reads of each owner's daily Topics
  and key budget, and the reset's replacements. `retry.ts` tries a failed attempt again after a fixed wait, for the
  worker's first Temporal connection, a podcast episode's publish, and the podcast episode smoke's chapters.

- `workflows/` — Temporal workflows and activities; `ingest/` — one ingester per Source kind,
  `ingester.ts` is the interface; `review/` — filtering and scoring; `chat/` — Carl's streamed
  chat replies and their retrieval; `prompts/` — model-facing Markdown templates; `models.ts` —
  every model call, through LiteLLM; `litellm.ts` — the user keys that those calls bill to. A key is created at
  signup, or by `loadOrProvisionUserLiteLLMKey` before a user's first model call if that user has no key. A key is
  also replaced, read, and reset on the first of the month by the reset job. Every proxy admin call times out after
  five seconds. A Scan creates its owner's missing key before any Source runs. `favicons.ts` — a host's favicon,
  fetched once when review reads a page on it.
- `telemetry.ts` traces model calls in Langfuse on its own tracer provider beside Sentry's, and both processes start
  Sentry before it. `temporal.ts` logs the connection pool, the event loop delay, the scan queue, and Redis once a
  minute, and the sweep reports a queue nothing polls and a backlog older than 15 minutes, both through
  `describeScanQueue` in `temporalClient.ts`.
- Every scan stage charges the Scan's one Budget (`budget.ts`); nothing spends outside it.
- A completed Scan's email runs in its own workflow, `workflows/sendScanEmail.ts`, on the `scan-emails` queue that
  the file names, with its own Worker in `temporal.ts`. The scan workflow starts it as a child workflow that outlives
  the Scan's own, so a retrying email never holds up or fails the Scan. `notify.ts` plans a digest's batches, and each
  activity sends one batch or one report and records the accepted sends with the Scan's id, so a retry never mails
  anyone twice. `email.ts` sends through Resend, and every call from the api or the worker first takes a rate limit
  slot shared in Redis, which one call holds for 200 milliseconds, so calls leave evenly spaced at five a second.
- A succeeded Scan's podcast episode is recorded in its own workflow, `workflows/recordPodcastEpisode.ts`, on the
  `episode-recordings` queue that the file names, with its own Worker in `temporal.ts` whose concurrency is set by
  `PODCAST_RECORDING_CONCURRENCY`. The scan workflow starts it as a child workflow that outlives the Scan's own, after
  the email workflow, and the podcast episode workflow signals the Scan's email workflow once its outline is settled, so the email
  can name the Podcast Episode. `speech.ts` sends one two-speaker call per chapter through LiteLLM's Gemini
  pass-through. No audio passes between activities except through object storage. `shared/podcastEpisodes.ts` reads
  `PODCAST_SPEECH_MODEL`, which defaults to `gemini-3.8-flash-tts`, and Podcast Episodes are off if it is set empty.
  The steps are in `podcast/`:
  - `planPodcastEpisode.ts` runs the checks that stop a recording before it spends anything, picks the Findings, and
    marks a free Topic's episode short.
  - `writePodcastEpisodeScript.ts` writes and saves the script. `generatePodcastEpisodeScript.ts` makes its outline and
    segment calls on `score-model`. `podcastEpisodeOutline.ts` holds the outline's shape and checks each outline
    draft, and `podcastEpisodeScript.ts` holds the segments' shape, checks each segment draft, and builds the script.
  - `podcastEpisodeAudio.ts` records each chapter, stores its audio in object storage, and joins the chapters with
    ffmpeg. `podcastEpisodeTheme.ts` mixes the theme song's intro and outro under the talk in that same pass, from the
    clips committed in `assets/podcast/`, and shifts the chapter times by the intro's lead.
  - `publishPodcastEpisode.ts` publishes or fails the row, and a short episode's publish replaces the Topic's earlier
    short ones. `removePodcastEpisode.ts` removes a Podcast Episode and deletes its audio.
  - `podcastEpisodeChapters.ts` gives a new Finding the newest rating of the chapters that narrated its Resource, and
    links those chapters to it. The review's `upsertFinding` calls both.
- `indexNow.ts` tells search engines a public Topic's urls changed. A missing `INDEXNOW_KEY` sends nothing, and a
  failed send never fails its caller.
- A Resource's content hash is taken in the dedupe stage, over the title and snippet as they stand then.
  The fetch that follows may replace a title read off the url and leaves the hash alone, so a retitled
  Resource still matches its Finding's `reviewed_content_hash` and no later Scan pays to score it again.
- Untrusted text is screened by LLM Guard (`guard.ts`) before any model reads it.
- Every fetch of a user-supplied url goes through `fetchPublicUrl` (`publicFetch.ts`), which re-checks
  each redirect hop against the internal-address rule, with `readLimitedBody` bounding reads. `scrape.ts` reads a
  declared transcript over that path, reads a reddit thread from reddit's own api, and scrapes any other page
  through Firecrawl, and `linkPreview.ts` reads a chat link's preview on it.
- Tests: `bun test worker`; `*.smoke.ts` hit real services and run under `doppler run`.
