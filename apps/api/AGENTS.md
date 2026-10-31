# apps/api/

Hono server, the `@carlnotes/api` app. Entry `apps/api/index.ts` mounts the route trees; `apps/api/api.ts` aggregates
the `/api` routes and bounds every body at a megabyte through `toBodyLimit` in `bodyLimit.ts`, except on the chat,
transcription, upload, and note body save routes, which set their own limits. No app imports it as a value:
`@carlnotes/client` and `apps/web` read `AppType` and the `auth` type from it as types only, and `evals/` and `scripts/`
at the root import it by name.

- `index.ts` opens each request's memo (`@carlnotes/db/requestMemo`) in its first middleware, and its `onError` reports
  an error no route handles to Sentry and keeps Hono's 500. `requestTracing.ts` runs next: it counts the request's
  queries and cache reads, names a traced request's Sentry transaction by its route and attaches its query count, the
  connection pool's counts, and the event loop's lag, and outside production sets a `Server-Timing` header with the
  duration and the counts. In dev it also logs one line per request with the same numbers and the cache keys that
  missed. `queryBudgets.test.ts` holds the cached routes' query budgets, each a route requested twice against the
  connection pool and Redis stubs. `index.ts` also serves `/api/health`, which the platform polls and which sends no
  query, `/api/health/deep`, which runs one query and returns the connection pool's counts for a monitor, and
  `/api/health/ready`, the readiness probe, which renders the privacy page through `uiServer.ts` with no cookie and
  responds 503 with a reason if it cannot, reusing one render for five seconds, tested in `readiness.test.ts`. None of
  them looks up a session. After them, `appVersionGate.ts` runs on every `/api` path ahead of the session lookup: a
  request whose platform header is `ios` or `android` and whose app version is below that platform's minimum is
  rejected with 426 and the minimum and the store url, and every other request passes. The minimums live in
  `mobileMinimumVersions.ts`: one row per platform in `mobile_minimum_versions`, read through a one-minute Redis
  cache, none on any failure, and written from the admin console. `contractFixtures.ts` holds, for each
  fixtured route contract key, the route, the user, the request, and the stubbed rows that
  `contractCompatibility.test.ts` sends through the registered routes in-process; only tests import it. `index.ts`
  responds with a json 404 to a path with a NUL byte, percent-encoded or decoded, ahead of every route. Its tests
  split between `index.test.ts`, for the routing, the health checks, the api's own validation, and the security
  headers, `pageRender.test.ts`, for the rendered pages, and `pageGuards.test.ts`, for the click id redirect and the
  render limit, over the fake bundle and requests in `indexTestFixtures.ts`.
  `index.ts` serves the docs site's static
  build from `apps/docs/dist` at `/docs`, stripping the prefix to find a file, and the web app's browser bundle from
  `apps/web/dist/client`. `nightshift.ts` serves the Nightshift component browser's static Storybook from
  `apps/web/dist/nightshift` at `/nightshift/`. It sets its own frame policy, opener isolation, and `noindex`, gives
  every fixed-name file an `ETag`, and caches only its hashed assets immutably, tested in `nightshift.test.ts`.
  `index.ts` renders every other page through `uiServer.ts`, which imports the web app's server build in
  `apps/web/dist/server`, the paths `bundlePaths.ts` names, before the api serves. With `NODE_ENV=production`, a boot
  that cannot import the build reports the error in the `startup` stage and exits before it listens, tested by booting
  the entry in `uiServer.test.ts`. A page render sets the `DEGRADED_RENDER_HEADER` from `@carlnotes/contracts/seo` if a
  required read fails, and that page returns a 503 with a `Retry-After`, is reported, and is never cached at the edge.
  Any other page rendered with a 5xx status is reported in the `page-render` stage too.
  Ahead of a page render, `index.ts` limits a visitor's origin requests by address through `rateLimit.ts` and redirects
  a page url with a click id (`fbclid`, `gclid`, and the like) permanently to the url without it, which is the one the
  edge caches. `uiServer.ts` sheds a visitor's render past `RENDER_CONCURRENCY` with a 503 and a two-second retry while
  the edge serves its stale copy; a signed-in render is never shed. Every response includes the content security policy,
  `Referrer-Policy`, and `X-Content-Type-Options`, and an unhashed public file from the ui bundle is cached an hour in
  the browser and a day at the edge under the `rendered` tag. `contentSecurityPolicy.ts` holds
  `BASELINE_POLICY_DIRECTIVES`, the directives every policy ends with: `object-src 'none'`, and `base-uri` and
  `form-action` on this origin. Its `toContentSecurityPolicy` builds a policy from a route's own directives and the
  baseline, for the default policy in `index.ts`, `nightshift.ts`, and `favicons.ts`. It also holds
  `FRAME_SOURCE_DIRECTIVE`, the frames a page may load: this origin, YouTube's privacy-enhanced player, and Cloudflare's
  Turnstile challenge. The default policy and the component browser's policy both use it, so a story frames what the app
  frames. `responseHeaders.ts` holds `NOINDEX_HEADER`, the `X-Robots-Tag: noindex` header that `documents.ts` and
  `nightshift.ts` set.
- Domain folders: `topic/`, `team/`, `chat/`, `invite/`, `note/`, `podcast/`, `share/`, `tool/`, `mcp/`. Root files
  serve more than one domain (auth, billing, admin, avatars, favicons, profiles, SEO, `likePattern.ts` for the contains
  pattern the name and text searches match with, `canonicalJson.ts` for the json a keyed digest signs, `content.ts` for
  the blog under `content/blog/`, and `seed.ts`, the entry behind `bun run db:seed` over `@carlnotes/db/seed`).
  `apiPageStyle.ts` holds `API_PAGE_BASE_STYLE`, the body and link rules in the emails' palette that the api's own pages
  start with: the pages `content.ts` renders and the unsubscribe page in `unsubscribe.ts`. `billingRoute.ts` holds the
  billing routes over `billing.ts` (Stripe) and `storeBilling.ts` (the App Store and Google Play through RevenueCat);
  its Stripe webhook responds 400 to a bad signature and its RevenueCat webhook to a missing or wrong Authorization
  value, and each 500 to a verified event it could not apply, so the provider retries it. `storeBilling.ts` re-reads the
  RevenueCat customer an event or the app's store sync names and projects it, counting a sandbox purchase only in dev
  and for the ids in `REVENUECAT_SANDBOX_USER_IDS`, and deletes the customer when the account closes. It reaches a
  customer by the user's random `revenueCatAppUserId`, never the user id. Both providers write the one billing row
  through `billingProjection.ts`, where a row from another provider stays unless the new plan ranks higher, and a Stripe
  subscription that a higher store plan replaces is set to cancel at its period end. `stripeClient.ts` holds the Stripe
  client that `billing.ts` and `billingProjection.ts` call. Stripe checkout responds 409 to a store subscriber.
  `storeBillingTestFixtures.ts` holds the RevenueCat customers and the stubbed sync the store billing tests share.
- `documents.ts` — the document routes: the sitemap, the site and topic feeds, the llms files, the IndexNow key,
  security.txt, and the two domain association documents the stores verify app links against,
  `/.well-known/apple-app-site-association` from `APPLE_TEAM_ID` and `/.well-known/assetlinks.json` from
  `ANDROID_SIGNING_FINGERPRINTS`, each 404 while its value is unset. `seo.ts` builds what they read, and `jsonLd.ts`
  the JSON-LD the topic page head includes. The blog and docs Markdown (`apps/docs/src/content/docs`) are read through
  `ttlCache.ts`, which keeps the parsed pages for a minute, so a new file appears within that minute without a restart.
- `share/pageHead.ts` — the `/api/<page>/:id/head` routes that return a topic, profile, team, or invite page's
  `PageHead`, which each ui route's `head()` turns into tags.
- `releases.ts` — the `/releases` index and each release's own page, both
  rendered through `content.ts`, plus the signed GitHub webhook that upserts the rows they read.
  `releases.sync.ts` (`bun run sync:releases`) re-reads the GitHub API through the same write, which
  seeds history and repairs a missed delivery, and `releases.preview.ts` (`bun run releases:preview`) stores a
  local notes file through it for reading on the dev server. The convention for writing one is
  `apps/docs/release-notes.md`.
- `note/` — the tasting-notes routes: `notes.ts` (a page's note list, the create, the badges, the read that returns
  the body's html and version, the rename and visibility change, the delete, and the save, `PUT /api/notes/:id/body`
  at `NOTE_BODY_PATH`: it rejects a visitor with a 404 before reading the body, bounds the body at
  `NOTE_HTML_MAX_CHARS * 4 + 1024` bytes so any UTF-8 encoding of a body at the limit fits, validates `noteBodyPayload`,
  requires `canEditNote`, sanitizes the html, and writes one conditional statement where the id and the version match,
  raising the version and saving `last_editor_user_id` and `body_edited_at`; an unchanged body writes nothing and
  returns the stored version, and a moved version returns a 409 with the version and who saved last), `noteHtml.ts`
  (`sanitizeNoteHtml`, `sanitize-html` over the editor's own tag set: `p`, `br`, `b`, `i`, `u`, `s`, `code`, `a` with
  an http, https, or mailto `href`, `h1` to `h6`, `ul` with `data-type` only when it is exactly `checkbox`, `ol`, `li`
  with `checked`, `blockquote`, and `codeblock`; images, scripts, styles, mentions, and unknown tags are dropped with
  their text kept, and the editor's empty document is stored as `""`), `noteComments.ts` (the comment thread:
  `GET /api/notes/:id/comments` behind view access, oldest first, each with its author, or null for a closed account,
  and whether the caller may delete it; `POST /api/notes/:id/comments` behind `canEditNote`, tracking
  `note_comment_added` with the note id; `DELETE /api/notes/:id/comments/:commentId` for the author alone; every
  rejection a 404 and a bad body a 400 before any query), `notePayloads.ts` (a page's note list, one note as the api
  shapes it, and a note created on a page), `permissions.ts` (visibility access), `noteBadges.ts` (the unread edit and
  comment counts, the comments counted from `note_comments` by note, and the read time that clears them), and
  `noteTestFixtures.ts` (the rows the stubbed connection pool returns in the route tests).
- `chat/roomStream.ts` fans a stored chat message out across replicas over Redis pub/sub through `@carlnotes/db/redis`.
  It delivers to its own instance's subscribers first, publishes a payload that names the instance, and skips the echo
  of its own publish. Nothing missed while a subscriber was down is replayed. Chat catches up from its cursor.
  `chat/roomEvents.ts` serializes catch-up and live SSE deliveries. It checks the original session and current room
  access before each delivery and on heartbeats, closing the connection when access ends.
- `mcp/` — the mcp server on `@modelcontextprotocol/server`: `server.ts` (the `/mcp` and `/mcp/t/:topicId` routes and
  the web-standard transport), `tools.ts` (the reads, the site search, and the per-user writes it registers, with their
  schemas and annotations), `topicEditTools.ts` (`edit_topic`, `suggest_sources`, and `create_topic`), `toolShapes.ts`
  (the topic id argument, the registration options, and the result shapes every tool shares), `topicEdits.ts` (the
  `edit_topic` flow: the topic read as its page reads it, the preview, and the save through the chat's save path),
  `topicEditConfirmations.ts` (the keyed confirmation that making a topic public or removing a source needs),
  `searchResults.ts` (what the `search` tool returns, under the search rate limit), `cards.ts` (the three MCP Apps card
  resources, each html written from the bundle `build:ui` makes in `apps/web/dist/mcp-cards`, and the `_meta` a tool
  names its card with), `cardData.ts` (what a tool result gives its card in `_meta`: the caller, the podcast episodes
  with play tokens, and the findings card's topic and findings), `toolCaller.ts` (the tool caller: the visitor or user
  an access token resolves to, verified in-process against the auth server's signing keys), `oauthClientNames.ts` (the
  registered name of each MCP client, which the tool caller, the consent page's route, and the app connection report
  read), `results.ts` (what the finding tools return for a visitor or a user, paged under a client's result limit, and
  the paging helpers), and `topicResults.ts` (what `list_topics` returns). `mcp.smoke.ts` runs the sections in
  `mcpSmokeSections.ts` and the oauth flow in `mcpOAuthSmokeSections.ts` over the fixtures in `mcpSmokeFixtures.ts`,
  and stops the first scan of the topic it creates through `topic/firstScanSmoke.ts`.
- `podcast/` — a Topic's podcast episodes: `podcastEpisodes.ts` (the routes for a season's episodes, an episode page,
  the next unplayed episode, one episode with its files and its preview card, a listener's progress, a chapter's rating,
  the podcast switch, and removing an episode), `podcastEpisodeListens.ts` (saving a listener's progress, with a
  playback start counted among the listeners, and finding their next unplayed podcast episode), `podcastEpisodeRows.ts`
  (the episode row reads, the episode view rules in SQL, and the subscription activation gate that limit each read to
  what the user may listen to), `helpers.ts` (the page reads over them: the topic page's podcast, a season's episodes,
  and a podcast episode page), `podcastEpisodeShapes.ts` (an episode as the player shows it, with its chapters, and as a
  table row shows it, with its chapter count, and each topic's latest of either: the home feed reads full episodes, and
  every table row and its play button read summaries), `podcastSeo.ts` (the public episodes that the sitemap and
  llms.txt list, and the PodcastSeries and PodcastEpisode structured data that `seo.ts` and `share/pageHead.ts` read),
  `podcastEpisodeFiles.ts` (the audio, chapters, and transcript responses), `podcastFeedTokens.ts` (a listener's feed
  token, and building, caching, and responding with a feed, or a 304 for a current copy), `podcastFeeds.ts` (a
  listener's feed url and its reset, an episode's files at paths after a feed token, and the covers),
  `relatedPodcastEpisodes.ts` (the rows of an episode page's Other episodes and Similar podcasts tables: the topic's
  other published episodes that the user may listen to, and the most related published episodes of other topics. The
  public shown topics' episodes rank through the index of the episode vectors saved as public and shown, cached in
  Redis. A user's own, the episodes they may listen to through their account, are scored for them without an index on
  every load. Both merge by score, and every read checks each episode again), `podcastEpisodeSearch.ts` (the site
  search's episode reader: title and description matches through trigram indexes, then for a query of three characters
  or more the nearest by meaning over the episode vectors, under the episode view rules. The query's vector is cached
  in Redis by its lowercased words and billed to the user's key or the public key, a visitor's embeddings are rate
  limited per address, and a search that may not embed returns its text matches), and `playTokens.ts` (the play token
  an mcp card's audio url includes, which the audio route reads in place of a session).
  `share/podcastFeed.ts` builds the feed, `share/podcastCover.ts` draws the covers over
  `apps/docs/design/podcast/cover-base.png`, and `share/podcastEpisodeImage.ts` draws an episode page's link-preview
  card. `documents.ts` serves a public Topic's feed at `/topics/:id/podcast.xml` and a listener's own at
  `/podcast-feeds/:token.xml`.
- `tool/` — the Topic Tools, each with its own gate check: `topicTools.ts` (the prompt and field updates),
  `topicEditSaves.ts` (a topic edit's saves in order through the Topic Tools, which the chat applies an agreed proposal
  with and `edit_topic` its edit),
  `topicSourceTools.ts` (adding and removing a source, and what one more costs; removing keeps the topic's web search,
  which only the editor turns off, and its last source), and `topicDraftTools.ts` (creating a topic from a draft and
  suggesting its sources). The chat adapters are `chatTools.ts` (the preview tools a chat binds on a topic, the saves
  the server applies once the user's next message agrees, and the wording every adapter and the topic chat tools eval
  share) and `newTopicChatTools.ts` (the new-topic chat's draft tools). The mcp adapter is in `mcp/tools.ts` and
  `mcp/topicEditTools.ts`.
  `topicTools.smoke.ts` runs `topicUpdateSmokeSections.ts`, `topicSourceSmokeSections.ts`, and
  `topicDraftSmokeSections.ts` over `topicToolsSmokeFixtures.ts`, and stops the first scan of the topic it creates
  through `topic/firstScanSmoke.ts`.
- `topic/saveTopicGate.ts` — the Terms and moderation check a topic other people read passes before a save, skipped
  for a private topic and, on an edit that changed neither the name nor the prompt, not classified again.
- `topic/helpers.ts` — the topic page's reads; `topic/saveHelpers.ts` — the daily slot a frequency takes, a topic's
  new source rows, and its first scan; `topic/firstScanSmoke.ts` — the smoke helper that waits for a created topic's
  first scan to reach Temporal, then stops it and waits for its workflow to end; `topic/teamTopicOptions.ts` — the
  topics a user may add to a team; `topic/accessibleFindings.ts` — the findings a user may read on a topic, with the
  owning team's bookmarks.
- `topic/findings.ts` — the finding routes, and `topic/findingFeedback.ts` — the feedback a user gives a finding: the
  rating and its words, the bookmark, consumed, and an open, which counts among the finding's views within the count
  rate limit, a visitor's too when it comes from the app's own origin. `topic/findingPermissions.ts` holds who may see,
  rate, and bookmark a finding, and `loadTopicFindingPermissions`, the rate and bookmark rules for many topics in two
  reads.
- `counts/` — the viewer and listener counts: `countsRoute.ts` (`POST /api/topics/:id/view`, the view a topic page
  sends, counted only from the app's own origin and returning 204, and the `/api/counts/` reads of a topic's viewers
  and followers and a podcast episode's listeners), and `viewerCounts.ts` (counting a topic view or a podcast episode
  listener into its Redis counter, skipping a crawler or an unfurler, and reading a count as the larger of the counter's
  estimate and the saved column). The audio routes in `podcast/` and a playback start count a listener through it.
  `countWithinRateLimit` limits the topic view and the `/episodes/:id/audio.mp3` listen to 30 a minute per sender.
- `sameOrigin.ts` — `isSameOriginRequest`, true if the request's `Sec-Fetch-Site` header is `same-origin`, or with no
  such header, if the mobile app's `x-carlnotes-platform` header names ios or android, or if its `Origin` header is the
  app's origin. The api serves no CORS headers, so a browser on another origin cannot add the platform header.
- `topic/promptVersions.ts` — the Prompt Version write the editor's save and the Topic Tools share.
- `topic/topicTableRows.ts` — `toTopicTableRows`, the topic table rows that the profile page and the team page share,
  each with its latest Podcast Episode.
- `topic/relatedTopics.ts` — `loadRelatedTopics`, the up to fifty other Topics most related to a Topic that the user
  may open, each with its latest Podcast Episode. The public shown ones are scored over candidates from an iterative
  scan of the public and shown HNSW index, and their ids and scores are cached in Redis for fifteen minutes. The Topics
  a user may open through their account are scored for them without an index on every load. Both merge by score, and
  every read checks each topic against the user's view rules again, so one the user may no longer open leaves at once. A
  topic page poll reload skips this read, and the page keeps the ones it loaded.
- `topic/relatedness.ts` — what both related reads share: `loadEmbeddingCentroid`, the current model's average
  resource embedding cached in Redis for a day, `toRelatedScore`, the centered cosine distance less a bonus for each
  shared tag, the score limits, the candidate count, `loadRelatedIds`, the public ranking cached in Redis merged with a
  user's own, `toMergedRelatedIds`, and `toRowsInIdOrder`. The related reads' tests store its centroid through
  `relatednessTestFixtures.ts`, and build episode rows through `podcast/podcastEpisodeTestFixtures.ts`.
- `topic/topics.ts` — the topic page read, whose scan costs, month's cost, and attachment details go only to a user
  the gate grants `topic:viewOwnerDetails`, the owner or an admin; `topic/saveTopic.ts` — the create with its default
  Sources and invites, and the update with its changed-field events, and `saveTopicVectorsOnVisibilityChange`, which
  the update and the topic tools call to save the topic's vectors again after a visibility change, as
  `topic/findingFeedback.ts`'s `setRating` does after a rating; `topic/topicsRoute.ts` — the topic routes over them,
  which serve a visitor's topic page from one Redis copy for half a minute and limit source suggestions like a tool
  caller. Its `DELETE /api/topics/:id/sources/:sourceId` removes one Source through `removeTopicSource` with the
  `editor` origin: 204 once the Source is gone, 404 for a topic the user cannot see or another topic's Source, 403 for a
  user or a visitor who may see the topic but not edit it, and 409 naming `webSearch` or `lastSource` if a rule keeps
  the Source; `topic/deleteTopic.ts` — the delete, one transaction over every row a topic owns with its object keys
  recorded.
- `topic/scans.ts` — starting and stopping a manual Scan, and `GET /api/scans/:id`, one Scan's recap and source
  results behind `topic:view`. `toSourceResultsView` parses the stored results, returns null for a missing or
  malformed value, keeps only the `ok`, `fallback`, and `failed` results, and copies each wire field by name. For
  everyone the gate does not grant `topic:viewOwnerDetails`, it nulls each cost and failure reason and labels a url
  Source by its page's host.
- `topic/feeds.ts` — the topic feed's sections; the visitors' feed and topic page, each read through one Redis copy
  for half a minute; `clearVisitorTopicCaches`, which a topic's edit and delete and a Source added or removed call to
  drop its page copy, and the visitors' feed copies if the listing changed; `clearVisitorTopicPages`, which a team
  attach or detach calls; and `clearSharedTopicFeedCaches`, which drops the feed copies with the featured and popular
  topic id lists; `topic/feedData.ts` — the batched reads behind every topic in a feed, each table read once for the
  whole batch.
- `chat/room.ts` — posting to a chat room and its stream. A chat message that addresses Carl reserves his turn's largest
  cost before it posts, priced from the room's stored question by `loadModelRoomQuestionChars` in
  `chat/roomQuestion.ts`, which sums stored lengths in the database through `toDecryptedLengthSql` in
  `chat/encryption.ts`, and a budget that the spend and open reservations have reached is rejected privately. Both post
  routes are under the tool callers' rate limit; `chat/roomRoute.ts` — the chat room routes; `chat/roomAccess.ts` — one
  chat room, the member's access to it, and the topic side of a chat room filter; `chat/roomDeletes.ts` — clearing a
  room and deleting one message or shared file.
- `chat/privateChat.ts` — the private chat routes, each post rejecting a signed-out visitor through
  `toSignedOutRejection` in `bodyLimit.ts` before the body is read; `chat/chatTurnAnswer.ts` — answering an allowed
  private chat turn: its podcast episode chapter, attachments, the reservation of its largest cost, which rejects a turn
  before any model call once the spend and open reservations reach the budget, its proposal, tools, and streamed reply;
  `chat/chatTurnAuthorization.ts` — whether a user may take a chat turn on a topic, in a team chat, or in the new-topic
  chat, `toChatRejection`, the response each rejected status gets, which the private chat routes, the voice routes, and
  the chat attachment delete share, and `rejectChatTurn`, which also counts a budget rejection; `chat/chatTurnStream.ts`
  — streaming a chat turn's reply, saving its row, then releasing its reservation; `chat/chatProposals.ts` — the change
  Carl previewed in a private chat, recorded in `chat_proposals` as a keyed digest that holds none of the preview's
  text, taken by the user's next message on that page, and applied by the server through the topic tools or the create
  path only if it matches its record and the agreement check reads the message as agreeing. No chat binds a tool that
  saves a topic change or creates a topic. `chat/roomProposals.ts` — a topic's team chat room preview, kept encrypted in
  `chat_proposals` for the member it was shown to, taken by that member's next message to Carl, and applied the same
  way, so no other member's yes saves it. A topic chat turn may be a question asked from the podcast player, which names
  its podcast episode and chapter: the route responds 404 before any model call unless the chapter is on the topic's
  published podcast episode, and the chat turn's row is a `podcast` row with the answering speaker. `chat/roomTurns.ts`
  — Carl's chat room turn, and `chat/roomQuestion.ts` — the question it is asked, from the chat window and the room's
  summary and files, with `toChatRoomTranscriptLine` and the empty placeholders that the topic chat tools eval shares.
  `room.smoke.ts` runs `roomSmokeSections.ts` over `roomSmokeFixtures.ts`.
- `chat/voiceRoute.ts` — the voice routes: `GET /chat/spoken-questions` says whether the user's spend is past the spoken
  questions cutoff, and the rest each name their chat page in the request. `POST /chat/transcription` rejects a
  recording past that cutoff with a 402, then transcodes a spoken question's recording through ffmpeg, at most 4 at once
  in the process with a 503 and a Retry-After past that, transcribes it on the user's key, and records the spend as a
  text-less chat turn row, or returns an empty transcript with no row for a recording with no samples; `POST
  /chat/speech` speaks one spoken part of a reply on the user's key in the voice of the speaker who gave it, under the
  speech rate limit and at most 3 spoken parts in progress per user with a 429 past that, and returns the MP3, or the
  WAV if the encode failed; `POST /chat/spoken-events` counts a spoken question's timings and a play tap, under the
  spoken events rate limit. The transcription and each spoken part reserve their own largest cost before the model is
  called, are rejected with a 402 once the spend and open reservations reach the budget, and release it after the spend
  row. A failed model call other than a spent budget is reported to Sentry under a fixed message per model call and
  outcome. `chat/voiceAuthorization.ts` — whether a user may talk to Carl on that page: a private page asks its chat
  turn's gate, and a chat room asks membership and the monthly spend gate; and the access check that a spoken event
  asks, which reads the page's visibility or membership and no spend sum. The voice route tests share their pages,
  transcription request builder, spies, and recorded spoken answer through `chat/voiceRouteTestFixtures.ts`, and
  `chat/voiceRoute.reservations.test.ts` holds the voice calls' reservation cases.
-  `chat/chatAttachmentParts.ts` — `resolveChatAttachments`, which resolves a chat turn's attachments into what the
  model reads, and the data url helpers; `chat/attachments.ts` — storing the rest and deleting them, with the routes.
  `chat/roomAttachments.ts` prepares a shared file before a post stores and fills an image's description after it, and
  `chat/roomRoute.ts` moderates a shared image before the post through `toObjectionableImageCategory` in
  `moderation.ts`; `chat/chatAttachmentReads.ts` — reading them: the kept ones with their context, a chat turn's own, a
  download, and the object keys behind a user's or a topic's. A chat turn and a chat room post read a PDF's, Word
  file's, or workbook's text through `readChatAttachmentText` in `chat/chatAttachmentParts.ts`, once per file: a kept
  chat attachment stores the text its chat turn read, which the chat turn returns as a `StorableChatAttachment`. The
  helper calls `extractTextInWorker` in `chat/attachmentExtraction.ts`, which runs `extractTextUpTo` in one persistent
  worker thread per process, `chat/attachmentExtractionWorker.ts`, so a large file never stalls the event loop. The
  bytes are transferred to the thread, which reads one file at a time from a queue. A request's files share one
  90-second deadline from `toExtractionDeadline`. A file read past it rejects with `AttachmentTimeLimitError` and stops
  only its own read, and reads as too large: a 413 on a chat turn and `attachment too large` on a chat room post. A file
  that waited behind other files until it rejects with `AttachmentBusyError`, and reads as busy: a 503 on a chat turn
  and `attachment busy` on a chat room post.
- `team/teams.ts` — creating and updating a team and the topic attach and detach; `team/teamsRoute.ts` — the team
  routes; `team/deleteTeam.ts` — the delete, the handover to a new leader, and the one team row delete an account
  close shares; `team/search.ts` — the site search's team reader; `team/teamPage.ts` — the team
  page read; `team/teamsPage.ts` — the teams page read; `team/helpers.ts` — the team summaries, the profile's team
  statuses, the admin's team topics, and the per-team counts and spend they share.
- `search/` — the site search behind the search bar, the search page, and the mcp `search` tool: `search.ts`
  (`searchSite` and `GET /api/search` behind `searchRateLimiter`, which reads each requested kind up to
  `SEARCH_KIND_LIMIT`, ranks the union, and cuts one page), `searchRanks.ts` (the match tiers, the kind order, the
  newest and trending sorts, and the page cut), and `findingSearch.ts` (the finding reader, the resource title or url
  match through `resources_title_or_url_lower_trgm` on the topics the user may open, under the invite gate). The other
  readers are `topic/search.ts`, `podcast/podcastEpisodeSearch.ts`, `team/search.ts`, and `searchUsers` in
  `profiles.ts`.
- `topic/search.ts` — `searchTopics`, the site search's topic reader, which applies the `topic:view` rules in SQL ahead
  of the limit, with each topic's latest podcast episode and whether a signed-in user follows it. A user finds the
  listed topics they may open, and a visitor finds public topics with enough findings. Those rules in SQL live in
  `topic/permissions.ts`: `toTopicViewFilter`, `toTopicAccessFilter`, the topics a user reaches through their account,
  and `toTopicRoleFilter` from `@carlnotes/db/contentFilters`, a topic the user owns or a team of theirs holds. The
  related reads and the episode view rules
  share them. The name searches here, in `profiles.ts`, in `team/search.ts`, and the finding reader read trigram
  indexes, whose plans `searchPlans.smoke.ts` checks beside the chat ranking's, the related reads', and the episode
  search's.
- `topic/topicDrafts.ts` — the new-topic chat's Topic Draft row, written by the chat turn that changed it and read
  back when the conversation loads.
- `botAnalytics.ts` — the middleware that reports what a known crawler, unfurler, podcast app, or feed reader fetched,
  keyed to the bot's name, from the token list in `@carlnotes/contracts/userAgent`. A route that loaded a topic sets
  `analyticsTopic`, and a public topic's id is sent with the event.
- `rateLimit.ts` — the five rate limits: the tool caller limit, shared by the chat turn routes, the transcription
  route, the source suggestions, and the mcp routes, keyed by the user or by the client address; the page render limit
  on a visitor's page renders, which `index.ts` mounts ahead of the blog, release, and ui page renders, keyed by
  address and skipped for a session cookie or an untrusted address; the search limit on the search bar's three
  routes; the speech limit on the spoken parts of a reply, in its own rate limit window; and the spoken events
  limit, in its own rate limit window.
  `trustedProxies.ts` reads that address exactly as Better Auth does: the rightmost `x-forwarded-for` entry outside
  the Cloudflare ranges that `TRUSTED_PROXIES` lists, and logs the warning once if the setting is unset or misses a
  hop.
  Each rate limit window is counted in Redis through `@carlnotes/db/redisRateLimits`, so every replica shares the
  count. While Redis is unreachable the counter counts in this replica's memory, so a caller stays bounded per replica.
- `avatars.ts` — the user and team avatar uploads and the published avatar, and `avatarsRoute.ts` their routes, with
  `POST /api/avatars/decode-failures`, which reports a chosen avatar file that could not be decoded, by its content
  type and byte size, the first five a user sends in a day.
- `edgeCache.ts` — what the edge may cache: a signed-out page, a permanent redirect from a page path, the blog and
  release pages, and the signed-out feed for a minute under the `rendered` tag, a versioned avatar or card for a
  year in the browser and a day at the edge, and a public topic's counts for 30 seconds at the edge through
  `setCountsCacheHeaders`. `setStaticFileCacheControl` caches a file of the docs site or the
  component browser for a year if its name holds a content hash, and has the browser revalidate every other file. A
  user avatar response is tagged `user-avatar:<userId>` and a team avatar response `team-avatar:<teamId>`, and
  `purgeEdgeCacheTagAfterDeletion` purges one tag once an account close or a team deletion has committed, reporting a
  failed purge, logging a skipped one, and never failing the deletion. `purgeEdgeCacheTags` is the purge by tag both it
  and the release job send. `edgeCache.purge.ts` (`bun run edge:purge`) is the deploy job that clears the `rendered` tag
  right after the app deploys.
- `admin.ts` — the admin writes (a user's role and budget override, and a platform's minimum app version) and the admin
  console routes, over `adminConsole.ts`
  (the users and teams tables, the platform totals, and the expandable rows, a topic's subscribers among them) and
  `report/adminReports.ts` (the open content reports, and resolving one by removing its content through the
  content's own delete path or keeping it).
- `report/` — content reports: `report/flagContent.ts` (the `POST /api/flag-content` route, the daily limit in Redis,
  the stored report, and the email to `SUPPORT_EMAIL` with the admin console link), `report/reportSubjects.ts` (what a
  report names, a Topic, profile, Team, chat room message, note, or note comment, each resolved under the same read rule
  that lets the reporter see it), and `report/reports.ts` (writing a report). The filter that hides a reported subject
  from its reporter in the room, comment, and note reads is `toUnreportedFilter` in `@carlnotes/db/contentFilters`.
-  `moderation.ts` — the check every text and image other users see goes through before it is stored:
  `toObjectionableCategory` classifies a text and `toObjectionableImageCategory` an image through
  `@carlnotes/models/moderation`, and each returns the category it violates or null. The image check also returns
  unreadable if the endpoint rejects the image itself. A failed classification fails open with a report that names the
  subject and never the text or the image, and a skipped one is not reported. `toObjectionableContentResponse` is the
  422 the clients turn into Carl's rejection. The room post, note create, rename, and body save, comment post, username
  save, team create and update, and `topic/saveTopic.ts` for an invite or public Topic's name, prompt, and tags all
  check text. The room post's shared images and the user and team avatar uploads check images.
- `termsAcceptance.ts` — the Terms acceptance gate and route: `toTermsOutdatedResponse` is the 403 a user-content
  write gets while the session's accepted version is older than `TERMS_VERSION`, `hasAcceptedCurrentTerms` reads the
  row for a write with no session, and `POST /api/users/me/terms-acceptance` records the published version and
  refreshes the user's sessions. Better Auth's user-create hook in `auth.ts` records the version on every sign-up path.
- `userBlocks.ts` — one user blocking another: the block, unblock, and list routes' functions.
  `toUnblockedAuthorFilter` in `@carlnotes/db/contentFilters` keeps a blocked person's rows out of the blocker's reads.
  `chat/roomVisibility.ts`
  applies the report and block filters to a room's loaded messages for one member, after the shared load.
  `loadAdminTopicSubscribers` lists a topic's subscribers by `isActiveNonOwnerTopicSubscription`, the rule
  `topic/subscriberCounts.ts` counts with.
- `pushDevices.ts` — the push routes, behind `pushDeviceRateLimiter`. `POST /api/push-devices` binds a phone's Expo
  push token, at most 256 characters, to the caller's session, taking the row over from any other account or session,
  removes the session's previous token after a rotation, keeps the account's ten phones seen most recently, and turns
  on each push preference the user never chose (`users.is_topic_push_enabled` and
  `users.is_chat_mention_push_enabled`, null until the first grant), rewriting the sessions that return them.
  `DELETE /api/push-devices` removes a token only for the caller's own session. `POST /api/users/me/push-preferences`
  saves one kind on or off. Ending the session or closing the account deletes the phone's row by cascade, which
  `auth.test.ts` keeps true by pinning `preserveSessionInDatabase` unset. The session middleware in `api.ts` sets the
  session's id beside the user, read through `currentSessionId`. A room post whose `saveChatMentions` wrote rows starts
  the message's push workflow through `startChatMentionPushWorkflow` without awaiting it, and a failed start is
  reported under the `push` stage.
- `activity.ts` — the activity page and its route, over `activityTopics.ts` (each topic's month scans, counts, chat
  mentions, and latest podcast episode).
- `invite/invites.ts` — the invite links, the topic or team a token opens, and the link routes;
  `invite/inviteAcceptance.ts` — accepting an invite: the token acceptance, the topic and team acceptances, the
  spent use, and `loadUserEmail` with `toInviteAddressedToUserFilter`, the invitation match by account or verified
  address that `activity.ts` and `invite/receivedInvites.ts` read through. `invites.smoke.ts` runs
  `inviteLinkSmokeSections.ts` and `userInviteSmokeSections.ts` over
  `inviteSmokeFixtures.ts`, and `team/teams.smoke.ts` runs `teamMembershipSmokeSections.ts`,
  `teamTopicSmokeSections.ts`, and `teamPageSmokeSections.ts` over `teamSmokeFixtures.ts`.
  `podcast/podcastEpisodes.smoke.ts` runs `podcastEpisodeSmokeSections.ts`, `podcastFeedSmokeSections.ts`,
  `podcastEpisodePageSmokeSections.ts`, and `relatedSmokeSections.ts` over `podcastEpisodeSmokeFixtures.ts`, and the
  related section seeds its own topics, episodes, vectors, subscriber, and team through `relatedSmokeFixtures.ts`.
- `unsubscribe.ts` — the topic-scan email's unsubscribe link, over the signed tokens in
  `@carlnotes/emails/unsubscribe`: `GET /api/unsubscribe` opens a page with one button and changes nothing, and
  `POST /api/unsubscribe` performs the unsubscribe for the button and for a provider's RFC 8058 one-click, reporting
  which with the request's device properties.
- `auth.ts` creates each new user's LiteLLM key in the user create hook. If the LiteLLM proxy fails or times out, the
  hook reports the failure, and the user is created without a key. The user's first model call creates the key.
  `authEmails.ts` sends the emails Better Auth asks for, and each mail hook in `auth.ts` starts its send through
  `sendAuthEmailInBackground`, which logs and reports a send that throws, and responds at once, so a slow or down
  Resend never holds a signup or a reset request. `/oauth2/register` is limited to 600 registrations an hour per
  address. `auth.ts` composes the MCP OAuth server from the `mcp`, `jwt`, and `cimd` plugins and exports
  `MCP_RESOURCE_URL`, the `/mcp` url every MCP access token is bound to. `authHooks.ts` holds the request hooks
  `auth.ts` passes Better Auth, the breach check and the canonical address before a credential request and the sign-in
  and app connection reports after one, with the Google and GitHub profile mappers.
  `appleProvider.ts` holds Sign in with Apple's options. It signs Apple's client secret, an ES256 JWT, from the four
  `APPLE_*` values at runtime and signs a new one every week. Apple stays off if any value is unset or the key will not
  sign. Its profile mapper returns the stored email of the user who holds the Apple account if an ID token has none.
  `auth.ts` trusts Apple's origin for Apple's posted callback alone. Closing an account in `users.ts` revokes its Apple
  tokens through `revokeAppleTokens`, and a failed revoke is reported without stopping the close.
  `signupGate.ts` holds the single-use token a password signup's gate signs: a five-minute token whose nonce Redis
  records, so one use consumes it and a replay is rejected, and while Redis is down the signature and expiry alone pass.
  The web's gate signs it after the turnstile check, and `setGateCookie` sets it as the cookie the signup route reads.
  `appSignupGate.ts` holds the mobile app's gate beside it: `POST /api/signup-gate/app-challenge` issues a single-use
  challenge, and `POST /api/signup-gate/app` consumes it, verifies the install's proof for its platform, and sets the
  same cookie. `appAttest.ts` verifies an iOS App Attest attestation by Apple's steps over `cbor2` and `node:crypto`,
  against the app id from `APPLE_TEAM_ID` and the bundle identifier, with the development environment allowed in dev;
  its tests build a certificate chain of their own through `appAttestTestFixtures.ts`.
  `playIntegrity.ts` decodes an Android Play Integrity token through Google's api with the service account in
  `PLAY_INTEGRITY_SERVICE_ACCOUNT_KEY` and checks its verdict. The `development` proof passes in dev alone. Each gate
  route is limited to ten a minute per address, and a rejection is reported as a visitor event with its platform and
  reason. `auth.ts` adds Better Auth's `expo()` plugin first, which reads a request's `expo-origin` header as its
  origin, and `toTrustedOrigins` trusts the app's scheme `carlnotes://` everywhere and `exp://` in dev. `authHooks.ts`
  reports a sign-in and a signup from the app as `mobile`, and a native Apple sign-in by its provider.
  `auth.ts` gives Better Auth the Redis store as its secondary storage and keeps sessions in Postgres too.
  A session is read from Redis first, and from Postgres if Redis has no copy or is down.
  Verification values, such as reset links and OAuth state, are kept in both stores and read the same way.
  The session hooks delete a session's Redis copy if Better Auth deletes the session's row,
  or if the session's daily refresh finds no Postgres row.
  `sessions.ts` writes the keys that Better Auth owns where the app changes a user outside Better Auth's routes:
  `refreshSessionUser` after a direct write to the plan, role, username, avatar, or invite access,
  `revokeUserSessions` from the Postgres tokens before an account's row is deleted,
  and `cacheSession` from the session update hook,
  so a session missing from Redis is stored at its next daily refresh.
  An account close is rejected while a configured Redis is unreachable.
- Every authority check routes through `authorization.ts` and the role and plan readers in
  `@carlnotes/contracts/enums` (`isAdminRole`, `isLeaderRole`, `isPaidPlan`, `isPremiumPlan`), with
  `loadMonthlyBudgetCutoffStatus` among the gate's checks, which says whether a cutoff kind is stopped by a spent
  budget, paused, or allowed. A `===` or `!==` on a name ending in role, plan, or tier, or against a role or plan
  literal, is banned across `apps/api` and `apps/web/src` outside the gate (`authorization.test.ts` greps both).
- Request bodies validate with zod payloads from `@carlnotes/contracts/payloads` and
  `@carlnotes/contracts/topicPayloads` via `zValidator`.
- A private or team read the user may not see responds 404, never 403; the invite gate keeps its 403.
- Imports: `@carlnotes/contracts`, `@carlnotes/nightshift`, `@carlnotes/server`, `@carlnotes/db`, `@carlnotes/emails`,
  `@carlnotes/models`, and `@carlnotes/pipeline`, each module by its package path, such as `@carlnotes/models/litellm`,
  `@carlnotes/nightshift/email` for the api's own HTML pages, or `@carlnotes/nightshift/colors` for the share images.
  Never `@carlnotes/worker`, `@carlnotes/web`, or a universal package other than `contracts` and `nightshift`.
- Dev: `bun run dev:api` (doppler, on `PORT`, 3000 by default).
  Tests: `bun test apps/api`; `*.smoke.ts` run under `doppler run`. `testSession.ts` resolves the session lookup as one
  user or as a visitor, builds a route with one user signed in, and builds a json post, and `indexTestFixtures.ts`
  builds the fake ui bundle and the requests the page serving tests send through the composed app; only tests import
  either. `analyticsTestFixtures.ts` holds the analytics properties that the tests, the topic tools, invite, and podcast
  feed smoke tests, and the new-topic chat eval pass where a request's own would go.

Native request telemetry uses `contracts/clientTelemetry` in `currentUser.ts`, auth event hooks, and `requestTracing.ts`. Native requests carry descriptive platform/device/app headers; web requests retain user-agent classification. Sentry request scopes and spans share those dimensions. These headers never participate in authentication or authorization.

The existing authorized episode audio route additionally serves JSON for `Accept: application/json`: the signed
media URL and its expiry. Both representations and denials are private/no-store and vary by Accept. Legacy GET
redirects and HEAD range metadata remain unchanged, including listen counting only on GET. The JSON path uses
the same access gate; platform players never forward a CarlNotes session header to object storage.
