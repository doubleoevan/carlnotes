# packages/contracts/

`sourceScoring.ts` owns the custom and Personal sources score bonuses. `PersonalSourceScoreBonus` is the actual addition, not a multiplier, so queue priority and Finding persistence use the same values.

`topicSuggestions.ts` owns ranked editable/follow groups, best-match metadata, and numbered text fallback. The send
contract accepts one to twenty distinct `topic_ids` or one legacy `topic_id`; confirmations include every destination.


`personalSourcesAccounts.ts` also defines connection-nudge dismissal and verified agent-setup payloads.
`personalSourcesRouteContracts.ts` registers these additive session endpoints. The Topic Personal sources response includes the total
Source count and server receiving availability; it leaves frozen legacy Topic responses unchanged.

`personalSourcesEmail.ts` validates the provider fields receiving uses, excluding raw-message and attachment download URLs.

`personalSourcesImportText.ts` normalizes selected transcripts and extracts public links separately from private references.
`personalSourcesWork.ts` defines content-free workflow metadata and the 30-second quiet period with a five-minute ceiling.

`personalSourcesAccounts.ts` defines connection/key metadata and shared-mailbox guidance. `aiAgentIdentity.ts` derives stable
app-domain groups without client-advertised names. `personalSourcesRouteContracts.ts` adds Personal sources routes to the contract
registry, and `personalSourcesSendText.ts` shares the MCP confirmation wording with the Topic MCP view.

`@carlnotes/contracts`, the universal part of what every workspace may import: the zod response shapes, the request
payloads, and the constants that the api validates with and the web app parses against. Every app and package imports
it, and it imports only `zod`.

`noteTestFixtures.ts` supplies inert Notes table rows to both apps' stories and shared-component tests.
`teamTestFixtures.ts` supplies a team page, its topics table rows, the teams table's rows, and a received invite,
`activityTestFixtures.ts` the Activity page's subscriptions, invites, and owner topics, and `profileTestFixtures.ts` a
profile through `toTestProfile`, to both apps' stories and shared-component tests.
`social.ts` holds a social target, a reaction summary, a Comment with its replies and its thread, the shared comment
slots, the write payloads, the edit time, and `toSocialEventTarget` and `toCommentEventTarget`, how a kind reads in an
analytics event's name. `socialText.ts` holds the body limit, the plain-text schema, the mention parsing, and the urls a
shared Comment's body holds. `socialRouteContracts.ts` holds the routes the social client reaches, and
`socialTestFixtures.ts` supplies reactions and comments to stories and shared-component tests. The contract modules sit
at the package root, one per domain, each imported by its own path (`@carlnotes/contracts/chat`): `chat.ts`, with the
notes a stored question ends with in `chatQuestionNotes.ts` and the chat turn contracts in `chatTurns.ts` (the memory
and history limits, the reply stream line, the tool calls a turn leaves, and the sent tool calls), `teams.ts`,
with a team's identity apart in `teamIdentity.ts` so the card contracts in `home.ts` and the team page both load it,
`invites.ts`, `activity.ts`, `profiles.ts`, `profilePage.ts`, `admin.ts`, `search.ts`, `findings.ts`, `podcast.ts`,
`podcastEpisodePage.ts`, `topics.ts`, `notes.ts`, `pageHead.ts`, `signupCta.ts`, `viewerCounts.ts`, a topic's and a
podcast episode's counts, and `attachmentTypes.ts`, the file types the chat and topic attachment pickers offer on both
apps, the type a file name's suffix stands for, the word and workbook types the pipeline reads, the topic attachment
size limit, and its rejection line (`TOPIC_ATTACHMENT_TOO_LARGE_LINE`, `toTopicAttachmentRejectionLine`). `payloads.ts`
is the request payload schemas the api validates with `zValidator` and the types inferred from them, with the topic ones
in `topicPayloads.ts`, `enums.ts` and `plans.ts` hold the values that both sides compare, with the role and plan readers
`isAdminRole`, `isLeaderRole`, `isPaidPlan`, and `isPremiumPlan` that every role or plan check outside the api's gate
goes through, and `isOverageBillable`, the one rule for whether a scan past the daily limit bills, `storeBilling.ts`
holds the store entitlement ids and their plans, the plan and interval a store product id names, and each store's
subscription management page, `sources.ts` defines the Sources that an ingester reads, `seo.ts` builds topic slugs and
paths, meta descriptions, and the site's structured data, and `podcastEpisodes.ts` holds the podcast episode minutes and
findings limits, a cover's sizes and the `PodcastCover` shape, the show's and the hosts' names, the theme song's
credits, and a turn's transcript text; the speech model setting and the cover key and path are
`@carlnotes/server/podcastEpisodeSettings`. `spokenText.ts` writes markdown as its plain words for the meta description
and as the text Carl speaks, with fenced code and bare urls removed, a reply split into spoken parts on blank lines, and
a streaming reply's spoken parts returned as they finish. `time.ts` holds a minute, an hour, and a day in milliseconds,
`isUtcWeekend`, which says whether a moment falls on a weekend in UTC, and `withTimeLimit`, which fails work that
outlasts a time limit with the caller's error. `profiles.ts` also holds `toSessionProfileIdentity`, the signed-in user's
identity for a profile link, read from the session user. `reportedPath.ts` names a page by its route's shape, for
PostHog's page views and Sentry's page renders alike. `youtube.ts` builds a YouTube video's watch page url and its
player url, and holds `TOPIC_TUTORIAL_VIDEO`, the video on making a topic that the homepage, the menus, and the docs
build all read, with the marker a docs page writes for it. `mobileApp.ts` holds `MOBILE_APP_BUNDLE_IDENTIFIER`, the iOS
bundle identifier and Android package that the mobile app's config and the api's Apple provider both read, and
`MOBILE_APP_SCHEME` with its origin, which the app's config and the api's trusted origins both read. `signupGate.ts`
holds the signup gate as both clients see it: the gate cookie's name, `MIN_PASSWORD_LENGTH`, the credentials rule a
sign-up form parses with, and the app gate's challenge and proof shapes. `text.ts` holds `toOneLineText`, which puts
text on one line for a note, a title, a search query, or a hash, and `toDotSeparatedText`, which joins a line's parts on
middle dots. `mcpViews.ts` names the MCP Apps views, their version, and the data a tool result gives its MCP view,
`mcpViewHtml.ts` writes an MCP view's html, `mcpScanStatus.ts` holds the shapes and lines of the Scan tools' results,
`updates.ts` the updates list, and `mcpViewVersions.ts` reads `mcpViewVersions.json`, the MCP view versions stored in
object storage that `bun run mcp-views:freeze` writes. `mcpViewStoredResults.test.ts` type checks what a stored bundle
reads against the tool results. `pagination.ts` holds the page sizes a paged list offers, and `topicEdits.ts` turns a
saved topic's fields into the editable draft a topic edit starts from. `analyticsEvents.ts` holds the event types: the
user events keyed to a user, the bot events keyed to a bot's or an app's name, the browser's visit events, the entry
points, and an event's properties; the clients that send them are `@carlnotes/server/analytics`. `userAgent.ts` reads a
request's device properties and names a known crawler, unfurler, podcast app, or feed reader from a token list, and
`isCountedUserAgent` says whether a request counts as a viewer or a listener: not a crawler or an unfurler.
`scanFailure.ts` is how a stored Scan failure reads to a person, the failure reason a workflow stores, and the
application failure a workflow reads from an activity's failure, by its fields, so the module imports nothing from
Temporal. `avatars.ts` is the default avatar's letters and tint and an avatar url's version, `usernames.ts` how a
username is shaped, validated, and compared, with the word lists a random one is generated from in `usernameWords.ts`,
`emails.ts` the canonical form of a Gmail address, and `chatMentions.ts` the chat mention parser for the chat room
composer and the room's notifications, with the reserved usernames. `mcpScanStatusTestFixtures.ts` supplies the Scan
statuses the api tests and the scan MCP view's stories and smoke tests read. `topicFeedTestFixtures.ts` supplies
complete Feed, Topic, and Finding payloads for client/core/mobile tests and native stories. `chatTestFixtures.ts` holds
the podcast episode note that the contracts and web chat tests share, `podcastEpisodeTestFixtures.ts` the podcast
episode, summary, and chapter fixtures the contracts, core, web, and mobile tests and the component stories share, and
`textOrderTestFixtures.ts` holds `hasSubstringsInOrder`, the text order check that the api and web tests share.

- Universal: the root rule. It imports no `@carlnotes` package.
- A shape both sides need lives here once. A shape only one module reads stays in that module.
- `payloads.ts` exports each request payload's zod schema, and the contract modules each response's; the api
  validates with them through `zValidator` and the web app parses responses with them, so a drifted field fails at the
  boundary instead of silently. `payloads.ts` imports the contracts for their constants, and the contracts import only
  types back, so the two never load each other's values. A contract module loads another's values only one way:
  `chat.ts`, `findings.ts`, and `invites.ts` load `profiles.ts`, `profiles.ts` loads `avatars.ts` and `podcast.ts`,
  `profilePage.ts` loads `chat.ts` and `profiles.ts`, `teams.ts` loads `home.ts`, `profiles.ts`,
  `teamIdentity.ts`, and `topicPosts.ts`, `home.ts` loads `teamIdentity.ts` and `topicPosts.ts`, `activity.ts` loads `chat.ts`, `invites.ts`, `plans.ts`,
  `podcast.ts`, and `profiles.ts`, `topics.ts` loads `podcast.ts`,
  `findings.ts`, `chat.ts`, `invites.ts`, and `profiles.ts`, `podcastEpisodePage.ts` loads `topics.ts`,
  `podcast.ts`, and `findings.ts`, `routeShapes.ts` loads `chat.ts`, `invites.ts`, `payloads.ts`, and
  `topicPayloads.ts`, `chatTurns.ts` loads `chat.ts` and the types of `routeShapes.ts`, and the `*RouteContracts.ts`
  parts that `apiRouteContracts.ts` spreads load them all, so no two modules load each other.
- Nothing here touches the database, the network, or the DOM: the modules are values and their shapes.
- Tests: `bun test packages/contracts`.

`personalSources.ts` holds Personal sources items, receiving Source identities, confirmation outcomes, paging, and
context limits. `personalSourcesPayloads.ts` validates deliberate sends and selected transcript imports.
`personalSourcesUrls.ts` separates public candidate links from owner references. `canonicalUrl.ts` shares ingestion
normalization, and `networkAddress.ts` shares literal address classification with server fetching. New Source kinds use
dedicated Personal sources responses; `fetchedSourceKinds` preserves the generic Topic response enum for released
clients.

`clientTelemetry.ts` defines bounded native device headers and the browser user-agent fallback used by API events and
request monitoring. These untrusted descriptions are analytics only. `visitAnalytics.ts` shares URL/path redaction and
public Topic attribution between web and native. `monitoringRedaction.ts` contains the universal Sentry content/URL
redaction and replaces Expo push tokens in event messages, exceptions, and attached strings, re-exported by the server
and extended by native. `pushDevices.ts` holds the push registration, unregister, and preference payloads, the data a
push includes for the app to open (`pushNotificationData`), and `EXPO_PUSH_TOKEN_PATTERN`, the one token shape the api
accepts and the redaction replaces. It holds no token and sends nothing. `reportedPath.ts` also shapes Topic and Team
note routes and removes query strings and fragments.

`podcast.ts` also validates the audio-resolution response: an HTTPS `audioUrl` and ISO `expiresAt`. These credentials
are transient. `monitoringRedaction` removes signed URL queries and private podcast-feed path tokens.

The mobile app modules. `appVersions.ts` compares dotted app versions, says whether a build meets its platform's
minimum (a version that does not parse is served), and holds the 426 body `appVersionOutdatedResponse` with Carl's
line for it and the blocking update notice's words, `APP_UPDATE_COPY` and `toAppUpdateBody`. `mobileApp.ts` adds
the store urls: the Play listing from the package name, and the App Store record once `APP_STORE_ID` is set, the docs
"Get the app" page before. `appLinkPaths.ts` is the one list of web paths the app opens as app links, with the builders
for `apple-app-site-association`, `assetlinks.json`, and the Android intent filters.
`site.ts` holds `SITE_HOST` and `SITE_URL`, the site's production host and origin, and imports nothing, since the
app's config loads it under Node, which resolves no extensionless relative import.
`tolerantReads.ts` is the app's tolerant parse: `displayEnum(values)` declares a response enum that only drives display
by adding `UNKNOWN_CASE` from `enums.ts` to its values, so the inferred type includes it on both apps, and
`toTolerantResponseSchema` walks a contract and rebuilds it so a malformed list or record entry is dropped and counted
(`takeDroppedEntryCount`), an optional or nullable member that fails takes its default, a display enum's unknown value
takes the unknown case, and everything else stays strict. `routeShapes.ts` holds the small shapes the routes share:
the query and param schemas the api validates with, `okResponse`, the chat reply line, the room events, and a
recording's multipart post.
`apiRouteContracts.ts` is the route contracts the contract freeze serializes: every capability the app reaches, keyed as
the client parity check names it, with its method, path, and schemas, and `API_ROUTE_HELPERS` for a client export that
calls no route or only wraps another export. It holds the `ApiRouteContract` type and spreads eight part files, one per
area, that import the type back: `topicRouteContracts.ts` (topics, topic findings, viewer counts, notes, and the site
search), `chatRouteContracts.ts` (the private chat, the chat rooms, and the four voice routes), `teamRouteContracts.ts`
(teams, blocks, and reports), `accountRouteContracts.ts` (activity, the app sign-up gate, billing, profiles and the
account, and the Terms), `podcastRouteContracts.ts` (podcast episodes), `socialRouteContracts.ts` (reactions, comment
threads, the news, and Topic Posts), `personalSourcesRouteContracts.ts` (Personal sources), and
`dashboardRouteContracts.ts` (a Dashboard's snapshot). The part files load every other contract, and nothing loads
them back.

The read-only Personal sources email response returns the environment-configured mailbox for the empty-state hint. Finding views show public notes alone. Send and email routing use editable Topics.

`topicImages.ts` holds the topic image sizes' pixels, the original's size, the upload limits, the urls' shape and
paths, and the regenerate, render, upload, and quota contracts, with the size, origin, render kind, and render status
enums in `enums.ts` and `imageRegenerationLimit` per plan in `plans.ts`. `home.ts` holds the home payload: the Home topics, Home podcasts, and Home posts
counts, the topic and podcast episode card shapes, the home's Topic Post cards, and a user's topics. `podcast.ts` adds `homePodcastEpisode`, a
pinned podcast episode as the console and the podcast episode page's rank dialog list it.

`topicPosts.ts` holds a Topic Post's card and page, its save payload, the title and word limits, the word count, the
body's plain paragraphs, and how a write ends for its editor. A topic's page and a profile's each include their
Topic Post cards, and a podcast episode card includes its reaction count. A profile's payload holds every Topic
Post card of its person in `profileTopicPosts`, the pinned ones first, with how many of the first are pinned, each
card with whether its topic is public, and a person's pinned Topic Posts have no limit. A team page's holds every
published Topic Post card of its topics in `topicPostCards`, the pinned ones first, and their film cards in the
optional `topicPodcastEpisodeVideoCards`. The home's payload holds `homeTopicPosts` and the optional `newestTopicPosts`, the
last `NEW_TOPIC_POST_DAYS` days' posts.
`homeTopicPostsResponse` is the pinned Topic Posts and the ones a pin may name, as an admin's home rank dialog lists
them.

`topicPosts.ts` also holds a post's discussion as its page reads it, with its recording's `transcript` in
`podcastEpisodeTranscriptTurn`s from `podcast.ts`, the reader's discussion regenerations this
month, the regenerate payload with its note's limit, `TOPIC_POST_DISCUSSION_TITLE`, and the shape the podcast player
plays a discussion in: `toTopicPostDiscussionPodcastEpisode`, `toDiscussionTopicPostId` for the player's id, and
`toTopicPostDiscussionAudioPath`. `visitAnalytics.ts` holds `toPlayerVisitEvent`, which reports a discussion's play
as `social_topic_post_discussion_play`. `reports.ts` has the `topicPostImage` and `topicPostBodyImage` subject kinds
and `isImageReportSubjectKind`. `topicPostBodyImages.ts` holds a body image's files, its path and its parse, and the
ids a body names, and `topicPosts.ts` the reading column's width and the code block languages. `plans.ts` holds each
plan's `topicPostBodyImageLimit` and `topicPostBodyImageBytes`. `chat.ts` gives a stored chat turn its `topicPost`,
and `payloads.ts` lets a topic chat turn name a `topicPostId`, never beside a podcast episode chapter.

`news.ts` holds the news: the `newsWindows` a read covers with their labels and lengths, `NEWS_PAGE_SIZE`, the
`newsQuery` a read takes, a `NewsEvent` and its kinds, the `newsResponse` of one page, and the title, the failed line,
and each window's empty line. `commentMentions.ts` holds a signed-in user's unseen Comment Mentions, the payload that
marks them seen, and the places a mention badge sits. `topicPodcastEpisodeVideoWork.ts` holds the task queues, the
workflow names, and the workflow ids of a film's render, its rebuild, and the film backfill, with the backfill's
summary, for the worker, its workflows, and the Temporal client.

`dashboards.ts` holds a Dashboard, which the page copy calls "Specials": the three kinds and their page names and paths,
with `toDashboardPageLinks` for a person's three pages and `toDashboardLinks` for a viewer count line's links, the items
a view counts and the play formats, the trend ranges, the retention days, the city minimum that keeps a place private,
the summary and its counts, the snapshot each chart reads, and the path params, the query, and the response of a read.
`countryCenters.ts` holds each country's center, where a country's pin sits, and `countryNames.ts` a country code's
English name. `dashboardWork.ts` holds the signal that asks a running Dashboard rebuild to build again, which the
Temporal client and the workflow share. `placeTestFixtures.ts` holds the places the tests share, and only tests import
it. `arrays.ts` holds `toChunks`, which splits a list into batches of one size. `teams.ts` holds `toAlphabeticalTeams`,
teams in alphabetical order by name, and `mcpViews.ts` holds the dashboard MCP view's data and `DASHBOARD_TOOL_KINDS`,
the `read_dashboard` tool's `dashboardKind` value for each Dashboard kind.
