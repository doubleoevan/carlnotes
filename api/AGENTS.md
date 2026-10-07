# api/

Hono server. Entry `api/index.ts` mounts the route trees; `api/api.ts` aggregates the `/api` routes.

- `index.ts` opens each request's memo (`db/requestMemo.ts`) in its first middleware, and its `onError` reports an
  error no route handles to Sentry and keeps Hono's 500. `requestTracing.ts` runs next: it names a traced request's
  Sentry transaction by its route and attaches its query count, the pool's counts, and the event loop's lag.
  `index.ts` also serves `/api/health`, which the platform polls and which sends no query, and `/api/health/deep`,
  which runs one query and returns the pool's counts for a monitor. Neither looks up a session.
- Domain folders: `topic/`, `team/`, `chat/`, `invite/`, `note/`, `podcast/`, `share/`, `tool/`, `mcp/`. Root files
  serve more than one domain (auth, billing, admin, avatars, favicons, profiles, SEO, and `content.ts` for the blog
  under `content/blog/`).
- `documents.ts` — the document routes: the sitemap, the site and topic feeds, the llms files, the IndexNow key, and
  security.txt. `seo.ts` builds what they read, and the JSON-LD the topic page head includes. The blog and docs
  Markdown are read through `ttlCache.ts`, which keeps the parsed pages for a minute, so a new file appears within
  that minute without a restart.
- `share/pageHead.ts` — the `/api/<page>/:id/head` routes that return a topic, profile, team, or invite page's
  `PageHead`, which each ui route's `head()` turns into tags.
- `releases.ts` — the `/releases` index and each release's own page, both
  rendered through `content.ts`, plus the signed GitHub webhook that upserts the rows they read.
  `releases.sync.ts` (`bun run sync:releases`) re-reads the GitHub API through the same write, which
  seeds history and repairs a missed delivery, and `releases.preview.ts` (`bun run releases:preview`) stores a
  local notes file through it for reading on the dev server. The convention for writing one is `docs/release-notes.md`.
- `note/` — the tasting-notes routes and their yjs sync: `notes.ts` (page payload, snapshot, updates, stream),
  `noteCommentThreads.ts` (comment writes), `noteStream.ts` (fan-out), `permissions.ts` (visibility access),
  `noteBadges.ts` (the unread edit and comment counts, and the read time that clears them).
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
  `results.ts` (what each tool returns for a visitor or a user, paged under a client's result limit).
- `podcast/` — a Topic's podcast episodes: `podcastEpisodes.ts` (the routes for a season's episodes, an episode page,
  the next unplayed episode, one episode with its files and its preview card, a listener's progress, a chapter's
  rating, the podcast switch, and removing an episode), `helpers.ts` (the reads behind them: the topic page's
  podcast, a season's episodes, one episode by its id, and a podcast episode page, each limited to what the user may
  listen to), `podcastSeo.ts` (the public episodes that the sitemap and llms.txt list, and the PodcastSeries and
  PodcastEpisode structured data that `seo.ts` and `share/pageHead.ts` read),
  `podcastEpisodeFiles.ts` (the audio, chapters, and transcript responses), `podcastFeedTokens.ts` (a listener's feed
  token, and building, caching, and responding with a feed, or a 304 for a current copy), and `podcastFeeds.ts` (a
  listener's feed url and its reset, an episode's files at paths after a feed token, and the covers).
  `share/podcastFeed.ts` builds the feed, `share/podcastCover.ts` draws the covers over
  `docs/design/podcast/cover-base.png`, and
  `share/podcastEpisodeImage.ts` draws an episode page's link-preview card.
  `documents.ts` serves a public Topic's feed at `/topics/:id/podcast.xml` and a listener's own at
  `/podcast-feeds/:token.xml`.
- `tool/` — `topicTools.ts` (the Topic Tools, each with its own gate check) and the chat adapters in
  `chatTools.ts`: the edit tools bound to a chat's topic, and the draft tools of the new-topic chat. The mcp adapter is
  in `mcp/tools.ts`.
- `topic/promptVersions.ts` — the Prompt Version write the editor's save and the Topic Tools share.
- `topic/topicTableRows.ts` — `toTopicTableRows`, the topic table rows that the profile page and the team page share,
  each with its latest Podcast Episode.
- `topic/topicDrafts.ts` — the new-topic chat's Topic Draft row, written by the chat turn that changed it and read
  back when the conversation loads.
- `rateLimit.ts` — the one per-tool-caller rate limit, shared by the chat turn routes and the mcp routes, keyed by the
  user or by the client address. `trustedProxies.ts` reads that address exactly as Better Auth does: the rightmost
  `x-forwarded-for` entry outside the Cloudflare ranges that `TRUSTED_PROXIES` lists.
  Each rate limit window is counted in Redis through `db/redis.ts`, so every replica shares the count.
  The limiter allows every request while Redis is unreachable.
- `edgeCache.ts` — what the edge may cache: a signed-out page, the blog and release pages, and the signed-out feed for a
  minute under the `rendered` tag, and a versioned avatar or card for a year in the browser and a day at the edge.
  `edgeCache.purge.ts` (`bun run edge:purge`) is the deploy job that clears the `rendered` tag right after the app
  deploys.
- `auth.ts` creates each new user's LiteLLM key in the user create hook. If the LiteLLM proxy fails or times out,
  the hook reports the failure, and the user is created without a key. The user's first model call creates the key.
  `auth.ts` gives Better Auth the Redis store as its secondary storage and keeps sessions in Postgres too.
  A session is read from Redis first, and from Postgres if Redis has no copy or is down.
  Verification values, such as reset links and OAuth state, are kept in both stores and read the same way.
  The session hooks delete a session's Redis copy if Better Auth deletes the session's row,
  or if the session's daily refresh finds no Postgres row.
  `sessions.ts` writes the keys that Better Auth owns where the app changes a user outside Better Auth's routes:
  `refreshSessionUser` after a direct write to the plan, role, username, avatar, or invite access,
  `revokeUserSessions` from the Postgres tokens before an account's row is deleted,
  and `cacheSession` from the session update hook,
  so a session that Redis lost or never held is stored at its next daily refresh.
  An account close is rejected while a configured Redis is unreachable.
- Every authority check routes through `authorization.ts` and the role helpers; inline
  `role ===` / `plan ===` comparisons are banned outside it (`authorization.test.ts` greps).
- Request bodies validate with zod payloads from `shared/contracts.ts` via `zValidator`.
- A private or team read the user may not see responds 404, never 403; the invite gate keeps its 403.
- Dev: `bun run dev:api` (doppler, on `PORT`, 3000 by default).
  Tests: `bun test api`; `*.smoke.ts` run under `doppler run`.
