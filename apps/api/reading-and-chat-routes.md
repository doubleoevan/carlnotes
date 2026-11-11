# Reading and chat routes

- `topic/saveTopicGate.ts` — the Terms and moderation check a topic other people read passes before a save, skipped
  for a private topic and, on an edit that changed neither the name nor the prompt, not classified again.
- `topic/helpers.ts` — the topic page's reads; `topic/subscriptionStartDates.ts` — the subscription start dates that
  gate an invite topic's findings; `topic/saveHelpers.ts` — the daily slot a frequency takes, a topic's new source rows,
  and its first scan; `topic/firstScanSmoke.ts` — the smoke helper that waits for a created topic's first scan to reach
  Temporal, then stops it and waits for its workflow to end; `topic/teamTopicOptions.ts` — the topics a user may add to
  a team; `topic/accessibleFindings.ts` — the findings a user may read on a topic, with the owning team's bookmarks.
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
  topic page poll reload skips this read, and the page keeps the ones it loaded. A signed-in page asked for with
  `related=separate` skips it too, and `GET /api/topics/:id/related-topics` returns the same list behind the page's
  own gate and the social read limit. A visitor's page always holds the list.
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
- `topic/feeds.ts` — the topic feed's sections; the visitors' feed and topic page, each read through one Redis copy for
  half a minute; `topic/feedCaches.ts` — the Redis keys of those copies, and `clearVisitorTopicCaches`, which a topic's
  edit and delete and a Source added or removed call to drop its page copy, and the visitors' feed copies if the listing
  changed; `clearVisitorTopicPages`, which a team attach or detach calls; and `clearSharedTopicFeedCaches`, which drops
  the feed copies with the home and popular topic id lists; `topic/feedData.ts` — the batched reads behind every
  topic in a feed, each table read once for the whole batch.
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
  newest and trending sorts, and the page cut), `findingSearch.ts` (the finding reader, the resource title or url
  match through `resources_title_or_url_lower_trgm` on the topics the user may open, under the invite gate), and
  `topicPostSearch.ts` (the Topic Post reader, the published Topic Posts whose title, summary, or body text holds the
  query, under the `topic:view` rules in SQL, each with its own image or its topic's until its own is drawn; no index
  narrows its match). The other readers are `topic/search.ts`, `podcast/podcastEpisodeSearch.ts`, `team/search.ts`,
  and `searchUsers` in `profiles.ts`.
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
