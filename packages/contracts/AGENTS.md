# packages/contracts/

`@carlnotes/contracts`, the universal part of what every workspace may import: the zod response shapes, the request
payloads, and the constants that the api validates with and the web app parses against. Every app and package imports
it, and it imports only `zod`.

`noteTestFixtures.ts` supplies inert Notes table rows to both apps' stories and shared-component tests.
The contract modules sit at the package root, one per domain, each imported by its own path
(`@carlnotes/contracts/chat`): `chat.ts`, with the notes a stored question ends with in `chatQuestionNotes.ts` and
the chat turn contracts in `chatTurns.ts` (the memory and history limits, the reply stream line, the tool calls a turn
leaves, and the sent tool calls), `teams.ts`, `invites.ts`, `activity.ts`, `profiles.ts`, `profilePage.ts`,
`admin.ts`, `search.ts`, `findings.ts`, `podcast.ts`, `podcastEpisodePage.ts`, `topics.ts`, `notes.ts`, `pageHead.ts`,
`signupCta.ts`, and `viewerCounts.ts`, a topic's and a podcast episode's counts. `payloads.ts` is the request
payload schemas the api validates with `zValidator` and the types inferred from them, with the topic ones in
`topicPayloads.ts`, `enums.ts` and `plans.ts` hold the values that both sides compare, with the role and plan readers
`isAdminRole`, `isLeaderRole`, `isPaidPlan`, and `isPremiumPlan` that every role or plan check outside the api's gate
goes through, `sources.ts` defines the Sources
that an ingester reads, `seo.ts` builds topic slugs and paths, meta descriptions, and the site's structured data, and
`podcastEpisodes.ts` holds the podcast episode minutes and findings limits, a cover's sizes and the `PodcastCover`
shape, the show's and the hosts' names, the theme song's credits, and a turn's transcript text; the speech model setting
and the cover key and path are `@carlnotes/server/podcastEpisodeSettings`. `spokenText.ts` writes markdown as its plain
words for the meta description and as the text Carl speaks, with fenced code and bare urls removed, a reply split into
spoken parts on blank lines, and a streaming reply's spoken parts returned as they finish. `time.ts` holds a minute, an
hour, and a day in milliseconds, `isUtcWeekend`, which says whether a moment falls on a weekend in UTC, and
`withTimeLimit`, which fails work that outlasts a time limit with the caller's error. `profiles.ts` also holds
`toSessionProfileIdentity`, the signed-in user's identity for a profile link, read from the session user.
`reportedPath.ts` names a page by its route's shape, for PostHog's page views and Sentry's page renders alike.
`youtube.ts` builds a YouTube video's watch page url and its player url, and holds `TOPIC_TUTORIAL_VIDEO`, the video on
making a topic that the homepage, the menus, and the docs build all read, with the marker a docs page writes for it.
`mobileApp.ts` holds `MOBILE_APP_BUNDLE_IDENTIFIER`, the iOS bundle identifier and Android package that the mobile
app's config and the api's Apple provider both read, and `MOBILE_APP_SCHEME` with its origin, which the app's config
and the api's trusted origins both read. `signupGate.ts` holds the signup gate as both clients see it: the gate cookie's
name, `MIN_PASSWORD_LENGTH`, the credentials rule a sign-up form parses with, and the app gate's challenge and proof
shapes.
`text.ts` holds `toOneLineText`, which puts text on one line for a note, a title, a search query, or a hash, and
`toDotSeparatedText`, which joins a line's parts on middle dots.
`mcpCards.ts` names the MCP Apps cards and the data a tool result gives its card, `pagination.ts` holds the page
sizes a paged list offers, and `topicEdits.ts` turns a saved topic's fields into the editable draft a topic edit starts
from.
`analyticsEvents.ts` holds the event types: the user events keyed to a user, the bot events keyed to a bot's or an
app's name, the browser's visit events, the entry points, and an event's properties; the clients that send them are
`@carlnotes/server/analytics`. `userAgent.ts` reads a request's device properties and names a known crawler, unfurler,
podcast app, or feed reader from a token list, and `isCountedUserAgent` says whether a request counts as a viewer or a
listener: not a crawler or an unfurler. `scanFailure.ts` is how a stored Scan failure reads to a person, the
failure reason a workflow stores, and the application failure a workflow reads from an activity's failure, by its
fields, so the module imports nothing from Temporal. `avatars.ts` is the default avatar's letters and tint and an avatar
url's version, `usernames.ts` how a username is shaped, validated, and compared, with the word lists a random one is
generated from in `usernameWords.ts`, `emails.ts` the canonical form of a Gmail address, and `chatMentions.ts` the chat
mention parser for the chat room composer and the room's notifications, with the reserved usernames.
`topicFeedTestFixtures.ts` supplies complete Feed, Topic, and Finding payloads for client/core/mobile tests and native stories.
`chatTestFixtures.ts` holds the podcast episode note that the contracts and web chat tests share,
`podcastEpisodeTestFixtures.ts` the podcast episode, summary, and chapter fixtures the contracts, core, web, and
mobile tests and the component stories share, and `textOrderTestFixtures.ts` holds `hasSubstringsInOrder`, the text
order check that the api and web tests share.

- Universal: the root rule. It imports no `@carlnotes` package.
- A shape both sides need lives here once. A shape only one module reads stays in that module.
- `payloads.ts` exports each request payload's zod schema, and the contract modules each response's; the api
  validates with them through `zValidator` and the web app parses responses with them, so a drifted field fails at the
  boundary instead of silently. `payloads.ts` imports the contracts for their constants, and the contracts import only
  types back, so the two never load each other's values. A contract module loads another's values only one way:
  `chat.ts`, `findings.ts`, and `invites.ts` load `profiles.ts`, `profiles.ts` loads `avatars.ts` and `podcast.ts`,
  `profilePage.ts` loads `chat.ts` and `profiles.ts`, `activity.ts` loads `chat.ts`, `invites.ts`, `plans.ts`,
  `podcast.ts`, and `profiles.ts`, `topics.ts` loads `podcast.ts`,
  `findings.ts`, `chat.ts`, `invites.ts`, and `profiles.ts`, `podcastEpisodePage.ts` loads `topics.ts`,
  `podcast.ts`, and `findings.ts`, `routeShapes.ts` loads `chat.ts`, `invites.ts`, `payloads.ts`, and
  `topicPayloads.ts`, `chatTurns.ts` loads `chat.ts` and the types of `routeShapes.ts`, and the `*RouteContracts.ts`
  parts that `apiRouteContracts.ts` spreads load them all, so no two modules load each other.
- Nothing here touches the database, the network, or the DOM: the modules are values and their shapes.
- Tests: `bun test packages/contracts`.

`clientTelemetry.ts` defines bounded native device headers and the browser user-agent fallback used by API events and request monitoring. These untrusted descriptions are analytics only. `visitAnalytics.ts` shares URL/path redaction and public Topic attribution between web and native. `monitoringRedaction.ts` contains the universal Sentry content/URL redaction, re-exported by the server and extended by native. `reportedPath.ts` also shapes Topic and Team note routes and removes query strings and fragments.

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
the query and param schemas the api validates with, `okResponse`, the chat reply line, and the room events.
`apiRouteContracts.ts` is the route contracts the contract freeze serializes: every capability the app reaches, keyed as
the client parity check names it, with its method, path, and schemas, and `API_ROUTE_HELPERS` for a client export that
calls no route. It holds the `ApiRouteContract` type and spreads five part files, one per area, that import the type
back: `topicRouteContracts.ts` (topics, topic findings, viewer counts, notes, and the site search),
`chatRouteContracts.ts` (the private chat and the chat rooms), `teamRouteContracts.ts` (teams, blocks, and reports),
`accountRouteContracts.ts` (activity, the app sign-up gate, billing, profiles and the account, and the Terms), and
`podcastRouteContracts.ts` (podcast episodes). The part files load every other contract, and nothing loads them back.
