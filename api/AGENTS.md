# api/

Hono server. Entry `api/index.ts` mounts the route trees; `api/api.ts` aggregates the `/api` routes and bounds every
body at a megabyte through `toBodyLimit` in `bodyLimit.ts`, except on the chat, upload, and note sync routes, which set
their own limits.

- `index.ts` opens each request's memo (`db/requestMemo.ts`) in its first middleware, and its `onError` reports an
  error no route handles to Sentry and keeps Hono's 500. `requestTracing.ts` runs next: it counts the request's
  queries and cache reads, names a traced request's Sentry transaction by its route and attaches its query count,
  the pool's counts, and the event loop's lag, and outside production sets a `Server-Timing` header with the duration
  and the counts. In dev it also logs one line per request with the same numbers and the cache keys that missed.
  `queryBudgets.test.ts` holds the cached routes' query budgets, each a route requested twice against the pool and
  Redis stubs.
  `index.ts` also serves `/api/health`, which the platform polls and which sends no query, and `/api/health/deep`,
  which runs one query and returns the pool's counts for a monitor. Neither looks up a session. Its tests split
  between `index.test.ts`, for the routing, the health checks, the api's own validation, and the security headers,
  `pageRender.test.ts`, for the rendered pages, and `pageGuards.test.ts`, for the click id redirect and the render
  limit, over the fake bundle and requests in `indexTestFixtures.ts`.
  `index.ts` renders every other page through the ui's server build. A page render sets the `DEGRADED_RENDER_HEADER`
  from `shared/seo.ts` if a required read fails, and that page returns a 503 with a `Retry-After`, is reported, and is
  never cached at the edge.
  Ahead of a page render, `index.ts` limits a visitor's origin requests by address through `rateLimit.ts`, redirects a
  page url with a click id (`fbclid`, `gclid`, and the like) permanently to the url without it, which is the
  one the edge caches, and sheds a visitor's render past `RENDER_CONCURRENCY` with a 503 and a two-second retry while
  the edge serves its stale copy; a signed-in render is never shed. Every response includes the content security policy
  with `base-uri` and `form-action` on this origin, `Referrer-Policy`, and `X-Content-Type-Options`, and an unhashed
  public file from the ui bundle is cached an hour in the browser and a day at the edge under the `rendered` tag.
- Domain folders: `topic/`, `team/`, `chat/`, `invite/`, `note/`, `podcast/`, `share/`, `tool/`, `mcp/`. Root files
  serve more than one domain (auth, billing, admin, avatars, favicons, profiles, SEO, `likePattern.ts` for the contains
  pattern the name and text searches match with, and `content.ts` for the blog under `content/blog/`).
  `billingRoute.ts` holds the billing routes over `billing.ts`; its Stripe webhook responds 400 to a bad signature and
  500 to a verified event it could not apply, so Stripe retries it.
- `documents.ts` — the document routes: the sitemap, the site and topic feeds, the llms files, the IndexNow key, and
  security.txt. `seo.ts` builds what they read, and `jsonLd.ts` the JSON-LD the topic page head includes. The blog and
  docs Markdown are read through `ttlCache.ts`, which keeps the parsed pages for a minute, so a new file appears within
  that minute without a restart.
- `share/pageHead.ts` — the `/api/<page>/:id/head` routes that return a topic, profile, team, or invite page's
  `PageHead`, which each ui route's `head()` turns into tags.
- `releases.ts` — the `/releases` index and each release's own page, both
  rendered through `content.ts`, plus the signed GitHub webhook that upserts the rows they read.
  `releases.sync.ts` (`bun run sync:releases`) re-reads the GitHub API through the same write, which
  seeds history and repairs a missed delivery, and `releases.preview.ts` (`bun run releases:preview`) stores a
  local notes file through it for reading on the dev server. The convention for writing one is `docs/release-notes.md`.
- `note/` — the tasting-notes routes and their yjs sync: `notes.ts` (the routes and the stream), `noteYdoc.ts` (the
  yjs merge under the note's lock, the snapshot, and the regenerated HTML), `notePayloads.ts` (a page's note list, one
  note as the api shapes it, and a note created on a page), `noteCommentThreads.ts` (comment writes), `noteStream.ts`
  (fan-out), `permissions.ts` (visibility access), `noteBadges.ts` (the unread edit and comment counts, and the read
  time that clears them).
- `chat/roomStream.ts` and `note/noteStream.ts` fan a stored chat message and a note change out across replicas
  over Redis pub/sub through `db/redis.ts`.
  Each delivers to its own instance's subscribers first, publishes a payload that names the instance,
  and skips the echo of its own publish.
  A note's poke has no update bytes, and the other replicas resync.
  Nothing missed while a subscriber was down is replayed.
  Chat catches up from its cursor, and a note resyncs on the next poke or when the note stream reaches the age limit.
- `mcp/` — the mcp server: `server.ts` (the `/mcp` and `/mcp/t/:topicId` routes and the transport), `tools.ts` (the
  tools it registers, with their schemas and annotations), `toolCaller.ts` (the tool caller: the visitor or user a
  bearer token resolves to), and
  `results.ts` (what the finding tools return for a visitor or a user, paged under a client's result limit, and the
  paging helpers) and `topicResults.ts` (what `list_topics` returns). `mcp.smoke.ts` runs the sections in
  `mcpSmokeSections.ts` over the fixtures in `mcpSmokeFixtures.ts`, and stops the first scan of the topic it creates
  through `topic/firstScanSmoke.ts`.
- `podcast/` — a Topic's podcast episodes: `podcastEpisodes.ts` (the routes for a season's episodes, an episode page,
  the next unplayed episode, one episode with its files and its preview card, a listener's progress, a chapter's rating,
  the podcast switch, and removing an episode), `podcastEpisodeRows.ts` (the episode row reads, the episode view rules
  in SQL, and the subscription activation gate that limit each read to what the user may listen to), `helpers.ts` (the
  page reads over them: the topic page's podcast, a season's episodes, and a podcast episode page),
  `podcastEpisodeShapes.ts` (an episode as the player shows it, with its chapters, and as a table row shows it, with its
  chapter count, and each topic's latest of either: the home feed reads full episodes, and every table row and its play
  button read summaries), `podcastSeo.ts` (the public episodes that the sitemap and llms.txt list, and the PodcastSeries
  and PodcastEpisode structured data that `seo.ts` and `share/pageHead.ts` read), `podcastEpisodeFiles.ts` (the audio,
  chapters, and transcript responses), `podcastFeedTokens.ts` (a listener's feed token, and building, caching, and
  responding with a feed, or a 304 for a current copy), `podcastFeeds.ts` (a listener's feed url and its reset, an
  episode's files at paths after a feed token, and the covers), `relatedPodcastEpisodes.ts` (the rows of an episode
  page's Other episodes and Similar podcasts tables: the topic's other published episodes that the user may listen to,
  and the most related published episodes of other topics. The public shown topics' episodes rank through the index of
  the episode vectors saved as public and shown, cached in Redis. A user's own, the episodes they may listen to through
  their account, are scored for them without an index on every load. Both merge by score, and every read checks each
  episode again), and `podcastEpisodeSearch.ts` (`GET /api/episodes/search`, the search bar's episode search: title and
  description matches through trigram indexes, then for a query of three characters or more the nearest by meaning over
  the episode vectors, under the episode view rules. The query's vector is cached in Redis by its lowercased words and
  billed to the user's key or the public key, a visitor's embeddings are rate limited per address, and a search that may
  not embed returns its text matches). `share/podcastFeed.ts` builds the feed, `share/podcastCover.ts` draws the covers
  over `docs/design/podcast/cover-base.png`, and `share/podcastEpisodeImage.ts` draws an episode page's link-preview
  card. `documents.ts` serves a public Topic's feed at `/topics/:id/podcast.xml` and a listener's own at
  `/podcast-feeds/:token.xml`.
- `tool/` — the Topic Tools, each with its own gate check: `topicTools.ts` (the prompt and field updates),
  `topicSourceTools.ts` (adding and removing a source, and what one more costs), and `topicDraftTools.ts` (creating a
  topic from a draft and suggesting its sources). The chat adapters are `chatTools.ts` (the edit tools bound to a
  chat's topic) and `newTopicChatTools.ts` (the new-topic chat's draft tools). The mcp adapter is in `mcp/tools.ts`.
  `topicTools.smoke.ts` runs `topicUpdateSmokeSections.ts`, `topicSourceSmokeSections.ts`, and
  `topicDraftSmokeSections.ts` over `topicToolsSmokeFixtures.ts`, and stops the first scan of the topic it creates
  through `topic/firstScanSmoke.ts`.
- `topic/helpers.ts` — the topic page's reads; `topic/saveHelpers.ts` — the daily slot a frequency takes, a topic's
  new source rows, and its first scan; `topic/firstScanSmoke.ts` — the smoke helper that waits for a created topic's
  first scan to reach Temporal, then stops it and waits for its workflow to end; `topic/teamTopicOptions.ts` — the
  topics a user may add to a team; `topic/accessibleFindings.ts` — the findings a user may read on a topic, with the
  owning team's bookmarks.
- `topic/findings.ts` — the finding routes, and `topic/findingMarks.ts` — the marks a user puts on a finding: the
  rating and its feedback, the bookmark, consumed, and a view.
- `topic/promptVersions.ts` — the Prompt Version write the editor's save and the Topic Tools share.
- `topic/topicTableRows.ts` — `toTopicTableRows`, the topic table rows that the profile page and the team page share,
  each with its latest Podcast Episode.
- `topic/relatedTopics.ts` — `loadRelatedTopics`, the up to fifty other Topics most related to a Topic that the user may
  open, each with its latest Podcast Episode. The public shown ones are scored over candidates from an iterative scan of
  the public and shown HNSW index, and their ids and scores are cached in Redis for fifteen minutes. The Topics a user
  may open through their account are scored for them without an index on every load. Both merge by score, and every read
  checks each topic against the user's view rules again, so one the user may no longer open leaves at once. A topic page
  poll reload skips this read, and the page keeps the ones it loaded.
- `topic/relatedness.ts` — what both related reads share: `loadEmbeddingCentroid`, the current model's average
  resource embedding cached in Redis for a day, `toRelatedScore`, the centered cosine distance less a bonus for each
  shared tag, the score limits, the candidate count, `loadRelatedIds`, the public ranking cached in Redis merged with a
  user's own, `toMergedRelatedIds`, and `toRowsInIdOrder`. The related reads' tests store its centroid through
  `relatednessTestFixtures.ts`, and build episode rows through `podcast/podcastEpisodeTestFixtures.ts`.
- `topic/topics.ts` — the topic page read; `topic/saveTopic.ts` — the create with its default Sources and invites, and
  the update with its changed-field events, and `saveTopicVectorsOnVisibilityChange`, which the update and the topic
  tools call to save the topic's vectors again after a visibility change, as `topic/findingMarks.ts`'s `setRating` does
  after a rating; `topic/topicsRoute.ts` — the topic routes over them, which serve a visitor's topic page from one
  Redis copy for half a minute and limit source suggestions like a tool caller; `topic/deleteTopic.ts` — the delete,
  one transaction over every row a topic owns with its object keys recorded.
- `topic/feeds.ts` — the topic feed's sections; the visitors' feed and topic page, each read through one Redis copy for
  half a minute; `clearVisitorTopicCaches`, which a topic's edit and delete and a Source added or removed call to
  drop its page copy, and the visitors' feed copies if the listing changed; `clearVisitorTopicPages`, which a team
  attach or detach calls; and `clearSharedTopicFeedCaches`, which drops the feed copies with the featured and
  popular topic id lists; `topic/feedData.ts` — the batched reads behind every topic in a feed, each table read
  once for the whole batch.
- `chat/room.ts` — posting to a chat room and its stream; `chat/roomRoute.ts` — the chat room routes;
  `chat/roomAccess.ts` — one chat room, the member's access to it, and the topic side of a chat room filter;
  `chat/roomDeletes.ts` — clearing a room and deleting one message or shared file.
- `chat/privateChat.ts` — the private chat routes and the reply flow, each post rejecting a signed-out visitor through
  `toSignedOutRejection` in `bodyLimit.ts` before the body is read; `chat/chatTurnAuthorization.ts` — whether a user may
  take a chat turn on a topic, in a team chat, or in the new-topic chat; `chat/chatTurnStream.ts` — streaming a chat
  turn's reply and saving its row. `chat/roomTurns.ts` — Carl's chat room turn, and `chat/roomQuestion.ts` — the
  question it is asked, from the chat window and the room's summary and files. `room.smoke.ts` runs
  `roomSmokeSections.ts` over `roomSmokeFixtures.ts`.
- `chat/attachments.ts` — storing a chat turn's attachments and deleting them, with the routes;
  `chat/chatAttachmentReads.ts` — reading them: the kept ones with their context, a chat turn's own, a download, and
  the object keys behind a user's or a topic's.
- `team/teams.ts` — creating and updating a team and the topic attach and detach; `team/teamsRoute.ts` — the team
  routes; `team/deleteTeam.ts` — the delete, the handover to a new leader, and the one team row delete an account
  close shares; `team/search.ts` — the team name search; `team/teamPage.ts` — the team
  page read; `team/teamsPage.ts` — the teams page read; `team/helpers.ts` — the team summaries, the profile's team
  statuses, the admin's team topics, and the per-team counts and spend they share.
- `topic/search.ts` — `searchTopics` and `GET /api/topics/search`, the search bar's topic name search, which applies the
  `topic:view` rules in SQL ahead of the limit. A user finds the listed topics they may open, and a visitor finds public
  topics with enough findings. Those rules in SQL live in `topic/permissions.ts`: `toTopicViewFilter`,
  `toTopicAccessFilter`, the topics a user reaches through their account, and `toTopicRoleFilter`, a topic the user owns
  or a team of theirs holds. The related reads and the episode view rules share them. The name searches here, in
  `profiles.ts`, and in `team/search.ts` read trigram indexes, whose plans `searchPlans.smoke.ts` checks beside the chat
  ranking's, the related reads', and the episode search's.
- `topic/topicDrafts.ts` — the new-topic chat's Topic Draft row, written by the chat turn that changed it and read
  back when the conversation loads.
- `botAnalytics.ts` — the middleware that reports what a known crawler, unfurler, podcast app, or feed reader fetched,
  keyed to the bot's name, from the token list in `shared/userAgent.ts`. A route that loaded a topic sets
  `analyticsTopic`, and a public topic's id is sent with the event.
- `rateLimit.ts` — the three rate limits: the tool caller limit, shared by the chat turn routes, the source
  suggestions, and the mcp routes, keyed by the user or by the client address; the page render limit on a visitor's
  page renders, which `index.ts` mounts ahead of the blog, release, and ui page renders, keyed by address and skipped
  for a session cookie or an untrusted address; and the search limit on the search bar's three routes.
  `trustedProxies.ts` reads that address exactly as Better Auth does: the rightmost `x-forwarded-for` entry outside
  the Cloudflare ranges that `TRUSTED_PROXIES` lists, and logs the warning once if the setting is unset or misses a
  hop.
  Each rate limit window is counted in Redis through `db/redisRateLimits.ts`, so every replica shares the count.
  While Redis is unreachable the counter counts in this replica's memory, so a caller stays bounded per replica.
- `avatars.ts` — the user and team avatar uploads and the published avatar, and `avatarsRoute.ts` their routes, with
  `POST /api/avatars/decode-failures`, which reports a chosen avatar file that could not be decoded, by its content
  type and byte size, the first five a user sends in a day.
- `edgeCache.ts` — what the edge may cache: a signed-out page, a permanent redirect from a page path, the blog and
  release pages, and the signed-out feed for a minute under the `rendered` tag, and a versioned avatar or card for a
  year in the browser and a day at the edge. A
  user avatar response is tagged `user-avatar:<userId>` and a team avatar response `team-avatar:<teamId>`, and
  `purgeEdgeCacheTagAfterDeletion` purges one tag once an account close or a team deletion has committed, reporting a
  failed purge, logging a skipped one, and never failing the deletion. `purgeEdgeCacheTags` is the purge by tag both it
  and the release job send. `edgeCache.purge.ts` (`bun run edge:purge`) is the deploy job that clears the `rendered` tag
  right after the app deploys.
- `admin.ts` — the admin writes (a user's role and budget override) and the admin console routes, over
  `adminConsole.ts` (the users and teams tables, the platform totals, and the expandable rows).
- `activity.ts` — the activity page and its route, over `activityTopics.ts` (each topic's month scans, counts, chat
  mentions, and latest podcast episode).
- `invite/invites.ts` — the invite links, the topic or team a token opens, and the link routes;
  `invite/inviteAcceptance.ts` — accepting an invite: the token acceptance, the topic and team acceptances, and the
  spent use. `invites.smoke.ts` runs `inviteLinkSmokeSections.ts` and `userInviteSmokeSections.ts` over
  `inviteSmokeFixtures.ts`, and `team/teams.smoke.ts` runs `teamMembershipSmokeSections.ts`,
  `teamTopicSmokeSections.ts`, and `teamPageSmokeSections.ts` over `teamSmokeFixtures.ts`.
  `podcast/podcastEpisodes.smoke.ts` runs `podcastEpisodeSmokeSections.ts`, `podcastFeedSmokeSections.ts`,
  `podcastEpisodePageSmokeSections.ts`, and `relatedSmokeSections.ts` over `podcastEpisodeSmokeFixtures.ts`, and the
  related section seeds its own topics, episodes, vectors, subscriber, and team through `relatedSmokeFixtures.ts`.
- `unsubscribe.ts` — the topic-scan email's unsubscribe link: `GET /api/unsubscribe` opens a page with one button and
  changes nothing, and `POST /api/unsubscribe` performs the unsubscribe for the button and for a provider's RFC 8058
  one-click, reporting which with the request's device properties.
- `auth.ts` creates each new user's LiteLLM key in the user create hook. If the LiteLLM proxy fails or times out, the
  hook reports the failure, and the user is created without a key. The user's first model call creates the key.
  `authEmails.ts` sends the emails Better Auth asks for, and each mail hook in `auth.ts` starts its send through
  `sendAuthEmailInBackground`, which logs and reports a send that throws, and responds at once, so a slow or down
  Resend never holds a signup or a reset request. `/mcp/register` is limited to 600 registrations an hour per address.
  `authHooks.ts` holds the request hooks `auth.ts` passes Better Auth, the breach check and the canonical address before
  a credential request and the sign-in and app connection reports after one, with the Google and GitHub profile mappers.
  `signupGate.ts` holds the turnstile check a password signup passes, signed into a five-minute cookie whose nonce
  Redis records, so one signup consumes it and a replay is rejected; while Redis is down the signature and expiry alone
  pass.
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
- Every authority check routes through `authorization.ts` and the role helpers; inline
  `role ===` / `plan ===` comparisons are banned outside it (`authorization.test.ts` greps).
- Request bodies validate with zod payloads from `shared/payloads.ts` and `shared/topicPayloads.ts` via `zValidator`.
- A private or team read the user may not see responds 404, never 403; the invite gate keeps its 403.
- Dev: `bun run dev:api` (doppler, on `PORT`, 3000 by default).
  Tests: `bun test api`; `*.smoke.ts` run under `doppler run`. `testSession.ts` resolves the session lookup as one user
  or as a visitor and builds a route with one user signed in, and `indexTestFixtures.ts` builds the fake ui bundle and
  the requests the page serving tests send through the composed app; only tests import either.
