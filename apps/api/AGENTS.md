# apps/api/

`mcp` serves sixteen MCP Apps views, including `suggest-topics`; twenty-two tools name MCP views.
`personalSources/personalSourcesSendSmoke.ts` checks atomic multi-Topic sends, one charge, concurrency, rollback, and
retries through the existing smoke entrypoint.


`personalSources/aiAgentAccountsRoute.ts` includes the session-only consent nudge.
`personalSources/personalSourcesRoute.ts` adds a verified connected agent through `POST
/api/topics/:id/personal-sources/ai-agents`; it never accepts caller-written Source identity metadata.

`personalSources/emailSetupRoute.ts` provides sender-authorized shared-address guidance and receiving eligibility.
`personalSources/inboundRoute.ts` authenticates `POST /api/webhooks/resend/inbound` and acknowledges only a durable
confirmation. `personalSources/personalSourcesEmailSmoke.ts` checks shared-recipient validation, quota races, replay,
and restart recovery without sending real mail. `personalSources/personalSourcesEmailFilingSmoke.ts` exercises the
shared allowance, a concurrent Scan, and atomic multi-Topic filing against the development database.
`personalSources/personalSourcesSharingSmoke.ts` checks two senders on a shared Topic, sender-only routes and
annotations, and visibility, ownership, deletion, and permission changes against the development database.

`personalSources/personalSourcesLinkSmoke.ts` checks durable link leases, sender score bonuses, duplicate consideration,
and deletion races in `smoke:personal-sources`. `personalSources/personalSourcesScoreSmoke.ts` adds the `bonus` section:
persisted full/half bonuses, custom-source overlap, repeated review, clamping, and Topic isolation.
`personalSources/personalSourcesLiveSmoke.ts` runs one synthetic receive through real summarization and a Temporal Scan,
then deletes its item and verifies Findings remain. It retires its temporary model key even with `--keep`; the separate
manual-review Topics are untouched.

`personalSources/importsRoute.ts` accepts session-authorized selected imports with its own 10 MiB body limit.
`personalSourcesImportSmoke.ts`, `personalSourcesContextSmoke.ts`, `personalSourcesSchemaSmoke.ts`, and
`personalSourcesAiAgentSmoke.ts` extend the Personal sources smoke with atomic imports, stale context, database
constraints, and live grant checks. Optional section names select checks.

`personalSources/` holds the additive sender-only Personal sources routes, session-only agent connection and credential
controls, and the send-only bearer endpoint. Its `personalSources.smoke.ts` entry runs through `bun run
smoke:personal-sources` against development, with disposable accounts and cleanup. `personalSourcesSmokeFixtures.ts`
owns those accounts and `personalSourcesPersistenceSmoke.ts` checks real confirmation locks, shared quotas, retry
tombstones, retained ciphertext, Source cascades, and the publication race. `mcp/personalSourcesTools.ts` registers
`send_to_topic` and read-only `suggest_topics` on both MCP routes through the pipeline's shared send service.

Hono server, the `@carlnotes/api` app. Entry `apps/api/index.ts` mounts the route trees; `apps/api/api.ts` aggregates
the `/api` routes and bounds every body at a megabyte through `toBodyLimit` in `bodyLimit.ts`, except on the chat,
transcription, upload, and note body save routes, which set their own limits. A chat post's turn is authorized from
the session and the url in `chat/privateChat.ts` before its body limit, so a rejected turn's body is never read.
`toBodyAdmission` in `bodyLimit.ts` makes a chat body past `LARGE_CHAT_BODY_BYTES` (3.25 MB) wait its turn, oldest
first and one at a time for each user, so the large chat bodies in progress stay within
`CHAT_BODY_BYTES_IN_PROGRESS_LIMIT` (104 MB), each until its response ends. A body whose turn does not come in 20
seconds gets its route's busy response, the private chat's 503 with `Retry-After` or the chat room's 400, and a
request dropped while it waits is never read. `chat/chatTurnAuthorizationTestFixtures.ts` holds the stubbed rows the chat turn tests share. No app
imports it as a value:
`@carlnotes/client` and `apps/web` read `AppType` and the `auth` type from it as types only, and `evals/` and `scripts/`
at the root import it by name.

`authorization.ts`, `topic/permissions.ts`, and `topic/findingPermissions.ts` retain compatibility exports for the
shared gate in `@carlnotes/db`. `chat/encryption.ts` keeps chat's plaintext compatibility and SQL length estimate;
authenticated encryption itself lives in `@carlnotes/server/privateText`.

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
- Domain folders: `topic/`, `team/`, `chat/`, `invite/`, `note/`, `podcast/`, `social/`, `share/`, `tool/`, `mcp/`,
  `home/`, `dashboard/`. Root
  files
  serve more than one domain (auth, billing, admin, avatars, favicons, profiles, SEO, `likePattern.ts` for the contains
  pattern the name and text searches match with, `canonicalJson.ts` for the json a keyed digest signs, `content.ts` for
  the blog under `content/blog/`, and `seed.ts`, the entry behind `bun run db:seed` over `@carlnotes/db/seed`).
  `profileCards.ts` reads the cards of a profile's and a team's three Featured sections in one profile order: the
  topics, their podcast episodes, and the published Topic Posts, a person's own and their led teams' on a profile and
  those of the team's topics on a team. It also reads the person's own All Topics table, their topics and those of every
  team they are on. On a profile only the person's own pins count. Each pinned row leads, then one podcast episode and one Topic Post of each other topic. A profile
  lists every Topic Post of its person after the pins, newest first, in `profileTopicPosts`, and an author's pinned
  Topic Posts have no limit. A profile also gets its films, the podcast episodes with a ready film, by the same rule
  over the films' own pins, right before its podcast episodes.
  `profileOrder.ts` is the four `profile-order` routes: a topic's, a podcast episode's, and
  `PATCH /api/podcast-episodes/:id/video/profile-order` for a ready film's, each for the topic's owner, and
  `PATCH /api/topic-posts/:id/profile-order` for a published Topic Post's author on a public topic.
  `team/defaultTeam.ts` reads a user's default team, the Team of their oldest leader membership, which a public or
  invite topic goes on when it is created or made public, unless a team already holds it.
  `team/teamPage.ts` reads a team's page, and `team/teamPageAccess.ts` reads who the page opens for, apart from the
  page so the viewer counts load it without the cards. The page's cards are those of the topics the reader may open:
  `loadTeamCards` for the topics, their podcast episodes, and every published Topic Post of them from one read of the
  posts, the pinned ones first and then the rest newest first, and the page's own read for their films, by the
  profile's film read, right before the podcast episodes.
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
- `social/` — reactions and comments on a social target: a Finding, a Podcast Episode, a Topic, a published Topic Post,
  or, for a reaction, a Comment. `socialTargets.ts` resolves a social target to its Topic, its page's path, and its name
  under the rule that lets the user open it, so a target the user cannot open reads as missing, and so does a Topic
  Post's draft. A Comment opens where what it hangs on does. A Comment on a Topic Post is shared with the podcast only
  if its post asks, and its events name `topic_post`. `socialTargetColumns.ts` maps a kind to its column on both tables.
  `socialTargetTestFixtures.ts` holds the resolved social targets and the shared comment slots the social tests read.
  `socialRows.ts` holds what both reads share: the reader, the author joined to a row, a comment's permissions, the
  column that says the reader reported a comment, and the cursor of a paged read in either order. `reactionRows.ts`
  loads the summaries of many social targets in one read. `reactions.ts` saves the user's one reaction through an
  upsert, and a save with no type removes it. `commentRows.ts` loads a thread's page of top-level comments with each
  one's first replies and reactions, a comment's page of replies, and the shared comment slots for a user who may share.
  `comments.ts` posts a comment or a reply, shares an editor's comment or reply if the post asks and a shared comment
  slot is free, a top-level comment by default, edits inside the edit time, deletes, and shares a comment with the
  podcast or takes it back through `@carlnotes/db/sharedComments`. `sharedCommentRows.ts` lists a Topic's shared
  comments for its sources list. `findingReactions.ts` attaches each Finding's reaction summary and comment count to a
  feed's Findings. `reactionsRoute.ts` and `commentsRoute.ts` are the routes, the first with `GET
  /api/reactions/summary` for a list whose read came without summaries, and the second with `GET
  /api/comments/:id/replies`, `PUT /api/comments/:id/share`, `GET /api/topics/:id/shared-comments`, and `GET
  /api/usernames` for mention suggestions. `pageCommentThread.ts` loads a Topic page's and a Podcast Episode page's
  first thread page. A write runs the Terms check, the daily count in `@carlnotes/db/socialLimits`, and the
  classification, in that order. `commentMentions.ts` holds a user's unseen Comment Mentions, one read cached in Redis,
  the seen mark, and the mention rows a Comment's post and edit write, and `commentMentionsRoute.ts` is `GET
  /api/comment-mentions/unseen` and `POST /api/comment-mentions/seen`, both for a signed-in user. A write that changes
  the read clears it through `@carlnotes/db/unseenCommentMentions`: a Comment's post, edit, and delete
  (`deleteCommentThread` in `comments.ts`, which the admin's report removal shares), a seen mark, a user block, an admin
  block, and the delete of a Topic or a Topic Post. `socialTargetJoins.ts` joins a read of many Comments or reactions to
  what each hangs on, with the filter that keeps what the reader may open. `bun run smoke:social` runs `social.smoke.ts`
  against the dev database.
- `note/` — the tasting-notes routes: `notes.ts` (a page's note list, the create, the badges, the read that returns the
  body's html and version, the rename and visibility change, the delete, and the save, `PUT /api/notes/:id/body` at
  `NOTE_BODY_PATH`: it rejects a visitor with a 404 before reading the body, bounds the body at `NOTE_HTML_MAX_CHARS * 4
  + 1024` bytes so any UTF-8 encoding of a body at the limit fits, validates `noteBodyPayload`, requires `canEditNote`,
  sanitizes the html, and writes one conditional statement where the id and the version match, raising the version and
  saving `last_editor_user_id` and `body_edited_at`; an unchanged body writes nothing and returns the stored version,
  and a moved version returns a 409 with the version and who saved last), `noteComments.ts` (the comment thread: `GET
  /api/notes/:id/comments` behind view access, oldest first, each with its author, or null for a closed account, and
  whether the caller may delete it; `POST /api/notes/:id/comments` behind `canEditNote`, tracking `note_comment_added`
  with the note id; `DELETE /api/notes/:id/comments/:commentId` for the author alone; every rejection a 404 and a bad
  body a 400 before any query), `notePayloads.ts` (a page's note list, one note as the api shapes it, one opened
  note with its body and version, a note created on a page, and `loadVisibleNote`, a note the user may see by its id,
  with its page), `noteWrites.ts` (the create, the rename and visibility change, the delete, and the version-checked
  body save that the routes and the MCP note tools share, each returning a status the route turns into its
  response), `permissions.ts` (visibility access), and `noteTestFixtures.ts` (the rows the stubbed connection pool
  returns in the route tests).
- `noteHtml.ts` — `sanitizeNoteHtml`, which the note and the Topic Post saves both clean a body with:
  `sanitize-html` over the editor's own tag set: `p`, `br`, `b`, `i`, `u`, `s`, `code`, `a` with an http, https, or
  mailto `href`, `h1` to `h6`, `ul` with `data-type` only when it is exactly `checkbox`, `ol`, `li` with `checked`,
  `blockquote`, and `codeblock`; images, scripts, styles, mentions, and unknown tags are dropped with their text
  kept, and the editor's empty document is stored as `""`.
- `topicPost/` — a Topic's Topic Posts: `topicPostsRoute.ts` (`GET /api/topics/:id/topic-posts`, the caller's own
  drafts first, and `POST` there for a draft behind `topicPost:publish`; `GET /api/topic-posts/:id`, a draft for its
  author alone; `PUT /api/topic-posts/:id` at `TOPIC_POST_PATH`, the save at the version its editor opened at, with the
  note save's body limit and sanitizer, where a stale version is a 409 before anything is classified and a published
  post is edited at any time, keeps its title and `TOPIC_POST_MIN_WORDS`, counts toward no daily limit, and has only
  its changed title and its new paragraphs and alt texts classified; `POST /api/topic-posts/:id/publish`, which counts
  against the day and classifies the title, the text, and the alt texts; and `DELETE` for the author, the Topic's
  owner, and an admin. `topicPostModeration.ts` holds the texts a reader sees in a body and their classification. An
  access rejection is a 404, a newer version a 409 `conflict` with the version, a short post a 400 `incomplete`, the
  day's limit a 429, and a flagged text a 422. Each write sends its `social_topic_post_*` event with the two ids and
  `isOwner`, and no text), `topicPosts.ts` (the row a card and a page read, `canReadTopicPost`, the cards, and the
  page's response), and `topicPostWrites.ts` (the conditional save, the publish, the draft's create, and the delete,
  which releases the post's home order and its profile order first. A published post's delete clears the home's caches
  and purges its author's profile page). `topicPostsRoute.test.ts` and `topicPostEditsRoute.test.ts`, the published
  edits, share the draft and the stubbed reads and writes in `topicPostsRouteTestFixtures.ts`.
- `news/` — a person's news: `newsRoute.ts` (`GET /api/news`, the signed-in user's own, and
  `GET /api/profiles/:userId/news`, a profile's as anyone may read it, both under the social read limit),
  `readNews.ts` (one numbered page of a window, whose first read fixes the window's end and each group's row count in
  the cursor that a later page passes back), `newsTopics.ts` (the Topic ids of the three groups in order: the person's
  own Topics, their Teams' Topics, and the Topics they follow, each Topic in the first group that holds it, narrowed
  for anyone else to the person's public rows), `newsEventRows.ts` (one group's Podcast Episodes, Topic Posts,
  Comments, reactions, and Findings inside the window, newest first), `newsEventColumns.ts` (the one set of columns
  every kind of row selects, so the six reads union together), and `newsPodcastEpisodes.ts` (the Podcast
  Episodes that a page's rows play). `bun run smoke:news` runs `news.smoke.ts` against the dev database.
- `dashboard/` — the Dashboard pages' reads: `dashboardsRoute.ts` (`GET /api/dashboards/:dashboardKind/:subjectId`, one
  chart selection's snapshot at the user's or visitor's access, shared at the edge under the Dashboard's cache tag for a
  public read and never cached for a full one, `GET /api/dashboards/map-settings`, the Google Maps key and Map ID for
  the site's own referrers, the page head read, and the public share image), `dashboards.ts` (`loadDashboardAccess`, how
  much a user or visitor may read of a Dashboard, where the owner of Topic and Podcast Dashboards and a team's active
  members read the full snapshot, anyone else a team's page opens for reads its summary alone, and everyone else reads
  the public one, and `loadDashboard`, the snapshot at that access), and `dashboardPageHead.ts` (a Dashboard page's head
  from the public snapshot alone, with Carl's paragraph or the summary as its description and the share image as its
  card).
- `chat/roomStream.ts` fans a stored chat message out across replicas over Redis pub/sub through `@carlnotes/db/redis`.
  It delivers to its own instance's subscribers first, publishes a payload that names the instance, and skips the echo
  of its own publish. Nothing missed while a subscriber was down is replayed. Chat catches up from its cursor.
  `chat/roomEvents.ts` serializes catch-up and live SSE deliveries. It checks the original session and current room
  access before each delivery and on heartbeats, closing the connection when access ends.
  `chat/roomPosts.ts` is the one chat room post the room routes and `post_to_team_room` share: the Terms, the room's
  access, moderation, and the post. `chat/roomReads.ts` is the one page of a room's messages both read.
- `mcp/` — the mcp server on `@modelcontextprotocol/server`: `server.ts` (the `/mcp` and `/mcp/t/:topicId` routes and
  the web-standard transport), `origins.ts` (exact Origin validation on both transports, before caller resolution and
  limits in `index.ts`, allowing an absent header, production, and the configured app origin), `tools.ts` (the reads,
  the site search, and the per-user writes it registers, with their schemas and annotations), `topicEditTools.ts`
  (`edit_topic`, `suggest_sources`, and `create_topic`), `topicImageTool.ts` (`set_topic_image`, a regenerate or a
  public image url, returning the topic MCP view. If the image set from a url stays unchecked, it returns the
  Topic's current image and says only the caller can see the new one), `topicAttachmentTool.ts`
  (`add_topic_attachment`, a url's page or
  pasted text, owner only), `noteTools.ts` (`read_notes`, `save_note`, and `delete_note` through the note routes' own
  reads and writes, with body saves on the note body save limit), `noteResults.ts` (what `read_notes` returns: a page's
  notes fenced and paged, or one note with its html cut at a top-level block and no version once cut),
  `teamTools.ts` (`list_teams` and `read_team`, the team page as the caller may see it with the chat's latest messages
  for a member), `teamResults.ts` (what they return: each list limited, the room's newest messages in what is left of
  the result limit, and everything people wrote fenced), `teamWriteTools.ts` (`request_to_join_team`, `send_invite`,
  `respond_to_invite`, and `post_to_team_room` through the team, invite, and chat room modules the web's routes call),
  `profileTool.ts` (`read_profile`, a person's profile page as the caller may see it with its week's news),
  `profileResults.ts` (what it returns: each section limited and every name fenced), `activityTool.ts`
  (`read_activity`, the caller's topics and the topic and team invites with the ids `respond_to_invite` takes),
  `accountTool.ts` (`read_account`, the plan, the spend meter, the day's scans, and the regenerations left, with links
  to the plans and account pages), `reportTools.ts` (`report_content` and `block_user`, through `flagContent` and
  the user block functions the site's routes call),
  `socialTools.ts` (`save_reaction`, `read_hot_takes`, `post_hot_take`, and
  `delete_hot_take`, over the same writes and limits as the site's routes, with a thread's bodies fenced), `toolShapes.ts`
  (the topic id argument, the registration options, and the result shapes every tool shares), `topicEdits.ts` (the
  `edit_topic` flow: the topic read as its page reads it, the preview, and the save through the chat's save path),
  `topicEditConfirmations.ts` (the keyed confirmation that making a topic public or removing a source needs),
  `searchResults.ts` (what the `search` tool returns, under the search rate limit), `scanTools.ts` (`start_scan`,
  `read_scan_status`, and `stop_scan`), `scanResults.ts` (a Scan's status as those tools return it), `dashboardTool.ts`
  (`read_dashboard`, a person's Topic or Podcast Dashboard or a team's Team Dashboard under the page's access rules,
  defaulting to the caller or the caller's first team, with the summary, Carl's fenced paragraph, the day, and the page
  url, and the read for the dashboard MCP view), `updatesTool.ts` (`read_updates`, the one reader of the updates list;
  `topic/updatesRoute.ts` is `GET /api/updates/opener`, the day's opener alone for the signed-in home, which marks no
  Finding read), `topicContextTool.ts` (`read_topic_context`), `topicContextResults.ts` (the Findings and excerpts it
  returns), `uiResources.ts` (the MCP Apps view resources, each html written from the bundle `build:ui` makes in
  `apps/web/dist/mcp-views`, with the dashboard MCP view's own script and the script every other MCP view shares, every
  stored bundle's version read back from object storage, and the `_meta` a tool names its MCP view with),
  `mcpViewData.ts` (what a tool result gives its MCP view in `_meta`: the caller, the podcast episodes with play tokens
  and, while `MCP_VIEW_FILM_PLAYBACK` is on, their films' video and captions urls, the findings MCP view's topic and
  findings, the updates list's Topics, the Scan status, the Dashboard read, the podcast episodes of a profile's and a
  team's cards, and the caller's private annotations), `noteMcpViewData.ts` (the note MCP view's page of notes and its
  opened note), `topicsMcpViewData.ts` (the topics MCP view's section cards or similar topics), `toolCaller.ts` (the tool caller: the visitor or user an access token resolves to,
  verified in-process against the auth server's signing keys), `oauthClientNames.ts` (the registered name of each MCP
  client, which the tool caller, the consent page's route, and the app connection report read. That route,
  `GET /api/mcp/clients/:clientId` in `server.ts`, also returns the host of the authorize request's redirect address
  if `toUnknownRedirectHost` in `@carlnotes/contracts/aiAgentIdentity` does not know it, which the consent page
  shows as its one warning line), `results.ts` (what the
  finding tools return for a visitor or a user, paged under a client's result limit, and the paging helpers), and
  `topicResults.ts` (what `list_topics` returns). `mcp.smoke.ts` runs the sections in `mcpSmokeSections.ts` and the
  oauth flow in `mcpOAuthSmokeSections.ts` over the fixtures in `mcpSmokeFixtures.ts` (with both routes' paths and a connected client each section shares), and stops the first scan of the
  topic it creates through `topic/firstScanSmoke.ts`. `mcpContractTestFixtures.ts` holds the tool title,
  annotation, and phrase matrix shared by unit and smoke checks. `mcpDirectorySmokeFixtures.ts` seeds isolated private
  access, large feed, and search rows. `mcpDirectorySmokeSections.ts` checks both transports' Origin and identity cases,
  including a former follower losing private Topic access; `mcpResultSmokeSections.ts` checks complete cursor traversal
  and measures text, structured results, and MCP view metadata separately, and `mcpTopicToolSmokeSections.ts` checks
  `send_finding_feedback`, `read_updates`, `read_topic_context`, and the Scan tools on both routes.
  `mcpTopicWriteSmokeSections.ts` checks the owner's `set_topic_image` and `add_topic_attachment` on both routes.
  `mcpNoteSmokeSections.ts` creates, reads, saves, and deletes the owner's note on both routes, with a stale version, a
  visitor's list, and a long note read cut inside the result bounds. `mcpTeamSmokeSections.ts` seeds the owner's team,
  a second team, and a friend, and checks the chat post, the team list and page, the ask to join, a username invite,
  and a missing invite's answer, with the bound route reaching no team.
  `mcpAccountSmokeSections.ts` seeds a stranger with a public and a private topic and checks the owner's own profile,
  the stranger's with its public topic alone, the activity, and the account, with the bound route reading no profile.
  `mcpReportSmokeSections.ts` reports a finding to Resend's test inbox and finds it in the admin console's open
  reports, blocks and unblocks a person, and posts and deletes a hot take, with the bound route reporting and blocking
  nothing.
  `mcpTopicPostSmokeSections.ts` seeds a published Topic Post and a draft and checks `read_news`, `read_topic_posts`,
  and `read_topic_post` for a visitor and a user on both routes. The OAuth smoke verifies discovery, refresh,
  revocation, and already-issued JWT behavior. All fixture rows are removed in `finally`. Run `bun run smoke:mcp` before
  handing off an MCP change. Its deterministic Origin and tool-contract assertions also run in `bun run check`.
  `toolTestFixtures.ts` holds the registered tools and the callers the tool tests share.
- `home/` — the home page's payload: `homeRoute.ts` (`GET /api/home`, the home topics, films, podcast episodes, and
  Topic Posts and the first page of a user's topics as cards, and `GET /api/home/your-topics`, each later page of six),
  `homeCardIds.ts` (the pinned topics, films, podcast episodes, and Topic Posts first, then the trending topics, the
  most listened films and podcast episodes, and the newest Topic Posts, one film, one podcast episode, and one Topic
  Post per topic, and the films, podcast episodes, and Topic Posts of public shown topics published in the last seven
  days, newest first and pinned or not, in one cached read every replica shares for a minute. The route reads the cards
  of both Topic Post lists at once), and `topicCards.ts` (the card shapes). An admin block takes its user's topics,
  their podcast episodes and films, and the Topic Posts on those topics or by that user out of every list.
  `isHomePinnedOnly` in the spend control settings leaves every list its pinned rows alone. Both are read with the
  cached ids, so the home follows them within a minute. A Topic Post's publish on a public topic and
  a published post's delete call `clearHomeCaches` and purge the author's profile. `topic/serveImageFile.ts` streams one
  image file with the visibility gate and the cache headers, and `topic/topicImagesRoute.ts` serves a topic image's
  files (public ones immutable at the edge under `topic-image:<topicId>`, private ones behind `topic:view`), the
  editor's Regenerate within `imageRegenerationLimit`, the render an editor polls, and the upload. `topic/imageEdits.ts`
  holds what the image routes share: the upload's body limit and checks over an image's bytes, the image prompt's
  moderation, and the editor's regeneration quota. `topic/topicImageEdits.ts` holds a topic image's edits that the
  route and `set_topic_image` share: the editor check, the regenerate, the replacement from an image's bytes, and
  `setTopicImageFromUrl`, which fetches a public image url through `fetchLinkPreviewImage` and the upload's checks.
  An upload whose image moderation could not run goes through `publishOrSaveUncheckedImage` in
  `@carlnotes/pipeline/uncheckedImages`, in the topic, podcast episode, film, and Topic Post upload routes alike: shown
  to its uploader alone on an invite or public Topic, published at once on a private one. The upload still responds as
  a success in its released shape, with `isImageUnchecked` if it is shown to its uploader alone. Each file route serves
  its subject's current image, or an unchecked image's hash to its uploader alone, through
  `serveCurrentOrUncheckedImageFile` in `topic/serveImageFile.ts`, with the headers of a file that never reaches the
  edge, and a Regenerate drops the unchecked image.
  `podcast/podcastEpisodeImagesRoute.ts` serves a podcast episode's own image files, gated by its topic's visibility,
  and its editor's Regenerate and upload. `podcast/topicPodcastEpisodeVideoImagesRoute.ts`
  does the same for a film's own image: the poster at
  `/api/topic-podcast-episode-video-images/:podcastEpisodeId/:hash/poster.jpg`, a chapter's generated image at
  `/api/topic-podcast-episode-video-images/:podcastEpisodeId/chapters/:position/image.jpg`, behind the same gate and not
  found for a chapter with none or a podcast episode with no ready film, and `POST
  /api/episodes/:id/video/image/regenerate` and `POST /api/episodes/:id/video/image` for an editor of a podcast episode
  with a ready film, the regeneration within the same `imageRegenerationLimit` and the upload cropped to 16:9.
  `podcast/podcastEpisodeEditor.ts` loads a podcast episode for a signed-in user with `topic:edit` on its topic, for the
  image routes and `PATCH /api/episodes/:id`, the title and description save. `podcast/podcastEpisodeHomeOrder.ts` is
  `PATCH /api/podcast-episodes/:id/home-order` with the topic rules, the pinned podcast episodes a podcast episode
  page's rank dialog lists, and the purge of the home on every change. `topicPost/topicPostHomeOrder.ts` is `PATCH
  /api/topic-posts/:id/home-order` for a published Topic Post of a public shown topic, and `GET /api/home/topic-posts`,
  the pinned Topic Posts and the newest ones a pin may name, which the home page's rank dialog lists, both admin only.
  `podcast/topicPodcastEpisodeVideoHomeOrder.ts` is `PATCH /api/podcast-episodes/:id/video/home-order`, the same as the
  podcast episode's for a ready film, with the `episode_video_home_order_change` event. Every home-order route writes
  through `@carlnotes/db/homeOrder`, and `topic/homeOrder.ts` owns `toHomeOrderAdmin`, the admin gate every home-order
  route runs, `clearHomeCaches`, the home card ids cache delete and home purge they share, and `releaseHomeOrder`, which
  takes a topic's podcast episodes, their films, and its Topic Posts off the home with it. A topic's write for the
  position it already holds changes nothing, so the Rank dialog's Save of an unchanged order keeps the pins of each
  topic's podcast episodes and films. `report/removeReportedSubject.ts` draws a reported topic image again through an
  `admin` render instead of deleting it.
- `podcast/` — a Topic's podcast episodes: `podcastEpisodes.ts` (the routes for a season's episodes, an episode page,
  the next unplayed episode, one episode with its files and its preview card, a listener's progress, a chapter's rating,
  the podcast switch, and removing an episode), `podcastEpisodeListens.ts` (saving a listener's progress, with a
  playback start counted among the listeners, and finding their next unplayed podcast episode), `podcastEpisodeRows.ts`
  (the episode row reads, the episode view rules in SQL, and the subscription activation gate that limit each read to
  what the user may listen to), `helpers.ts` (the page reads over them: the topic page's podcast, a season's episodes,
  and a podcast episode page), `podcastEpisodeShapes.ts` (an episode as the player shows it, with its chapters, and as a
  table row shows it, with its chapter count, and each topic's latest of either: the home feed reads full episodes, and
  every table row and its play button read summaries. `loadTopicPodcastEpisodeVideos` reads the ready and the
  rendering film rows of a list of podcast episodes in one query, so a podcast episode has its `video` for a ready
  film and `isVideoRendering` while its film renders, and a failed film has neither),
  `podcastSeo.ts` (the public episodes that the sitemap and
  llms.txt list, and the PodcastSeries and PodcastEpisode structured data that `seo.ts` and `share/pageHead.ts` read),
  `podcastEpisodeFiles.ts` (the audio, film, captions, chapters, and transcript responses, and the play request that
  the audio and film routes share), `podcastFeedTokens.ts` (a listener's feed token, and building, caching, and
  responding with a podcast feed or film feed, or a 304 for a current copy), `podcastFeeds.ts` (a listener's feed urls
  and their reset, an episode's audio and film files at paths after a feed token, and the covers),
  `topicPodcastEpisodeVideos.ts` (a ready film's files), `topicPodcastEpisodeVideoRoutes.ts` (the film and captions
  urls, and the rebuild that starts for a film drawn from an image that it no longer shows),
  `relatedPodcastEpisodes.ts` (the rows of an episode page's Other episodes and Similar podcasts tables: the topic's
  other published episodes that the user may listen to, and the most related published episodes of other topics. The
  public shown topics' episodes rank through the index of the episode vectors saved as public and shown, cached in
  Redis. A user's own, the episodes they may listen to through their account, are scored for them without an index on
  every load. Both merge by score, and every read checks each episode again), `podcastEpisodeSearch.ts` (the site
  search's episode reader: title and description matches through trigram indexes, then for a query of three characters
  or more the nearest by meaning over the episode vectors, under the episode view rules. The query's vector is cached
  in Redis by its lowercased words and billed to the user's key or the public key, a visitor's embeddings are rate
  limited per address, and a search that may not embed returns its text matches), and `playTokens.ts` (the play token
  an MCP view's audio url includes, which the audio route reads in place of a session).
  `share/podcastFeed.ts` builds the feed. `share/podcastCover.ts` draws a show cover over its topic's image or
  `apps/docs/design/podcast/cover-base.png` and renders, encodes, and stores every cover, `share/podcastCoverBands.ts`
  draws the show cover's two text bands and picks each band's tone from the picture under it,
  `share/podcastEpisodeCover.ts` draws a podcast episode's own cover and loads the image under it, and
  `share/podcastEpisodeImage.ts` draws a podcast episode page's link-preview card: the podcast episode's image, or its
  topic's, across the top with the title and details under it, the way `share/topicImage.ts` draws a topic's.
  Every card and cover draws through `@carlnotes/pipeline/cardElementPng`, which holds the fonts.
  `documents.ts` serves a public Topic's feed at `/topics/:id/podcast.xml` and a listener's own at
  `/podcast-feeds/:token.xml`, and the film feeds beside them at `/topics/:id/podcast-video.xml` and
  `/podcast-video-feeds/:token.xml`, which share the listener's one feed token.
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
- [Reading and chat routes](reading-and-chat-routes.md) maps Topic saves, Findings, counts, Scan recaps, Feeds, chat
  rooms, private chat and voice, Team access, search, and Topic Drafts to their handlers. `topic/topicIndexing.ts`
  updates Topic vectors and notifies IndexNow when a save changes a public URL.

- `botAnalytics.ts` — the middleware that reports what a known crawler, unfurler, podcast app, or feed reader fetched,
  keyed to the bot's name, from the token list in `@carlnotes/contracts/userAgent`. A route that loaded a topic sets
  `analyticsTopic`, and a public topic's id is sent with the event.
- `cursors.ts` — the base64url json cursor a paged read returns and a later page passes back: the news read's window
  cursor and the news tool's page cursor are written and read through it.
- `rateLimit.ts` — the rate limits: the general limit of 1,800 requests a minute, which `api.ts` mounts after the
  session lookup over every api route but the exempt paths (`/api/auth/*`, `/api/webhooks/*`, the podcast feeds and
  covers, and `/api/unsubscribe` on any method, and on a read a Topic's podcast feed, a podcast episode's files, a Topic
  Post Discussion's audio, and the `preview.png` share cards); the topic feed, link preview, and Dashboard read limits,
  120 each, under it; these four set no rate limit header, and their 429 sends `Retry-After` and `Cache-Control:
  private, no-cache`; the tool caller limit, shared by the chat turn routes, the transcription route, the source
  suggestions, and the mcp routes, keyed by the user or by the client address; the page render limit on a visitor's page
  renders, which `index.ts` mounts ahead of the blog, release, and ui page renders, keyed by address and skipped for a
  session cookie or an untrusted address; the search limit on the search bar's three routes; the speech limit on the
  spoken parts of a reply, in its own rate limit window; the spoken events limit, in its own rate limit window; the
  social read limit on the paged reads of reactions and comments, on the mention suggestions, and on a topic's related
  topics, keyed by the user or by the client address; and the note body save, app signup challenge and gate, push
  device, and store billing limits. The limits over the reads a page render calls, which are the general, topic feed,
  link preview, Dashboard read, search, and social read limits, skip a request with no user and no external address,
  such as a page render's loopback call. Every other limit keyed by the user or the address counts such a request in one
  shared bucket. `trustedProxies.ts` reads that address exactly as Better Auth does: the rightmost `x-forwarded-for`
  entry outside the Cloudflare ranges that `TRUSTED_PROXIES` lists, and logs the warning once if the setting is unset or
  misses a hop. `requestPlace.ts` reads a view's or a play's place from Cloudflare's location headers only if a
  Cloudflare hop reported the client, and no address is stored. Each rate limit window is counted in Redis through
  `@carlnotes/db/redisRateLimits`, so every replica shares the count. While Redis is unreachable the counter counts in
  this replica's memory, so a caller stays bounded per replica.
- `avatars.ts` — the user and team avatar uploads and the published avatar, and `avatarsRoute.ts` their routes, with
  `POST /api/avatars/decode-failures`, which reports a chosen avatar file that could not be decoded, by its content
  type and byte size, the first five a user sends in a day. An upload is checked and stored through
  `toStoredAvatar` in `@carlnotes/pipeline/avatarImages`: past 4,096 pixels a side it is rejected before it is
  decoded, and the stored file is the server's own re-encode within 512 pixels. An upload whose image moderation
  could not run is saved as unchecked through `saveUncheckedAvatar` or `saveUncheckedTeamAvatar` in
  `@carlnotes/db/avatars`: the published avatar stays, the upload responds `{ ok: true, isImageUnchecked: true }`, and
  the route serves the unchecked avatar to its uploader's session alone with `private, no-store`. The session returns
  `uncheckedAvatarKey`, which names the unchecked avatar to its user alone. A provider photo's redirect has the user's
  avatar tag, so a reset purges it from the edge.
  `share/previewImage.ts` resizes every avatar through `toCardAvatarPng` before a card inlines it. A request that
  names `unchecked=1`, which the mobile app's image elements send with the session cookie, gets the file at exactly the
  version it names: the unchecked avatar for its uploader's session, or the published upload once the unchecked avatar
  is published.
  Anything else is a 404 with `private, no-store`, never another version and never a provider photo's redirect.
  `avatarTestFixtures.ts` holds what the avatar tests and the unchecked avatar tests share.
- `uncheckedImageOverlays.ts` — the uploader's view of an unchecked image on a subject's own page read.
  `overlayUncheckedTopicImage`, `overlayUncheckedPodcastEpisodePageImages`, `overlayUncheckedPodcastEpisodeImages`,
  `overlayUncheckedTopicPostImage`, and `overlayUncheckedTeamAvatar` run in the route after its loader, for a signed-in
  user who may edit, with one `unchecked_images` read, and mark each unchecked url with `unchecked=1`. The loaders,
  which the MCP tools call, return the published image. `uncheckedImageOverlayTestFixtures.ts` holds what the overlay
  tests share.
- `edgeCache.ts` — what the edge may cache: a signed-out page, a permanent redirect from a page path, the blog and
  release pages, and the signed-out feed for a minute under the `rendered` tag, a versioned avatar or card for a year in
  the browser and a day at the edge, a public topic's counts for 30 seconds at the edge through `setCountsCacheHeaders`,
  and a public Dashboard's snapshot for a day under `dashboard:<kind>:<subjectId>` through `setDashboardCacheHeaders`,
  which a team update, a team delete, an account close, and the snapshot build purge. `setStaticFileCacheControl` caches
  a file of the docs site or the component browser for a year if its name holds a content hash, and has the browser
  revalidate every other file. A user avatar response is tagged `user-avatar:<userId>`, a team avatar response
  `team-avatar:<teamId>`, and a topic's image files `topic-image:<topicId>`. The purge by tag is
  `packages/server/edgePurge.ts`, which the worker sends too. `edgeCache.purge.ts` (`bun run edge:purge`) is the deploy
  job that clears the `rendered` tag right after the app deploys.
- `admin.ts` — the admin writes (a user's role and budget override, a platform's minimum app version, and the spend
  control settings through `POST /admin/spend-control-settings`) and the admin console routes, over `adminConsole.ts`
  (the users and teams tables, the platform totals, and the expandable rows, a topic's subscribers among them),
  `spendControlSettings.ts` (the console's `dailySpendCutoffs` field read straight from the database: the day's
  free-plan spend, the worst case monthly spend from `loadWorstCaseMonthlySpend`, each cutoff and whether it is passed,
  the first scan dispatch limit with the waiting scan count from `toWaitingScanFilter`, the signup alert, a film's
  generated image limit, and the four switches: the unverified accounts switch, the pauses on new podcast episodes
  and on new films, and the home that shows pinned items only. Its save writes the one `spend_control_settings` row
  and deletes both cached reads, and a field the payload leaves out keeps its stored value), and
  `report/adminReports.ts` (the open content reports, each with its subject's avatar or images as they stand, and
  resolving one). `emergencySwitches.test.ts` reads every switch with nothing set and checks that each pause is named
  in one module.
- The daily spend cutoffs in topic creation and the manual scan route: `topic/saveHelpers.ts` leaves a new Topic's
  first Scan running and undispatched for the sweep if `isFirstScanWaiting` says it waits, and starts the url Source
  screens without the wait. `runManualScan` in `topic/scans.ts` returns running while the Topic's first Scan waits, and
  past the scheduled scans cutoff opens a free user's manual row without a workflow and returns started. Both read
  `@carlnotes/db/dailySpendCutoffs`, and a paid user's request reads nothing new.
- `report/` — content reports: `report/flagContent.ts` (the `POST /api/flag-content` route, and `flagContent`, which
  it and `report_content` call: the daily limit in Redis, the stored report, the email to `SUPPORT_EMAIL` with the admin
  console link, and the report's events), `report/reportSubjects.ts` (what a
  report names, a Topic, profile, Team, chat room message, note, or note comment, each resolved under the same read rule
  that lets the reporter see it), `report/socialReportSubjects.ts` (the same for a Finding, a Podcast Episode, and a
  comment), `report/reports.ts` (writing a report), and `report/removeReportedSubject.ts` (what resolving does to a
  subject: Remove and Block delete the content through its own delete path, and Remove alone resets a reported
  profile's or team's avatar through `replaceAvatar` and `replaceTeamAvatar` with one purge of its `user-avatar:` or
  `team-avatar:` tag, and draws a reported podcast episode's image and its film's uploaded image again through
  `@carlnotes/pipeline/topicImages/removedImageUploads`. An image drawn again also drops an unchecked upload for it).
  The filter that hides a reported subject from its reporter in the room, comment, and note reads is
  `toUnreportedFilter` in `@carlnotes/db/contentFilters`. `report/adminReportTestFixtures.ts` holds the open report
  row and the resolve that the admin report tests and the Remove tests share.
-  `moderation.ts` — the check every text and image other users see goes through before it is stored:
  `toObjectionableCategory` classifies a text and `toObjectionableImageCategory` an image through
  `@carlnotes/models/moderation`, and each returns the category it violates or null. The image check also returns
  unreadable if the endpoint rejects the image itself, and unchecked if its classification failed, with a report that
  names the subject and never the image. An unchecked avatar, and an unchecked image on an invite or public Topic,
  is shown to its uploader alone. On a private Topic it is published and the sweep checks it again, and a chat room
  image posts as before. A failed text classification fails open with the same kind of report, and a skipped check,
  with no key set, passes and is not reported. `toObjectionableContentResponse` is the
  422 the clients turn into Carl's rejection. The room post, note create, rename, and body save, comment post, username
  save, team create and update, and `topic/saveTopic.ts` for an invite or public Topic's name, prompt, and tags all
  check text. The room post's shared images and the user and team avatar uploads check images. `updateTopic` in
  `topic/saveTopic.ts` and `updateTopicFields` in `tool/topicTools.ts` call `unpublishTopicUncheckedImages` before they
  write a Topic's visibility, so a change is never blocked by an image, and a Regenerate drops an unpublished unchecked
  image.
- `termsAcceptance.ts` — the Terms acceptance gate and route: `toTermsOutdatedResponse` is the 403 a user-content
  write gets while the session's accepted version is older than `TERMS_VERSION`, `isSessionTermsCurrent` is the same
  check as a boolean for a module the route calls, `hasAcceptedCurrentTerms` reads the
  row for a write with no session, and `POST /api/users/me/terms-acceptance` records the published version and
  refreshes the user's sessions. Better Auth's user-create hook in `auth.ts` records the version on every sign-up path.
- `userBlocks.ts` — one user blocking another: the block, unblock, and list routes' functions. `saveUserBlock` rejects
  blocking oneself and an unknown user itself, so the route, a report's block, and `block_user` share the checks.
  `toNotUserBlockedAuthorFilter` in `@carlnotes/db/contentFilters` keeps a blocked user's rows out of the blocker's
  reads. `chat/roomVisibility.ts` applies the report and block filters to a room's loaded messages for one member, after
  the shared load. `loadAdminTopicSubscribers` lists a topic's subscribers by `isActiveNonOwnerTopicSubscription`, the
  rule `topic/subscriberCounts.ts` counts with.
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
  mentions, and latest podcast episode). `loadActivity` is exported for `read_activity`, and `loadProfile` in
  `profiles.ts` for `read_profile`.
- `invite/emails.ts` — the invitation emails for both targets, each its own `sendAccountEmail`, with a topic
  invitation's send recorded once Resend accepts it.
- `invite/invites.ts` — the invite links, the topic or team a token opens, and the link routes. A topic's link shared
  from a Topic Post names the post in `invites.topic_post_id`, a published post of that topic, apart from the topic's
  own link;
  `invite/inviteAcceptance.ts` — accepting an invite: the token acceptance, the topic and team acceptances, the
  spent use, and the published Topic Post a topic invite names, which the `joined` response returns for the client to
  open, with the invitation match by account or verified address in `@carlnotes/db/inviteFilters`.
  `invites.smoke.ts` runs
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
  `authEmails.ts` sends the emails Better Auth asks for through `sendAccountEmail`, and each mail hook in `auth.ts`
  starts its send through `sendAuthEmailInBackground`, which logs and reports a send that throws, and responds at
  once, so a slow or down Resend never holds a signup or a reset request. `/oauth2/register` is limited to 600
  registrations an hour per
  address. `auth.ts` composes the MCP OAuth server from the `mcp`, `jwt`, and `cimd` plugins and exports
  `MCP_RESOURCE_URL`, the `/mcp` url every MCP access token is bound to. `authHooks.ts` holds the request hooks
  `auth.ts` passes Better Auth, the breach check and the canonical address before a credential request and the sign-in
  and app connection reports after one, with the Google and GitHub profile mappers. It also counts a change of email
  per user, five a UTC day, and rejects the next with a 429 before any email is sent.
  `appleProvider.ts` holds Sign in with Apple's options. It signs Apple's client secret, an ES256 JWT, from the four
  `APPLE_*` values at runtime and signs a new one every week. Apple stays off if any value is unset or the key will not
  sign. Its profile mapper returns the stored email of the user who holds the Apple account if an ID token has none.
  `auth.ts` trusts Apple's origin for Apple's posted callback alone. Closing an account in `users.ts` revokes its Apple
  tokens through `revokeAppleTokens`, and a failed revoke is reported without stopping the close.
  `signupGate.ts` holds the single-use token a password signup's gate signs: a five-minute token whose nonce Redis
  records, so one use consumes it and a replay is rejected, and while Redis is down the signature and expiry alone pass.
  The web's gate signs it after the turnstile check, and `setGateCookie` sets it as the cookie the signup route reads.
  `verifyTurnstileToken` gives Cloudflare five seconds, and a check that times out is reported and reads as failed.
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
  `@carlnotes/db/sessions` writes the keys that Better Auth owns where the app changes a user outside Better Auth's
  routes.
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
- Dev: `bun run dev:api` (doppler, on `PORT`, 3000 by default). Tests: `bun test apps/api`; `*.smoke.ts` run under
  `doppler run`. `testSession.ts` resolves the session lookup as one user or as a visitor, builds a route with one user
  signed in, and builds a json post, and `indexTestFixtures.ts` builds the fake ui bundle and the requests the page
  serving tests send through the composed app; only tests import either. `edgePurgeTestFixtures.ts` turns the edge purge
  on with a fetch spy and reads the tags each purge named, and only tests import it. `analyticsTestFixtures.ts` holds
  the analytics properties that the tests, the topic tools, invite, and podcast feed smoke tests, and the new-topic chat
  eval pass where a request's own would go.

Native request telemetry uses `contracts/clientTelemetry` in `currentUser.ts`, auth event hooks, and
`requestTracing.ts`. Native requests carry descriptive platform/device/app headers; web requests retain user-agent
classification. Sentry request scopes and spans share those dimensions. These headers never participate in
authentication or authorization.

The existing authorized episode audio route additionally serves JSON for `Accept: application/json`: the signed
media URL and its expiry. Both representations and denials are private/no-store and vary by Accept. Legacy GET
redirects and HEAD range metadata remain unchanged, including listen counting only on GET. The JSON path uses
the same access gate; platform players never forward a CarlNotes session header to object storage.

`mcp/topicSuggestions.ts` pages read-only editable Topic suggestions with the shared MCP cursor.
`mcp/topicDraftConfirmations.ts` binds a creation preview to its caller and exact fields.
`topic/topicDraftConfirmationRecords.ts` consumes that confirmation in the Topic creation transaction. Concurrent
retries return the same Topic and first Scan.

`mcp/mcpPersonalSourcesSmokeSections.ts` checks required send targets, read-only routing, cursor traversal, and no
persisted draft or Personal sources work on both MCP routes.

`personalSources/personalSourcesRoute.ts` serves sender-only current scoring context and Topic-wide newest-first entry
pages, with no-store responses and authority before decryption.

`personalSources/personalSourcesReviewFixture.ts` runs through `seed:personal-sources <existing development account
email>`. It retains synthetic owner-only UI examples without changing the owner’s plan, credentials, or existing Topics;
repeat runs preserve manual edits.

Personal sources exposes sender-scoped entries, context, and Finding annotations through session-only no-store routes.
`emailSetupRoute.ts` returns shared-address guidance; `inboundRoute.ts` accepts only signed shared-address deliveries
from known account senders.

MCP Topic suggestions include every editable destination, with only strong matches checked initially. Name search
filters that list. Current-page search-row metadata uses bounded viewer/podcast reads; podcast play tokens stay in MCP
view-only metadata, including after cursor paging. The MCP picker excludes public discovery; automatic email routing
keeps its minimum filing relevance. `mcp/topicSuggestionsAutocomplete.ts` reads at most five literal editable names plus
one cursor lookahead, with the same authority and no model or write.

Accepted MCP sends attach bounded sender-authorized waiting links in MCP view-only metadata. Failure to load display
links preserves the accepted confirmation. Version-nine UI resources retain unversioned and earlier version aliases for
existing tool registrations.

Personal sources items, private summaries, and annotations have no automatic expiry. Their content remains encrypted
until explicit deletion. Released read contracts retain nullable expiry fields as null. Optional conversation URLs
survive the MCP picker outside matching and open from the shared AI sender label; missing references remain plain
labels.

Topic Posts beyond `topicPost/topicPostsRoute.ts`: `topicPost/topicPosts.ts` builds a post's response, which holds its
Topic's image and its newest discussion's time for the post's info popup. `topicPost/topicPostViewerCounts.ts` counts a
view of a Topic Post's page, into its viewer count and the day's daily counts, for a sender who may read the Topic Post,
and reads its viewer count for the page. `news/newsEventRows.ts` reads a person's own published Topic Posts into the own
group of their news, on any Topic the reader may open, and `news/readNews.ts` gives a published Topic Post's row the
post's id and the post's own image. `topicPost/topicPostImagesRoute.ts` serves one file of a Topic Post's image at the
post's current hash to whoever may see its topic, and takes an editor's regenerate and upload, for the post's author and
whoever holds `topicPost:editImage` on its topic. A regenerate counts against the same monthly quota as a topic image's.
`topicPost/topicPostPageHead.ts` builds a published post's page head, with the post's preview card and `BlogPosting`
structured data on a public topic, and `share/pageHead.ts` serves it at `GET /api/topic-posts/:id/head`.
`share/topicPostImage.ts` draws that card, served at `GET /api/topic-posts/:id/preview.png` from
`topicPost/topicPostsRoute.ts`: a public topic's post shows its own image, or its topic's until it is drawn, its title,
its author, and its topic's name, and a private or invite topic's post shows its topic's image and owner with the post's
title. `share/preview.ts` loads and caches it, and an invite that names a published post shows the post's card and title
on the join page. A publish starts `publishTopicPostWorkflow` and an edit of a published post starts
`summarizeTopicPostWorkflow`, both best effort. `topic/topics.ts` adds a topic's posts to its page, `profiles.ts` a
person's published posts to their profile, `seo.ts` a public topic's posts to the sitemap, and `home/topicCards.ts` each
podcast episode card's reaction count. `mcp/newsTool.ts` registers `read_news`, and `mcp/topicPostTools.ts` registers
`read_topic_posts` and `read_topic_post`. Each returns fenced json text and structured content, and no tool writes a
Topic Post. Each names its MCP view: `news`, `topic-posts`, and `topic-post`. `mcp/topicPostMcpViewData.ts` builds the
two post views' data, with a play token for a post's recording, and `mcpViewData.ts` the news view's.
`podcast/playTokens.ts` signs a token for a podcast episode or a Topic Post, and the recording's audio route accepts it
as `?play=`.

Topic Post body images: `topicPost/topicPostImagesRoute.ts` also takes the author's upload at `POST
/api/topic-posts/:id/body-images` (`TOPIC_POST_BODY_IMAGE_UPLOAD_PATH`, with a body limit of its own at the largest
plan's file size), behind the per-user `topicPostBodyImageRateLimiter`, the plan's file size and count of images, the
decode in `@carlnotes/pipeline/topicPosts/topicPostBodyImageFiles.ts`, and `toStrictImageModeration` in `moderation.ts`,
which fails closed with a 503 `moderation-unavailable`. It serves one file at `GET
/api/topic-post-body-images/:topicPostId/:imageId/:file`: a saved image to whoever may read the post, an upload the body
does not name to its author, and either to a valid read signature, cached at the edge only for a public Topic's
published post. `topicPost/topicPostBodyImages.ts` signs a non-public post's image urls, writes the html each reader
gets with `toTopicPostHtmlForReader` (absolute for an MCP view), counts a post's images over its saved body and its
uploads in grace, settles a save's images (the added ones keep their files and the dropped ones are queued for
deletion), and purges a public post's images from the edge after a save drops one or the post is deleted. A file read
loads `loadTopicPostBodyImageAccessRow`, which finds the image's path in the body in the database and never reads the
body. `topicPost/topicPostBodyImageReports.ts` removes a reported body image for an admin: the body without it, written
only at the version it read, its files queued for deletion, and a public post purged from the edge. The save cleans the body with
`sanitizeTopicPostHtml` in `noteHtml.ts`, which admits an `img` of the post's own and a code block's `data-language`,
and rejects a body past the plan's count with a 422 `image-limit-reached`.

Topic Post Discussions and the Topic Post chat: `topicPost/topicPostDiscussionsRoute.ts` serves the newest recording's
audio at `GET|HEAD /api/topic-posts/:id/discussion/audio.mp3` to whoever may read the post, through the podcast
episode's own audio response, and takes `POST /api/topic-posts/:id/discussion/regenerate` from whoever holds
`topicPost:publish` on the post's topic, with an optional note for the hosts that passes the moderation, the month's
`discussionRegenerationLimit`, a 409 while one records, and `social_topic_post_discussion_regenerate` by ids alone.
`topicPost/topicPostDiscussions.ts` reads what a post's page shows of its discussion, the newest recording's script
as a transcript among it, which reaches only a reader the post's own read admits, and
`topicPost/topicPostObjectKeys.ts` lists a post's stored objects, its image files, its saved body images' files, and its
recordings' audio, which a
post's delete, a topic's delete, and an account's delete each schedule for deletion. A post's page hides its image from
a reader who reported it until the image changes. `report/reportSubjects.ts` resolves the `topicPostImage` subject,
and `report/adminReports.ts` shows the image on its row. On Regenerate, `report/removeReportedSubject.ts` removes an
upload and starts an `admin` render with no user. `edgeCache.ts` tags a Topic Post's page `topic-post:<id>`, which an
image change purges. A topic
chat turn may name the Topic Post whose page it was asked from: `chat/chatTurnAnswer.ts` loads it with
`loadChatTurnSubject`, rejects a draft, a post that is gone, and another topic's post before any model call, and binds
no topic tool, and `chat/chatTurns.ts` stores the turn with the kind `topic_post`, reports `social_topic_post_chat`,
and replays it in the topic's private chat with the post's title and page.
