# packages/pipeline/

`@carlnotes/pipeline`, the scan pipeline, Carl's chat replies, the topic attachments, and the podcast episode a Scan
ends in: what the api starts, the worker's activities run, and the evals measure. `apps/api` and `apps/worker` import
it; it imports `@carlnotes/models`, `@carlnotes/emails`, `@carlnotes/db`, `@carlnotes/server`, and
`@carlnotes/contracts`, with `@temporalio/client`, `rss-parser`, `ai`, `unpdf`, `mammoth`, `exceljs`, and `zod`.

- `scan.ts` starts a Scan: `startTopicScan` opens the row and the workflow, `stopTopicScan` cancels one, and `scanTopic`
  and `failUnstartedScan` are what the sweep calls for a row it dispatches or fails. `temporalClient.ts` is the Temporal
  client: the task queue names, the `ScanTrigger` type (`manual`, `scheduled`, or `creation`), the workflow starts and
  the cancel, each giving up after ten seconds, and `describeScanQueue`, which the worker's minute line and the sweep's
  backlog report read. `stageTimeouts.ts` is how long each Scan stage may run and how many attempts it gets, which the
  workflows import. `staleScans.ts` is the close-out of a scan that outran its stages or never started, which the sweep
  and the manual scan route run. `screen.ts` starts the llm-guard screening workflow for every Source still waiting on
  one.
- `attach.ts` ingests a topic attachment and builds a topic's scan context, over `attachContentType.ts` (the canonical
  content type and what each type is), `attachText.ts` (the text extracted from an attachment's bytes), and
  `attachTable.ts` (a table file's rows serialized, clipped, and laid out for the model). `chunk.ts` splits a long
  document's text into bounded chunks for parallel summarization.
- `ingest/` — one ingester per Source kind: `rss.ts`, `youtube.ts`, `reddit.ts`, `x.ts`, `bluesky.ts`, `podcast.ts`,
  `url.ts`, and `search.ts`, over `feed.ts` for the feeds that need no key and `normalize.ts` for the url, title, and
  kind a Resource gets before it is stored. `index.ts` reads a topic's Sources oldest first, runs and times each through
  its ingester, and stores what they find. Its `toScanSummary` dedupes the Resources by canonical url, credits each to
  the first Source that returned it as the Resource's `sourceId`, and returns one source result per Source in that
  order, labeled by `toSourceResultLabel` from the Source's row as it stands after the ingesters ran. The insert strips
  `sourceId`, which the worker's closing write reads for each Source's kept count. `toScannedSource` narrows an outcome
  to the four fields the scan report reads, for the payload the worker passes between stages. A Source's fallback mode
  comes from `@carlnotes/contracts/sources`. `ingester.ts` is the interface, whose optional `ingestContext` includes the
  Scan owner's key: the Topic owner's for a scheduled Scan and the starting user's for a manual one. The search
  ingester's query generation bills that key like every other model call a Scan makes. `review/` — filtering and scoring
  (`filter.ts` the relevance gate, `dedupe.ts` the content hash and near-duplicate pass, `fetch.ts` the content fetch
  for a Resource to score, `score.ts` the scoring and the finding writes, each Resource reserving its largest cost
  before its paid section, `track.ts` what became of each Resource, `summarize.ts` the scan report, and `index.ts` the
  stage over them, with `reviewTestFixtures.ts` beside their tests). `chat/` — Carl's streamed chat replies (`index.ts`
  streams a reply, `podcastReply.ts` streams a podcast question's reply as one structured call whose speaker, `host` or
  `cohost`, comes before the answer, `chatMessages.ts` shapes a conversation into the model messages a turn sends,
  `chatPrompts.ts` builds each chat's system prompt from its template, `podcastEpisodeQuestionPrompt.ts` the topic chat
  prompt's blocks for a question asked from the podcast player, `search.ts` the live web search tool a signed-in chat
  turn may call, and `agreement.ts` checks whether a user's message agrees to the proposal it answers, reading only the
  user's words and the proposal, `chatTurnCost.ts` the largest cost of one chat turn, which the api reserves before the
  turn runs, with `chatModelTestFixtures.ts` for the fake models their tests stream from, and
  `chatContextTestFixtures.ts` and `podcastEpisodeChapterTestFixtures.ts` for the chat context and the chapter their
  tests read) and their retrieval (`retrieve.ts`, whose topic ranking collects the topics' findings in a materialized
  common table expression and ranks that set, `retrieveDocs.ts` for the docs sections a question about the app reads and
  `embedRetrievalQuery`, which embeds a question or a search query with the query instruction, `retrieveTeam.ts` for a
  team chat room turn's context, and `retrievePodcastEpisodeChapter.ts` for the chapter a podcast question was asked
  during, with its lines and its Finding). The prompts the builders fill live in `@carlnotes/models/prompts/`, and every
  model call goes through `@carlnotes/models/models` on a key from `@carlnotes/models/litellm`. `favicons.ts` — a host's
  favicon, fetched once when review reads a page on it.
- Every scan stage charges the Scan's one Budget, `@carlnotes/models/budget`.
- `notify.ts` plans a digest's batches and sends one batch or one report, recording the accepted sends with the Scan's
  id, so a retry never mails anyone twice; the worker's `sendScanEmail` workflow runs it. `scanEmailContent.ts` holds
  what a Scan's email says: the props the digest and the report render from, and one subscriber's rendered message, over
  the templates and `sendEmail` in `@carlnotes/emails`.
- `podcast/` — the steps of the worker's `recordPodcastEpisode` workflow. `planPodcastEpisode.ts` runs the checks that
  stop a recording before it spends anything, inside one request memo, picks the Findings, and marks the podcast
  episode short on a free Topic or past the billed user's full podcast episodes cutoff. `writePodcastEpisodeScript.ts`
  writes and saves the script. `generatePodcastEpisodeScript.ts` makes its outline and segment calls on `score-model`,
  and `podcastEpisodeHosts.ts` writes the hosts block that those prompts and the podcast question's chat prompt splice.
  `podcastEpisodeOutline.ts` holds the outline's shape and checks each outline draft, and `podcastEpisodeScript.ts`
  holds the segments' shape, checks each segment draft, and builds the script, with `podcastEpisodeScriptFixtures.ts`
  for their tests. `podcastEpisodeAudio.ts` records each chapter through `@carlnotes/models/speech`, stores its audio
  in object storage, and joins the chapters with ffmpeg. `podcastEpisodeTheme.ts` mixes the theme song's intro and outro
  under the talk in that same pass, from the clips committed in `assets/podcast/`, and shifts the chapter times by the
  intro's lead. `publishPodcastEpisode.ts` publishes or fails the row, and a short podcast episode's publish replaces
  the Topic's earlier short ones. `removePodcastEpisode.ts` removes a Podcast Episode and deletes its audio and its
  vector. `podcastEpisodeChapters.ts` gives a new Finding the newest rating of the chapters that narrated its Resource,
  and links those chapters to it. The review's `upsertFinding` calls both. `podcastEpisodeSmokeFixtures.ts` seeds the
  rows for the worker's podcast episode smoke.
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
- Text goes through `@carlnotes/models/guard` before a model reads it, and a user-supplied url through
  `fetchPublicUrl` in `@carlnotes/server/publicFetch`. `scrape.ts` reads a reddit thread
  from reddit's own api and scrapes any other page through Firecrawl, `transcripts.ts` reads a video's captions from
  YouTube, Vimeo, or Dailymotion and a declared transcript over that path, and `linkPreview.ts` reads a chat link's
  preview on it.
- `suggest.ts` suggests a Topic's Sources, and `suggestedSourceChecks.ts` resolves each suggested Source to the value
  its ingester stores and checks that its ingester can read it.
- Smoke scripts: `attach.smoke.ts` (`bun run smoke:attach`) ingests an attachment through its processing workflow,
  `search.smoke.ts` (`smoke:search`), `reddit.smoke.ts` (`smoke:reddit`), and `x.smoke.ts` (`smoke:x`) run one ingester
  each against its live provider, and `chat.smoke.ts` (`smoke:chat`) retrieves against a real topic. The full Scan,
  review, links, and podcast episode smokes live in `apps/worker`.
- Imports: `@carlnotes/models`, `@carlnotes/emails`, `@carlnotes/db`, `@carlnotes/server`, and `@carlnotes/contracts`,
  the whole server chain before it. Never an app or a universal package other than `contracts`. The ingester-authoring
  skill owns the ingester rules.
- Tests: `bun test packages/pipeline`; `*.smoke.ts` hit real services and run under `doppler run`.
