# packages/pipeline/

`personalSources/emailMessage.ts` verifies the received message, recipient, sender, and authentication, and reads the headers for same-thread replies. `emailReplies.ts` rechecks live permissions and delivers each reply using its stable provider key.

`updatesOpener.ts` builds the opener prompt and writes Carl's opener above an updates list.
`personalSources/topicRelevance.ts` holds the attachment score weight and the minimum relevances, and raises a Topic's
name and prompt score by its attachment score, and
`personalSources/matchTopics.ts` filters all editable names before ranked MCP cursor paging, leaves weak editable Topics unchecked, uses the minimum filing relevance for email, and marks up to three strong best matches. `send.ts` sends all explicit IDs through one atomic receiver and notifies each accepted Topic.


`personalSources/email.ts` processes durable email confirmations, rechecks the shared destination, sender authentication
and entitlement, routes among editable Topics, and passes accepted mail to encrypted confirmation storage with a filing
reply. Provider failures return content-free retry delays. `personalSources/work.ts` dispatches pending confirmations
and context work after missed notifications. `personalSources/emailChoices.test.ts` checks clarification replies and
access changes. It shares isolated deliveries and sender fixtures with the confirmation tests in
`personalSources/emailTestFixtures.ts`.

`podcast/podcastPersonalSourcesMigration.ts` stops legacy output from entering audio until privacy conversion completes.
Podcast publication takes the same Topic lock as first confirmation and verifies that historical explanations have been
converted before publishing or indexing.

`personalSources/contextPrompt.ts` builds the nonce-fenced `summarize-personal-sources-context` prompt. `personalSources/summarize.ts` processes one
revision under a renewable job lease, with the Topic owner's model key and spend reservation.
`personalSources/work.ts` notifies Temporal after commit and recovers dirty revisions through the sweep.
Private text stays inside activities and encrypted DB fields. Workflow messages contain identifiers and deadlines.
`ingest/aiAgent.ts` and `ingest/email.ts` use `personalSources/linkQueue.ts` to produce public URL-only candidates, and
`ingest/index.ts` adds the links of the Topic's shared comments through the same module, which review treats as it
treats a Personal sources link.
Review rechecks live claims and records filtered or kept outcomes. Failed, stopped, and deferred links remain queued.
Queued Personal sources links lead paid scoring and bypass the embedding relevance gate. `packages/contracts/sourceScoring.ts` defines the 0.10 personal bonus beside the custom bonus. `review/saveFinding.ts` persists the strongest actual score bonus on each Finding: deliberate sends/imports/forwards receive 0.10, newsletter or automatic contributions 0.05, and personal/custom bonuses never stack. Safety, explanations, deduplication, ratings, budgets, and final trimming remain active.
`review/saveFinding.test.ts` checks the fields written by a re-score and the preservation of reader feedback.

`personalSources/send.ts` is the shared explicit-send service for MCP and the send-only API. It resolves current identity,
checks allowance, and delegates transactional acceptance to DB. `personalSources/matchTopics.ts` ranks eligible editable
Topics against their names, prompts, and ready attachment context in bounded batches. Stable embeddings remain in memory.
Email uses the shared matcher to save clear editable matches only when a nonempty `topic:` hint appears in the subject. Without that subject hint, even strong matches require a same-thread reply before filing. A first-body-line hint only affects ranking. Clarification offers numbered choices, accepting numbers or existing Topic names, including a clear fuzzy match. `personalSources/email.ts` retrieves originals from Resend only after authenticating the sender and their choice reference. Routing stores only provider/thread references and encrypted Topic choices. `personalSources/emailReplies.ts` delivers stable same-thread confirmation or clarification without restoring deleted content. Selection files atomically once and removes its choice metadata.

`@carlnotes/pipeline`, the scan pipeline, Carl's chat replies, the topic attachments, and the podcast episode a Scan
ends in: what the api starts, the worker's activities run, and the evals measure. `apps/api` and `apps/worker` import
it; it imports `@carlnotes/models`, `@carlnotes/emails`, `@carlnotes/db`, `@carlnotes/server`, and
`@carlnotes/contracts`, with `@temporalio/client`, `rss-parser`, `ai`, `unpdf`, `mammoth`, `exceljs`, and `zod`.

-  `scan.ts` starts a Scan: `startTopicScan` opens the row and the workflow, `stopTopicScan` cancels one, and
  `scanTopic` and `failUnstartedScan` are what the sweep calls for a row it dispatches or fails. `temporalClient.ts` is
  the Temporal client: the task queue names, the `ScanTrigger` type (`manual`, `scheduled`, or `creation`), the workflow
  starts and the cancel, each giving up after ten seconds, `startChatMentionPushWorkflow`, which the api calls after a
  room post saved mention rows and which ignores a second start for the same message, and `describeScanQueue`, which
  the worker's minute line and the sweep's backlog report read. `stageTimeouts.ts` is how long each Scan stage may run
  and how many attempts it gets,
  which the workflows import. `staleScans.ts` is the close-out of a scan that outran its stages or never started, which
  the sweep and the manual scan route run. `screen.ts` starts the url Source screen workflow, which fetches the page and
  marks the Source ready or failed, for every Source still waiting on one.
- `attach.ts` ingests a topic attachment and builds a topic's scan context, over `attachContentType.ts` (the canonical
  content type and what each type is), `attachText.ts` (the text extracted from an attachment's bytes, a PDF read one
  page at a time, and `extractTextUpTo`, which stops once its text passes the caller's `maxChars`), and `attachTable.ts`
  (a table file's rows serialized, clipped, and laid out for the model). `chunk.ts` splits a long document's text into
  bounded chunks for parallel summarization.
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
  (`filter.ts` the relevance gate, `topicContext.ts` the public/private review context, hash, and query embedding,
  `scoreExamplePages.ts` the pages Carl reads as examples, `reactionSignals.ts` a Finding's reaction signal, `dedupe.ts`
  the content hash and near-duplicate pass, `fetch.ts` the content fetch for a Resource to score, `score.ts` the scoring
  and the finding writes, each Resource reserving its largest cost before its paid section, `track.ts` what became of
  each Resource, `summarize.ts` the scan report, and `index.ts` the stage over them, with `reviewTestFixtures.ts` beside
  their tests). `chat/` — Carl's streamed chat replies (`index.ts` streams a reply, `podcastReply.ts` streams a podcast
  question's reply as one structured call whose speaker, `host` or `cohost`, comes before the answer, `chatMessages.ts`
  shapes a conversation into the model messages a turn sends, `chatPrompts.ts` builds each chat's system prompt from its
  template, `podcastEpisodeQuestionPrompt.ts` the topic chat prompt's blocks for a question asked from the podcast
  player, `search.ts` the live web search tool a signed-in chat turn may call, and `agreement.ts` checks whether a
  user's message agrees to the proposal it answers, reading only the user's words and the proposal, `chatTurnCost.ts`
  the largest cost of one chat turn, which the api reserves before the turn runs, with `chatModelTestFixtures.ts` for
  the fake models their tests stream from, and `chatContextTestFixtures.ts` and `podcastEpisodeChapterTestFixtures.ts`
  for the chat context and the chapter their tests read) and their retrieval (`retrieve.ts`, whose topic ranking
  collects the topics' findings in a materialized common table expression and ranks that set, `retrieveDocs.ts` for the
  docs sections a question about the app reads and `embedRetrievalQuery`, which embeds a question or a search query with
  the query instruction, `retrieveTeam.ts` for a team chat room turn's context, and `retrievePodcastEpisodeChapter.ts`
  for the chapter a podcast question was asked during, with its lines and its Finding). The prompts the builders fill
  live in `@carlnotes/models/prompts/`, and every model call goes through `@carlnotes/models/models` on a key from
  `@carlnotes/models/litellm`. `favicons.ts` — a host's favicon, fetched once when review reads a page on it.
- Every scan stage charges the Scan's one Budget, `@carlnotes/models/budget`.
- `notify.ts` plans a topic scan email's batches and sends one batch or one report, recording the accepted sends with
  the Scan's id, so a retry never mails anyone twice; the worker's `sendScanEmail` workflow runs it.
  `scanEmailContent.ts` holds what a Scan's email says: the props the topic scan email and the report render from, and
  one subscriber's rendered message, over the templates and `sendEmail` in `@carlnotes/emails`.
  `loadTopicScanEmailSubscribers` is the one recipient query, an active subscription with email on whose subscriber
  can still read the Topic (on a private Topic, its owner and its teams' members through `toTopicRoleFilter`), and
  `toTopicScanEmailSubscriberIdsQuery` is the same set as a subquery, which the Topic push joins, so unfollowing,
  turning a Topic's email off, or losing access stops both deliveries.
- `pushNotify.ts` picks each kind's recipients and passes their phones to `pushDelivery.ts`, which sends through
  `@carlnotes/server/expoPush`, one push per live phone (its session not expired, its account's preference for the
  kind true). `sendScanPush` reaches a succeeded Scan's topic scan email recipients if the Scan kept
  new Findings, and `sendChatMentionPush` reaches the members a room message's `room_mentions` rows name, checked at
  send time: still on the Team, the Topic still held, the author not blocked, the message not reported, never the
  author. Each push names its Topic or room and opens it through `data.url`, with the recipient's id for the app's
  account check, and a mention push never includes the message text. `pushDelivery.ts` sets each push's app icon badge to
  the recipient's update count from `@carlnotes/db/updateCounts`, loaded per chunk for that chunk's recipients alone,
  and a count that fails to load is reported and leaves that badge out instead of failing the push. `pushNotificationCopy.ts` holds the words. In
  `pushDelivery.ts`, each accepted ticket is recorded in `push_notification_sends` as its chunk returns, so a retry
  sends only to unrecorded
  phones; a crash between the service's acceptance and the record repeats at most one chunk. A `DeviceNotRegistered`
  ticket deletes the phone, `MessageRateExceeded`, `ExpoError`, and `ProviderError` tickets and a 429, 5xx, or
  unanswered request are retryable, and anything else is final. A chunk the service rejects for mixing Expo projects
  (`PUSH_TOO_MANY_EXPERIENCE_IDS`) retires the tokens of every project other than `MOBILE_APP_EXPO_PROJECT_NAME` and
  is sent again, and any other rejected chunk is kept as the send's error while the later chunks still go. A send
  takes a `PushProgress`, which the worker's activity turns into a heartbeat after each chunk and a stop between chunks
  once Temporal cancels the attempt. `pushReceipts.ts`'s `checkPushReceipts` reads an
  event's receipts once the workflow's wait ends, records them with one write per outcome, retires `DeviceNotRegistered`
  phones, and reports any
  other code, a missing receipt included, without the token. The service's limits: 100 messages per send request,
  4096 bytes per payload, 600 notifications a second per project, receipts in chunks of 300, usually ready within 15
  minutes and kept for 24 hours. The SDK retries a 429 itself.
- `podcast/` — the steps of the worker's `recordPodcastEpisode` workflow. `planPodcastEpisode.ts` runs the checks that
  stop a recording before it spends anything, inside one request memo, picks the Findings, and marks the podcast
  episode short on a free Topic or past the billed user's full podcast episodes cutoff.
  `podcastEpisodeSharedComments.ts` takes the comments shared with the podcast by reactions, runs the classification on
  them, and places each one in a chapter or the closing turns. `writePodcastEpisodeScript.ts` writes and saves the
  script. Each segment's prompt lists its chapters' shared comments, and the last segment's also lists the closing ones.
  `generatePodcastEpisodeScript.ts` makes its outline and segment calls on `score-model`, and `podcastEpisodeHosts.ts`
  writes the hosts block that those prompts and the podcast question's chat prompt splice. `podcastEpisodeOutline.ts`
  holds the outline's shape and checks each outline draft, and `podcastEpisodeScript.ts` holds the segments' shape,
  checks each segment draft, and builds the script, with `podcastEpisodeScriptFixtures.ts` for their tests.
  `podcastEpisodeAudio.ts` records each chapter through `@carlnotes/models/speech`, stores its audio in object storage,
  and joins the chapters with ffmpeg. `podcastEpisodeTheme.ts` mixes the theme song's intro and outro under the talk in
  that same pass, from the clips committed in `assets/podcast/`, and shifts the chapter times by the intro's lead.
  `publishPodcastEpisode.ts` publishes or fails the row, and a short podcast episode's publish replaces the Topic's
  earlier short ones. `removePodcastEpisode.ts` removes a Podcast Episode and deletes its audio and its vector.
  `podcastEpisodeChapters.ts` gives a new Finding the newest rating of the chapters that narrated its Resource, and
  links those chapters to it. The review's `upsertFinding` calls both. `podcastEpisodeSmokeFixtures.ts` seeds the rows
  for the worker's podcast episode smoke.
- `podcast/podcastEpisodeImage.ts` draws a published podcast episode's own image from its title, description, topic
  tags, and chapter titles, in the topic image's house style and at its sizes, billed with the episode. The root
  `podcast-episode-images:backfill` script draws one for every published podcast episode that has none.
  `podcast/podcastEpisodeImageRenders.ts` reads a podcast episode's scene input for a render, replaces its image (the
  hash, the origin, the image prompt, and the old files' pending deletions), and removes an upload.
- `topicImages/` — the steps of the worker's `renderTopicImage` workflow. `writeTopicImageScene.ts` has the prompt
  writer's input (the topic's name, prompt, tags, and up to five finding titles, fenced as untrusted) and the image
  prompt with the house style appended. `renderTopicImageOriginal.ts` draws a scene through the image model and returns
  the 3:2 original, or throws a `TopicImageRenderFailure` naming whether the budget is spent, the render was rejected,
  or another attempt is worth it. `topicImageFiles.ts` decodes an upload by its bytes under a pixel limit, center-crops
  to 3:2 with sharp, derives the three sizes at 1x and 2x as webp, and stores them under the original's hash.
  `topicImageRenders.ts` writes a render row, naming a podcast episode for one that draws its image, and starts its
  workflow, replaces a topic's image (the row, `topics.image_hash`, and the old files' pending deletions), removes an
  upload, and marks a render failed; a change to a public topic's image purges its files at the edge. `topicCovers.ts`
  drops a topic's cached podcast feeds and the stored covers drawn over its image after a change.
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
-  Untrusted text reaches a model only inside the prompt writer's nonce fence, and a user-supplied url goes through
  `fetchPublicUrl` in `@carlnotes/server/publicFetch`. Content safety starts at ingest: the Reddit, X, and Bluesky
  ingesters skip a post their platform marks adult or sensitive, and the scorer's `isUnsafe` marks a Resource that gets
  no new Finding. `scrape.ts` reads a reddit thread from reddit's own api and scrapes any other page through Firecrawl,
  `transcripts.ts` reads a video's captions from YouTube, Vimeo, or Dailymotion and a declared transcript over that
  path, and `linkPreview.ts` reads a chat link's preview on it.
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

`personalSources/contextWriter.ts` is the bounded private model writer used by summarization and the synthetic context eval. Each sender has a separate context, and the Topic owner pays for summarization. The eval never reads real entries.

`personalSources/scoreResource.ts` writes a page-grounded public explanation and isolated sender annotations in one redacted call per sender. `review/saveFinding.ts` commits both layers atomically after sender revision checks. Public reports and podcast inputs use the public fields only. `podcast/podcastPersonalSourcesMigration.ts` blocks only unconverted legacy output.

Personal sources items, private summaries, and annotations have no automatic expiry. Their content remains encrypted until explicit deletion. Released read contracts retain nullable expiry fields as null. Optional conversation URLs survive the MCP picker outside matching and open from the shared AI sender label; missing references remain plain labels.
