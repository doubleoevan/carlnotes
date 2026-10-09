## Context

`shared/analytics.ts` exports `trackEvent(event, userId, properties)`, a union of nineteen event names, and a PostHog
client that never starts without `POSTHOG_API_KEY`. A route reads `plan` and the three device properties once through
`toAnalyticsProperties(context)` in `api/currentUser.ts` and passes them down, so no event costs a read of its own.
The worker emits `first_scan_completed` with the plan it already loads. The browser's `visitAnalytics.ts` runs
PostHog cookieless with person profiles off, captures one `$pageview` per route change, and rewrites every path and
url on the way out through `toReportedPath`, so no id reaches a visit.

The MCP transport is stateless, so the `clientInfo` an AI app sends at `initialize` is gone by its next request.
`resolveToolCaller` already tells a visitor from a user, and a token's session names the OAuth app it was issued to.
The api renders every page through the ui
server from one catch-all in `api/index.ts`, and serves the feeds, the sitemap, and the llms files from
`api/documents.ts` and `api/podcast/podcastFeeds.ts`. `shared/userAgent.ts` reads a user agent for the device
properties and has a tested token list for in-app browsers, which is the shape the bot list takes.

The `seo-crawl-cleanup` change already renders a topic page's findings up to fifty with the extras hidden by
JavaScript, and the scan recap's "Read more" clip is measured by a layout effect, so the recap renders whole on the
server. What remains without JavaScript is a homepage card's "+ N more" button and the homepage's closed section.

## Goals / Non-Goals

**Goals:**

- Answer which topics and episodes are read and listened to, who creates, subscribes, chats, and teams up, and what
  bots and AI agents do, from three populations that are never joined.
- Keep every property a short identifier, every route a user waits on free of a read for an event, and self-host at
  zero telemetry.
- Give a reader without JavaScript every collapsed thing on a public page, as content shown or as a working link.

**Non-Goals:**

- Ranking the homepage's Popular section by views. It keeps subscriber count until the view data exists to compare.
- Joining a visit to a user, identifying a visitor, or storing any visitor id.
- Session recording, autocapture, or any typed value in an event.
- A dashboard in code. The PostHog dashboards and the funnel are built by hand after deploy.

## Decisions

**Three capture functions, one client.** `shared/analytics.ts` keeps `trackEvent(event, userId, properties)` for the
user population and adds `trackBotEvent(event, botName, properties)`, which captures with `distinctId` set to the
bot's or app's name and `$process_person_profile` false, so a bot never gets a person profile. The browser's
`visitAnalytics.ts` adds `captureVisitEvent(event, properties)`, guarded by the browser key like `captureVisit`, and
every visit event passes through `before_send` with the page views. The three event unions are typed apart:
`UserAnalyticsEvent`, `BotAnalyticsEvent`, and `VisitAnalyticsEvent`, and the visit names have the `visit_` prefix.

**`entryPoint` is a request property.** `AnalyticsProperties` gains `entryPoint`, one of `web`, `mcp`, `email`, `feed`,
`worker`, or `webhook`. `toAnalyticsProperties(context)` sets `web`. The MCP tool adapter builds its properties from
the tool caller with `mcp`, the unsubscribe link sets `email`, a feed's audio route sets `feed`, the worker sets
`worker` beside the plan it loads, and the Stripe handler sets `webhook`. A browser request keeps the plan and the
device properties. The email, feed, worker, and webhook entry points send no device property, and the email and feed
events no plan either, since no session is behind them.

**`teamId` and `isTopicPublic` come from what the route holds.** A team route passes the team id it already
authorized. A topic route passes `isTopicPublic` from the topic row it loaded for the gate. No route a user waits on
adds a read for an emit: where the route has no row in hand, the property is left off. The webhook's previous plan
and an MCP app's registered name, read once per app and kept in memory, are the only reads made for analytics.

**The MCP population is the app.** `mcp_connected` and `mcp_tool_called` are keyed to the AI app's `clientName`,
with `callerKind` saying whether a visitor or a user called. The transport is stateless, so no request after
`initialize` holds the client's own name. A user's app is named by its OAuth registration, read with the token's
session in `resolveToolCaller`, and a visitor's app by its user agent's product token. `mcp_connected` fires from an
auth after hook when the app trades its authorization code for a token at `/mcp/token`, which is the moment the
authorization completes, and a refresh reports nothing. `mcp_tool_called` fires from one wrapper around the server's
`registerTool`, so every tool reports its outcome without knowing it. The product events a tool already emits, such
as `topic_created` or `finding_rated`, stay keyed to the user with `entryPoint` `mcp`. The agent population says what
apps do, and the user population says what users did through them, so neither name spans two populations.

**One middleware classifies bots.** `shared/userAgent.ts` gains `toBot(userAgent)`, which returns the bot's `kind`
(`crawler`, `unfurler`, `podcastApp`, or `feedReader`) and `name` from a named token list, or null for an unknown
user agent. `api/index.ts` mounts one middleware ahead of the content, document, and page routes. After the handler
runs, it reads the bot, the response's content type, and the status, and emits `crawler_fetched` for a crawler on an
html, xml, or text response, `link_unfurled` for an unfurler on a page or a preview image, and `feed_fetched` for a
podcast app or a feed reader on a feed. A crawler's fetch of an image, script, style, or font emits nothing, which
keeps avatars, favicons, and assets out without a path list. The preview card is the one image reported, and only
for an unfurler. `routeShape` is `toReportedPath` of the path on all three events, and `kind` is the route's first
segment after any `/api`, or `home` for `/`. `topicId` is sent when the handler set
`context.set("analyticsTopic", …)` from the row it loaded and the topic is public, which the preview card and the
feed routes do. A page the ui server renders sets nothing, so a page fetch reports its route shape alone.

**A feed's first fetch is a column.** `episode_feed_tokens` gains `first_fetched_at`. The token feed route updates
it where it is null and the user agent is a podcast app, and the write's returning row is what fires
`podcast_feed_added` once, keyed to the token's user with `entryPoint` `feed`. `podcast_feed_reset` fires where the
token is deleted. The token itself is never a property.

**A listen is reported where it is counted.** `savePodcastEpisodeListen` emits `episode_played` for a playback start
and `episode_completed` for a finish, `entryPoint` `web`. A feed's audio route under
`/podcast-feeds/:token/episodes/…` emits `episode_played` with `entryPoint` `feed`, keyed to the token's user, on
every GET of the audio, exactly as the play count it keeps beside it.

**The user events read what their routes already hold.** `login_completed` comes from the same Better Auth after
hook, on `/sign-in/email` and `/callback/:provider`, with `method` `email` or the provider's name. An oauth signup
arrives through the callback with a new session too, so it reports a login beside its signup. `checkout_started`
fires in the checkout route with `checkoutPlan` and `interval`, since `plan` already names the plan the user is on.
`subscription_started`, `plan_changed`, and `subscription_canceled` fire in `applySubscriptionState`, which reads the
plan it is about to replace, one row on a webhook that nobody waits on, so `fromPlan` names it. `topic_updated`'s
`changedFields` lists the names of the saved fields that differ from the loaded row, and a flip of
`isPodcastEnabled`, which the podcast switch saves through `updateTopicFields`, fires `podcast_toggled`. The form
path fires `source_added` per inserted source and `source_removed` per row the stale delete returns, and the Topic
Tools' add-source and remove-source adapters fire the same two with their `origin` instead of `topic_edited`. The
tools take the request's analytics properties from the chat and the MCP adapters, and a room turn, which runs after
its request, leaves them off. `scan_completed` fires in `finishScan` with `trigger` from the scan row's `isManual`,
`findingsKept` from the count it already takes, and `status`. `scan_stopped` fires in the stop route.
`invite_accepted` and `invite_declined` have `kind` `email`, `username`, or `link` and `pageKind` `topic` or `team`
from the invite row. `team_member_removed` has `isSelf`. `chat_turn_sent`'s `chatKind` is `topic`, `team`, or
`new_topic`, since a team page has a private chat of its own. `note_comment_added` fires from the thread routes that
start a thread and reply to one, with `isThreadStart`, and `note_thread_resolved` from the resolve route, so no
write has to say what changed.

**Visit events fire at the click or the play.** `visit_topic_viewed` fires from the topic page when its topic id
changes, with `topicId` only if the topic is public. `visit_episode_played` and `visit_episode_completed` fire from
the player store's play and `ended` handlers, with `episodeId` and `topicId` only if the episode's topic is public,
which the episode contract gains as `topicVisibility`. `visit_finding_clicked` fires from the resource row's link
with the source's host.
`visit_cta_clicked` fires from `AnchorLink` for any internal href with a `cta` query, so every tagged button reports
through one place with the slug signup already validates. `visit_share_clicked` fires from the two share menus with
`kind` `topic` or `team` and `channel` `copy-link`, `share-sheet`, `rss`, `invite`, or a platform option's name such
as `linkedin` or `email`. `visit_podcast_subscribe_clicked` fires from the feed dialog's app link and its copy button,
with `channel` `app` or `copy-link`. A visit event on a profile, invite, team, or private topic page has no id, which
`toPublicTopicProperties` in `visitAnalytics.ts` decides for every site that names a topic.

**The spec is rewritten, not patched.** The fifteen-event requirement is removed and replaced by a three-population
requirement, since nearly every scenario changes. The browser requirement keeps each scenario and reads page views
plus the named visit events. "Visits and accounts stay separate" names bots as the third population.

**No-JS expanders.** `MoreButton` takes an optional `noScriptHref`. With one, it renders the button with
`SCRIPTED_ONLY_CLASS` and a plain `AnchorLink` to that href with `SCRIPTED_HIDDEN_CLASS`, so a reader without
JavaScript follows a link to the topic's page and a browser sees the button. The homepage card passes the topic's
path. The accordion primitive's `forceMount` body hides a closed section with `scripted:data-[state=closed]:hidden`,
so the homepage's closed section shows without JavaScript and hides until opened with it. The audit of every toggle
on a public page, with its state without JavaScript:

| Toggle | Without JavaScript | Change |
|---|---|---|
| homepage card "+ N more" | button does nothing | a link to the topic page |
| homepage closed section | hidden | shown |
| topic page findings expander | hidden, every row shown (seo-crawl-cleanup) | none |
| scan recap "Read more" | no clip, whole note shown, no toggle | none |
| topic info popovers and notes | not in the html | none, the finding rows and the recap hold the content |
| podcast chapters expander and tables | every row in the html, rows hidden with JavaScript | none |
| pagination rows | hidden, every row in the html | none |
| header menu and search | the desktop header's links show, search needs scripts | none |

## Risks / Trade-offs

- [Event volume from bots] → `crawler_fetched` fires per page a known crawler fetches. The site is small, PostHog's
  free tier is a million events a month, and a `HEAD` request or a non-200 response emits nothing. If a crawler
  storms, the middleware's token list is the switch.
- [A visit event names a public topic] → by the request's own rule. The path rewrite still runs, so the url reports
  its shape, and a private topic's events have no id.
- [`$process_person_profile` false and PostHog's person counts] → bot events create no person, which is the point,
  and the free tier's event count still includes them.
- [An unfurler also fetches the page] → it reports `link_unfurled` for the page and for the card, two events per
  unfurl. The dashboard counts the card.
- [The feed-first-fetch column] → one migration, routine on main.

## Migration Plan

1. Deploy. The `first_fetched_at` migration runs on deploy, and no setting changes.
2. Build the three PostHog dashboards and the funnel by hand, as the proposal lists.
3. Judge the Popular section's ranking against `visit_topic_viewed` after a month of data.

Rollback: revert the commit. The column stays, unused, until a later change drops it.
