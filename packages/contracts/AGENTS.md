# packages/contracts/

`@carlnotes/contracts`, the universal part of what every workspace may import: the zod response shapes, the request
payloads, and the constants that the api validates with and the web app parses against. Every app and package imports
it, and it imports only `zod`.

The contract modules sit at the package root, one per domain, each imported by its own path
(`@carlnotes/contracts/chat`): `chat.ts`, with the notes a stored question ends with in `chatQuestionNotes.ts`,
`teams.ts`, `invites.ts`, `activity.ts`, `profiles.ts`, `admin.ts`, `search.ts`, `findings.ts`, `podcast.ts`,
`podcastEpisodePage.ts`, `topics.ts`, `notes.ts`, `pageHead.ts`, `signupCta.ts`, and `viewerCounts.ts`, a topic's and a
podcast episode's counts. `payloads.ts` is the request
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
`text.ts` holds `toOneLineText`, which puts text on one line for a note, a title, a search query, or a hash.
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
`chatTestFixtures.ts` holds the podcast episode note that the contracts and web chat tests share, and
`textOrderTestFixtures.ts` holds `hasSubstringsInOrder`, the text order check that the api and web tests share.

- Universal: the root rule. It imports no `@carlnotes` package.
- A shape both sides need lives here once. A shape only one module reads stays in that module.
- `payloads.ts` exports each request payload's zod schema, and the contract modules each response's; the api
  validates with them through `zValidator` and the web app parses responses with them, so a drifted field fails at the
  boundary instead of silently. `payloads.ts` imports the contracts for their constants, and the contracts import only
  types back, so the two never load each other's values. A contract module loads another's values only one way:
  `chat.ts` and `findings.ts` load `profiles.ts`, `profiles.ts` loads `avatars.ts`, `topics.ts` loads `podcast.ts`,
  `findings.ts`, `chat.ts`, `invites.ts`, and `profiles.ts`, and `podcastEpisodePage.ts` loads `topics.ts`,
  `podcast.ts`, and `findings.ts`, so no two modules load each other.
- Nothing here touches the database, the network, or the DOM: the modules are values and their shapes.
- Tests: `bun test packages/contracts`.
