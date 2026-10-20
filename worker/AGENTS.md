# worker/

Temporal worker and the scan pipeline. Entries: `temporal.ts` (the worker, with its scan concurrency set by
`SCAN_CONCURRENCY`, the concurrency of each of its attachment and source-screen Workers by `SCREEN_CONCURRENCY`, and a
Worker of its own for the `scan-closing` queue that records a scan's outcome apart from the scan slots), `schedule.ts`
(the sweep that starts as many scheduled scans as the backlog allows, a daily topic past its owner's daily scans cutoff
once a week, then retries the pending object deletions through `retryPendingObjectDeletions.ts` and reports the day's
spend across every user through `dailySpend.ts`, which warns past `GLOBAL_DAILY_SPEND_ALERT_USD`), `scanQueue.ts` (the
sweep's view of the scan queue: the start of the rows a dying caller never dispatched, the queue's report, and how many
Scans a sweep may start, `SCAN_DISPATCH_LIMIT` minus the backlog), `scheduledTopicLimits.ts` (the limits that the sweep
reads once per owner inside one request memo: the daily topic limit, the daily topics that scan weekly past the daily
scans cutoff, with each owner's cutoff cached in Redis for an hour, and the owners whose key budget is spent, with
`scheduledTopicTestFixtures.ts` for the scheduled topic that its tests and the sweep's share), `resetMonthlyBudgets.ts`
(the monthly budget reset, a daily job run as `bun run reset:monthly-budgets`), `worker/index.ts` (what api may import),
`staleScans.ts` (the close-out of a scan that outran its stages or never started, which the sweep and the manual scan
route run).

- The sweep and the reset each run under a database claim from `db/claim.ts`, so two overlapping runs cannot do the work
  twice. Each takes the claim's abort signal and checks it between batches: the sweep before each stage and each Topic,
  the reset before each user's key. A run that lost its claim stops and rejects, and the job exits non-zero. The sweep
  selects scheduled Topics in one SQL query and reads each owner's quota, key budget, and daily scans cutoff once. For a
  Topic whose owner's key has spent its budget, the sweep saves a failed Scan with the budget reason instead of starting
  a Scan. The Topics of an owner with no key, or of an owner whose budget read fails, are scanned as usual.
- `attach.ts` ingests a topic attachment and builds a topic's scan context, over `attachContentType.ts` (the canonical
  content type and what each type is), `attachText.ts` (the text extracted from an attachment's bytes), and
  `attachTable.ts` (a table file's rows serialized, clipped, and laid out for the model).
- `store.ts` is object storage: the uploads, the reads, the object keys, and `deleteStoredObject`. It deletes through
  the bucket and clears the key's row in `pending_object_deletions`, and a failed delete writes its failure to that row
  with the next try pushed back. A write that deletes or fails the row naming an object records the key with
  `recordPendingObjectDeletions` in the same transaction, and an upload records its key first with
  `recordPendingObjectDeletionBeforeUpload`, with a grace period, and clears it with `clearPendingObjectDeletion` in the
  row insert's transaction. `retryPendingObjectDeletions.ts` retries the pending keys after the claimed sweep, outside
  its claim, with a doubling backoff up to a day, and reports a key pending for over a day once. Resource content
  deletes through `deleteStoredObject` with no pending row. Its key is fixed per Resource, and the next fetch rewrites
  it. Before the sweep starts a Scan row that was opened and never dispatched, the sweep reads the row owner's key
  budget and marks the row failed with the budget reason if that budget is spent. A Scan that a user started by hand
  starts without the budget read. The sweep closes out a picked-up Scan that runs past its stages' total timeouts, and a
  Scan still waiting for a worker past the ingest and finish stages' total timeouts. `concurrency.ts` runs tasks a few
  at a time for the review's scoring, the sweep's reads of each owner's daily Topics, key budget, and daily scans
  cutoff, the stored object deletes, and the reset's replacements. `retry.ts` tries a failed attempt again after a fixed
  wait, for the worker's first Temporal connection, a podcast episode's publish, and the podcast episode smoke's
  chapters. The podcast episode smoke seeds its rows through `podcast/podcastEpisodeSmokeFixtures.ts`.

- `workflows/` — Temporal workflows and activities; `ingest/` — one ingester per Source kind, `ingester.ts` is the
  interface, whose optional `ingestContext` includes the Scan owner's key: the Topic owner's for a scheduled Scan and
  the starting user's for a manual one. The search ingester's query generation bills that key like every other model
  call a Scan makes; `review/` — filtering and scoring (`filter.ts` the relevance gate, `dedupe.ts` the content hash and
  near-duplicate pass, `fetch.ts` the content fetch for a Resource to score, `score.ts` the scoring and the finding
  writes, with `reviewTestFixtures.ts` beside their tests); `chat/` — Carl's streamed chat replies (`index.ts` streams a
  reply, `podcastReply.ts` streams a podcast question's reply as one structured call whose speaker, `host` or
  `cohost`, comes before the answer, `chatMessages.ts` shapes a conversation into the model messages a turn sends,
  `chatPrompts.ts` builds each chat's system prompt from its template, `podcastEpisodeQuestionPrompt.ts` the topic
  chat prompt's blocks for a question asked from the podcast player, and `agreement.ts` checks whether a user's
  message agrees to the proposal it answers, reading only the user's words and the proposal, with
  `chatModelTestFixtures.ts` for the fake models their tests stream from, and `chatContextTestFixtures.ts` and
  `podcastEpisodeChapterTestFixtures.ts` for the chat context and the chapter their tests read) and their retrieval
  (`retrieve.ts`, whose topic ranking collects the topics' findings in a materialized common table expression and ranks
  that set, `retrieveDocs.ts` for the docs sections a question about the app reads and `embedRetrievalQuery`, which
  embeds a question or a search query with the query instruction, `retrieveTeam.ts` for a team chat room turn's context,
  and `retrievePodcastEpisodeChapter.ts` for the chapter a podcast question was asked during, with its lines and
  its Finding); `prompts/` — model-facing Markdown templates, with `untrustedFenceTestFixtures.ts` for the tests that
  read a prompt's untrusted fences; `models.ts` — every model call, through LiteLLM;
  `litellm.ts` — the user keys that those calls bill to. A key is created at signup, or by
  `loadOrProvisionUserLiteLLMKey` before a user's first model call if that user has no key. A key is also replaced,
  read, and reset on the first of the month by the reset job, and `isUserLiteLLMKeyBudgetStale` tells billing whether
  a key's max budget still matches its user's budget. Every proxy admin call times out after five seconds. A
  Scan creates its owner's missing key before any Source runs. `favicons.ts` — a host's favicon, fetched once when
  review reads a page on it.
- `telemetry.ts` traces model calls in Langfuse on its own tracer provider beside Sentry's, and both processes start
  Sentry before it. `temporal.ts` logs the connection pool, the event loop delay, the scan queue, and Redis once a
  minute, and the sweep reports a queue nothing polls and a backlog older than 15 minutes, both through
  `describeScanQueue` in `temporalClient.ts`, whose connect, workflow start, and cancel each give up after ten seconds.
- Every scan stage charges the Scan's one Budget (`budget.ts`); nothing spends outside it.
- A completed Scan's email runs in its own workflow, `workflows/sendScanEmail.ts`, on the `scan-emails` queue that the
  file names, with its own Worker in `temporal.ts`. The scan workflow starts it as a child workflow that outlives the
  Scan's own, so a retrying email never holds up or fails the Scan. `notify.ts` plans a digest's batches, and each
  activity sends one batch or one report and records the accepted sends with the Scan's id, so a retry never mails
  anyone twice. `scanEmailContent.ts` holds what a Scan's email says: the props the digest and the report render from,
  and one subscriber's rendered message. `email.ts` sends through Resend, and every call from the api or the worker
  first takes a rate limit slot shared in Redis, which one call holds for 200 milliseconds, so calls leave evenly spaced
  at five a second. A call that would wait past ten seconds for the slot goes ahead without it, and each wait adds a
  little jitter, so waiters that woke together do not ask in lockstep.
- A succeeded Scan's podcast episode is recorded in its own workflow, `workflows/recordPodcastEpisode.ts`, on the
  `episode-recordings` queue that the file names, with its own Worker in `temporal.ts` whose concurrency is set by
  `PODCAST_RECORDING_CONCURRENCY`. The scan workflow starts it as a child workflow that outlives the Scan's own, after
  the email workflow, and the podcast episode workflow signals the Scan's email workflow once its outline is settled, so
  the email can name the Podcast Episode. `speech.ts` sends one two-speaker call per chapter through LiteLLM's Gemini
  pass-through and returns a WAV, and one single-speaker call in the answering host's voice for a spoken chat reply,
  which ffmpeg encodes to a 64 kbps MP3, or returns as the WAV if the encode fails. No audio passes between activities
  except through object storage. `shared/podcastEpisodes.ts` reads `PODCAST_SPEECH_MODEL`, which defaults to
  `gemini-3.8-flash-tts`, and Podcast Episodes are off if it is set empty. The steps are in `podcast/`.
  `planPodcastEpisode.ts` runs the checks that stop a recording before it spends anything, inside one request memo,
  picks the Findings, and marks the podcast episode short on a free Topic or past the billed user's full podcast
  episodes cutoff. `writePodcastEpisodeScript.ts` writes and saves the script. `generatePodcastEpisodeScript.ts` makes
  its outline and segment calls on `score-model`, and `podcastEpisodeHosts.ts` writes the hosts block that those prompts
  and the podcast question's chat prompt splice. `podcastEpisodeOutline.ts` holds the outline's shape and checks each
  outline draft, and `podcastEpisodeScript.ts` holds the segments' shape, checks each segment draft, and builds the
  script. `podcastEpisodeAudio.ts` records each chapter, stores its audio in object storage, and joins the chapters with
  ffmpeg. `podcastEpisodeTheme.ts` mixes the theme song's intro and outro under the talk in that same pass, from the
  clips committed in `assets/podcast/`, and shifts the chapter times by the intro's lead. `publishPodcastEpisode.ts`
  publishes or fails the row, and a short podcast episode's publish replaces the Topic's earlier short ones.
  `removePodcastEpisode.ts` removes a Podcast Episode and deletes its audio and its vector. `podcastEpisodeChapters.ts`
  gives a new Finding the newest rating of the chapters that narrated its Resource, and links those chapters to it. The
  review's `upsertFinding` calls both.
- `ffmpeg.ts` runs one ffmpeg process through its pipes, for the chapter join, the api's cover encode, a chat
  recording's transcode, and a spoken chat reply's MP3. `transcription.ts` transcodes a chat recording to 16 kHz mono
  WAV, reading only the containers and codecs a browser records, and transcribes it through Google's Interactions API on
  LiteLLM's Gemini pass-through on the user's key with store set to false, so Google keeps no recording. A WAV with no
  samples is silent and makes no call. The pass-through does not meter that route, so the key is never charged for a
  transcription, and the api's spend row, priced by `transcriptionCost` in `budget.ts`, is the only meter. A spent key
  budget, a retryable failure, and a rejection are sorted by `toModelCallFailure` in `speech.ts`, which both calls
  share. `speech.smoke.ts` (`bun run smoke:speech`) checks both against the live proxy.
- `meanVectors.ts` saves the vectors that rank related topics, related podcast episodes, and the podcast episode search,
  each the mean of the current model's resource embeddings behind it, computed in SQL: a Topic's after every Scan ends,
  succeeded, stopped, or failed, after a save that changes its visibility, and after a rating, from its kept Findings,
  and a Podcast Episode's in its publish transaction, from its chapters. Every Topic with an embedded kept Finding keeps
  a vector, saved with whether the Topic is public and shown, a published Podcast Episode keeps one for the related
  episodes and the podcast episode search, an empty mean deletes the vector, and marking a Podcast Episode removed
  deletes its vector. A Podcast Episode's vector also saves whether its Topic is public and shown, at publish and again
  with the Topic's vectors. `scripts/backfill-vectors.ts` saves every existing Topic's and published Podcast Episode's
  vector through the same writes.
- `indexNow.ts` tells search engines a public Topic's urls changed. A missing `INDEXNOW_KEY` sends nothing, and a
  failed send never fails its caller.
- A Resource's content hash is taken in the dedupe stage, over the title and snippet as they stand then.
  The fetch that follows may replace a title read off the url and leaves the hash alone, so a retitled
  Resource still matches its Finding's `reviewed_content_hash` and no later Scan pays to score it again.
- Untrusted text is screened by LLM Guard (`guard.ts`) before any model reads it. `screenImage` screens the text a chat
  image shows, read with text recognition in `imageText.ts`, using tesseract.js and its installed English data. With
  `LLM_GUARD_URL` unset it returns skipped before the text recognition code loads, so an image costs no call and no
  wait. `guardTestFixtures.ts` runs a test against a fake scanner that returns one verdict, or with no scanner at all.
- Every fetch of a user-supplied url goes through `fetchPublicUrl` (`publicFetch.ts`), which re-checks each redirect hop
  against the internal-address rule, with `readLimitedBody` bounding reads. A fetch that a server responds to with an
  error status throws `FetchStatusError`, and `isRetryableFetchFailure` says whether a failure is worth a retry: a
  timeout, an abort, a 429, or a 5xx. `scrape.ts` reads a reddit thread from reddit's own api and scrapes any other page
  through Firecrawl, `transcripts.ts` reads a video's captions from YouTube, Vimeo, or Dailymotion and a declared
  transcript over that path, and `linkPreview.ts` reads a chat link's preview on it.
- `suggest.ts` suggests a Topic's Sources, and `suggestedSourceChecks.ts` resolves each suggested Source to the value
  its ingester stores and checks that its ingester can read it.
- Tests: `bun test worker`; `*.smoke.ts` hit real services and run under `doppler run`.
