# Design

## Context

See proposal.md for why. The current state that shapes the approach:

- `packages/db/viewerCounts.ts` keeps one all-time Redis HyperLogLog counter per topic, podcast episode, profile, and
  team. The minute sweep (`apps/worker/syncViewerCounts.ts`) copies changed counters to `viewer_counters` and the count
  columns, and rebuilds Redis from Postgres after a restart. A Redis failure loses a count, by design.
- `apps/api/counts/countsRoute.ts` counts topic, profile, and team page views from same-origin posts, rate limited per
  sender, and skips crawlers through `isCountedUserAgent`. The sender is told apart by `toViewerElement`, a keyed hash
  that is never stored.
- Finding opens write `finding_views` and raise `findings.view_count` in `apps/api/topic/findingFeedback.ts`.
- Plays are cumulative: `podcast_episode_listens` holds one row per user and podcast episode with `playCount` and
  `videoPlayCount`, written by `apps/api/podcast/podcastEpisodeListens.ts`. File downloads and feed downloads count
  listeners in `podcastEpisodeFiles.ts` and `podcastFeeds.ts`.
- Nothing has a day or a place. `apps/api/trustedProxies.ts` resolves the client address through `TRUSTED_PROXIES`,
  which holds Cloudflare's ranges in production.
- The Activity page (`apps/web/src/pages/ActivityPage.tsx`) is the layout reference: `PAGE_CLASS`, a
  `PAGE_HEADER_CLASS` row with the page icon and title on the left and an action on the right, `UserProfileLink` under
  it, then `Accordion type="multiple"` of `AccordionSection`s. Mobile has its own `AccordionSection` adapter.
- `packages/core/components/UserMenuItems.tsx` owns the user menu's rows, order, and dividers for both apps. Each app
  supplies `Link`, `Action`, and `Divider` adapters and maps a row's label to its icon.
- TanStack Router turns `profiles.$userId.tsx` into a layout for any sibling file that extends its path. Nested
  Dashboard routes need the trailing-underscore form, as `topics.$topicId_.$topicSlug.tsx` uses.

## Decided first

These eight decisions were approved before `/opsx:apply`. The specs and tasks follow them.

1. **Domain words.** Copy says Visitors and visits; identifiers say **view**, matching `countTopicView`,
   `finding_views`, and the `/view` routes. A **view** is one counted open of a topic page, a finding, or a Topic Post
   page by one person, at most once per person, item, and UTC day. A **play** keeps its existing meaning: one accepted
   start of a podcast episode in one **format**, `audio` or `video`, finished or not. The day tables are **daily view
   counts** (`daily_view_counts`) and **daily play counts** (`daily_play_counts`). A **place** is the country, region,
   city, latitude, and longitude Cloudflare sent. A **dashboard** is one of the three pages, which copy calls Specials,
   and a **dashboard snapshot** is the nightly result one page reads. Visit was rejected for identifiers: the domain
   model reserves visitor for a signed-out person, and a view counts users and visitors alike. The domain-model skill
   gains seven rows for these words, with format inside the play row.
2. **How views and plays get a time and a place.** One daily count row per item, place, and UTC day, with no per-event
   rows. A view or play is buffered in Redis, and the minute sweep adds it to Postgres. This differs from the brief's
   direct upsert per open. Page opens are the hottest write path, and an upsert per open would contend on a popular
   item's row. The viewer counters already take this path, so a Redis restart loses at most one minute of daily count
   counts, the same loss the counters accept.
3. **Retention.** 400 days. That covers the longest range plus a month, and the nightly job deletes older rows.
4. **Trend range.** A preset list of completed UTC days: 7, 30, 90, and 365, defaulting to 30. A free range would need
   a date picker on both platforms and a snapshot per possible range. The year draws 52 weekly points, each summing
   its seven days, which cuts its share of a snapshot about seven times. On a large Podcast Dashboard a daily year is
   about 4.3 MB of JSON. The 90-day range stays daily, and Carl's paragraph reads its two 30-day periods from it.
5. **City minimum.** Ten distinct people per item and format, counted after access filtering. A smaller city rolls
   into its country's pin. If the country's remainder would be between 1 and 9, the smallest shown city also rolls in,
   until the remainder is 0 or at least 10, so no city can be found by subtraction.
6. **Routes.** Topic Dashboard at `/profiles/$userId/specials/topics`, Podcast Dashboard at
   `/profiles/$userId/specials/podcasts`, and Team Dashboard at `/teams/$teamId/specials`. The user menu's "Team
   Specials" row opens `/teams/specials`, which goes to the user's first team alphabetically. With no team, it goes to
   `/teams`. Mobile mirrors the paths under `apps/mobile/app/`.
7. **Menu icons.** Each row gets its own Lucide chart icon, left of its text like every other row: ChartBar for Topic
   Dashboard, ChartPie for Podcast Dashboard, and ChartLine for Team Dashboard. Each page's header shows its row's
   icon, as the Activity page does.
8. **What the bar, pie, word cloud, and map count.** The last 365 completed days from the daily counts, as do the
   summary strip's visitors and plays. The trend has its own range. The daily counts start on deploy, and no earlier
   history is made up.

## Goals / Non-Goals

**Goals:**

- One dashboard component and one set of series functions, rendered by thin chart adapters on web, mobile, and MCP.
- Reads that never touch the daily counts on request: every chart reads a snapshot built nightly.
- No IP address, raw header, or individual event stored anywhere.

**Non-Goals:**

- Live charts that change during the day. Ranges end at the last completed UTC day.
- Backfilling places or days for counts made before the daily counts existed.
- Charts for a single topic or a single podcast episode. Each page covers a person's or a team's whole set.

## Decisions

### Counting a view or a play

`packages/db/dailyCountBuffer.ts` gains `addDailyView` and `addDailyPlay`. The counting in
`apps/api/counts/viewerCounts.ts` and `apps/api/topicPost/topicPostViewerCounts.ts` calls them beside the existing
counters at every call site: the topic page view, a new Topic Post page view route, the finding view route in
`apps/api/topic/findings.ts`, the listen route, file downloads, and feed downloads. Each count:

1. Skips crawlers and sends with no viewer element, exactly as the counters do today.
2. Turns the viewer element into a person hash keyed with the auth secret, so no user id reaches Redis or a saved
   sketch, and counts nothing without the secret. A view adds the hash to one claim set per item and day, with `SADD`
   and a 26-hour expiry, so a view counts once per person, item, and day. A play claims a key for five minutes per
   person, podcast episode, and format with `SET NX`, so a podcast app's retried download and a player start sent
   twice each count once.
3. Adds one to the row's field in one Redis hash, `daily-counts:counts`, whose field names the daily count row: the item
   or podcast episode, the format, the UTC day, and the place. It adds the person hash to the row's sketch, `PFADD
   daily-counts:people:<field>`. The hash itself lists the changed rows.

The minute sweep takes the hash under the existing `viewer-count-sync` lease, moving each row's sketch to a taken key in
the same script. It adds the counts to `daily_view_counts` or `daily_play_counts` in transactions of 100 rows. A batch
reads its rows' saved sketches in one locked query, merges each taken sketch into its row's saved sketch in one Redis
round trip through the counters' restore pattern (write the saved bytes to a temporary key, `PFMERGE`, and `GET` the
result), and adds each kind in one multi-row upsert. Then it drops the taken sketches. A failed batch goes back into the
hash and the live sketches, and a play of a deleted podcast episode is dropped.

Rows:

- `daily_view_counts`: `item_kind` (`topic`, `finding`, or `topicPost`), `item_id`, `day`, `place_key`, `country`,
  `region`, `city`, `latitude`, `longitude`, `view_count`, and `viewer_sketch` (bytea). The primary key is
  `(item_kind, item_id, day, place_key)`, with an index on `(day)` for the retention delete.
- `daily_play_counts`: `podcast_episode_id`, `format`, `day`, the same place columns, `play_count`, and
  `listener_sketch`. The primary key is `(podcast_episode_id, format, day, place_key)`.

`place_key` is a hash of the five place values. An unknown place has a null country and still counts toward totals,
but it never gets a pin. The sketches let the nightly job count distinct people across days, places, and items with
`PFCOUNT` over merged keys. A sparse sketch for a small count is tens of bytes.

*Alternatives:* a direct Postgres upsert per open (rejected in Decided first 2), per-event rows rolled up nightly
(stores individual events, which the privacy rule forbids), and counts without sketches (the city minimum and the
range totals need distinct people, not opens).

### Reading a place only through Cloudflare

`apps/api/requestPlace.ts`, beside `trustedProxies.ts`, returns a place only if three things hold. The request has a
`cf-ray` header. `TRUSTED_PROXIES` is set. The x-forwarded-for entry right of the resolved client address lies in a
trusted range, which means a Cloudflare hop reported the client. The ingress appends the real peer, so a direct
request to the origin always ends in the sender's own address, and a forged `cf-ipcity` is ignored. Latitude and
longitude are stored exactly as the decimal strings Cloudflare sent. Without a place, the view still counts under the
unknown place. A deployment without Cloudflare gets totals and an empty map.

### Snapshots, built nightly

A new Temporal workflow, `buildDashboardSnapshots`, runs from a nightly schedule after the UTC day closes. For each
subject that owns at least one item, it computes one snapshot per subject, item kind or format, and access level, then
writes them to `dashboard_snapshots`. The access levels are `public` and `full`: the owner, or a team's active members.
A team's snapshots leave out a private team topic whose legacy Personal sources text is not converted yet
(`public_outputs_version` 0), as the topic view rule does for members. A full snapshot is built only if it differs from
the public one. Each snapshot holds every chart's series for every trend range, built by
`apps/worker/dashboards/dashboardSeries.ts`, so the apps only render. The workflow then writes Carl's paragraph, renders
the share image, deletes daily count rows past 400 days, and purges each subject's edge cache tag.

An unchanged snapshot, compared by content hash, is not written again: it keeps its body, paragraph, and image, and
only moves to the new day. The nightly run builds 25 Dashboards per activity, and writes the changed summaries'
paragraphs and images 25 at a time, where a failed batch is logged and skipped so the retention delete still runs. A
visibility, ownership, deletion, or publication change deletes the subject's snapshots and their share images from R2,
purges its tag right away without the page purge debounce, and starts a one-subject rebuild under one workflow id per
Dashboard. The share image route serves only the image the current public summary names, so a deleted snapshot's image
is gone from the route and, with the purge, from the edge. A change during a running rebuild signals it to build again
once its current build ends. Each delete first starts a new snapshot generation in Redis, and a build that loaded its
daily counts before the delete writes nothing. Until the rebuild finishes, the route serves an empty dashboard for that
subject. A membership change starts none: it changes no item's access, since the route checks membership on every full
request, and the member count refreshes nightly with the other numbers.

*Alternative:* computing series on request with an edge cache. It makes the first read after midnight scan a year of
daily counts, and it lets a cache key leak a private item between access levels.

### The JSON route and the pages

`GET /api/dashboards/:dashboardKind/:subjectId?itemKind=` (or `?format=` for podcasts) returns one snapshot. A public
snapshot is cached at the edge under `dashboard:<kind>:<subjectId>` until the next nightly purge. The first Cloudflare
cache rule gains the line `or starts_with(http.request.uri.path, "/api/dashboards/")`, a manual change made before the
deploy. A full snapshot is `private, no-store`, and access is checked on every request. A non-member's Team Dashboard
request returns the summary strip with no series, paragraph, or share image, and the page renders the same. The route
is rate limited per user or address at 120 requests a minute, with no rate limit header and with the page render's own
reads skipped, and an unknown kind is a 400. A team rename or visibility change, a team delete, and an account close
purge the subject's tag. A description edit purges nothing, since the page does not show it. The three pages render
the header and the summary strip on the server from the public snapshot, and a Topic or Podcast Dashboard renders
Carl's paragraph too. Charts hydrate from the route, one request per item kind a chart selects, and the charts' module
loads with `import()` after hydration.

### One component, thin adapters

`packages/core/components/AvatarHeader.tsx` draws the person's or team's avatar at the profile page's size beside their
name, the header that Specials, Teams, Activity, and Account open with. `DashboardSubjectHeader.tsx` adds the summary
strip under the name. `packages/core/components/Dashboard.tsx` composes the
page body: five `DashboardChartSection`s, with Carl's paragraph in the bar chart's card under its controls. It holds
each chart's control state and the trend range, keyed by the page's kind and subject so every page opens on the
defaults. Its `DashboardElements` adapter supplies:

- `Section`: the web's `AccordionSection` and the app's `CollapsibleSection` with `isContentKept`. `Card`: the app's
  card primitive. `Select`: the app's select, `Select` on the web and `ChoiceSelect` on mobile. `RadioGroup`: a new
  shared component in core with both apps' button adapters.
- `BarChart`, `PieChart`, `WordCloud`, `TrendChart`, and `PlaceMap`: renderers under one chart contract in
  `packages/core/lib/dashboardCharts.ts`. Each takes plain series and `onItemPress`, and reports a focused point through
  `onPointFocus`. The trend reports its day: each line's count that day from `toDashboardTrendDayPoint`, which the
  web's tooltip and pinned day and the app's sheet all draw.
- `PointDetail`: the tooltip. Hover on the web, and the existing `Sheet` on mobile with the item's link as a button.
  Both render one shared `DashboardPointDetail` body, so the kind split and the counts match.

The summary strip, the subject header with the team dropdown, and the Dashboard menu rows are shared
core components. Titles in every series pass through the existing plain-text sanitizer when the snapshot is built.
The word cloud's words come from `toTitleWords` in core: lowercased, split on Unicode non-letters, with a short
stopword list and words under three letters dropped. A word is sized by the visits or plays of the items whose
titles hold it, and the top 60 words are kept.

Layout copies the Activity page. The header row holds the page icon and the heading, "Topic Daily Specials", "Podcast
Daily Specials", or "Team Daily Specials". The subject header sits under it. Team Dashboard shows the team dropdown in
the team's name's place, listing the user's teams plus the current team in alphabetical order, compared with
`localeCompare` and base sensitivity. A reader with no team of their own sees the name. The menu rows, the page title,
and the share image keep the shorter page names. The accordion has four rows: bar,
then pie and word cloud in a two-column grid that stacks below 48rem, then trend, then map. All sections start open.

Platform renderers:

- **Web** (`apps/web/src/components/dashboard/`): ECharts through `echarts/core` with only the bar, pie, and line
  charts imported. The word cloud is SVG laid out by core's `toPlacedWords`, the same layout the app draws, so no
  word cloud plugin is added. One Nightshift theme object, `packages/nightshift/chartTheme.ts`, written from the color
  tokens. The map uses `@vis.gl/react-google-maps` with Advanced Markers on a Map ID. Core's
  `toDashboardMapPins` groups the shown city pins and the country remainders that sit within 40 pixels of each other on
  the screen into one pin with their count. A click on a group zooms to its places, and a click on one place opens its
  detail. The Google map keeps Google's map type, Street View, full screen, and camera controls. No clusterer
  dependency.
- **Mobile** (`apps/mobile/src/components/dashboard/`): the top ten as native rows of title, bar, and count, and
  Victory Native XL on Skia for the pie and the trend, each opening its sheet on a tap. A hand-built word cloud on
  `react-native-svg`, laid out by the same `toPlacedWords` spiral function in core that sizes the web's words.
  `react-native-maps` with Google Maps on Android, and on iOS if the build has the Google Maps key, else Apple Maps,
  with the same pins, counts, and zoom on a tap, its own Map, Satellite, and Terrain switch, and zoom buttons.
- **MCP view** (`apps/web/src/mcpViews/DashboardMcpView.tsx`, with `emptyDashboardMcpView.ts` for every other view's
  bundle): the web renderers. Google Maps cannot load inside an MCP host's sandboxed frame, so the map adapter is
  `OutlineMap`, an ECharts geo chart over a bundled low-detail world outline with the same pins, counts, and zoom on a
  click. The web uses the same `OutlineMap` if `GOOGLE_MAPS_WEB_API_KEY` is unset. The
  dashboard MCP view builds to its own script, so the charts and the map stay out of the script every other MCP view
  loads.

Named deviations:

- `PointDetail` is a hover tooltip on the web and a sheet in the app, the platform convention for touch.
- `PlaceMap` is `OutlineMap` in the MCP view and on the web without a key, because of the frame sandbox.
- The app draws the top ten as native rows, so each title scales with the reader's text size and each bar is a full
  touch target.
- The app's map is Apple Maps on an iOS build without the Google Maps key. The app draws its own Map, Satellite, and
  Terrain switch and zoom buttons, where the web keeps Google's controls.
- The web's word cloud spreads its words out from the middle as it draws. The app draws them in place.

`apps/mobile/parity.md` lists each separately built component with its kind and reason: `dashboardElements`,
`DashboardBarChart`, `DashboardPieChart`, `DashboardTrendChart`, `DashboardWordCloud`, and `PlaceMap`.

### Carl's paragraph

A prompt, `packages/models/prompts/write-dashboard-paragraph.md`, with a thin builder. It runs on the existing cheap
model role. Its input is numbers only: the summary strip, the last 30 days against the 30 before, and the country
names of the map's pins. It is written once per summary hash, and a daily call ceiling on the platform's own key,
derived from a $2 daily dollar ceiling, stops the run without failing it. Each Dashboard also gets at most six
paragraphs a day, a nightly build's two levels and two rebuilds', so one account's changes cannot spend the platform's
allowance. A summary over either limit keeps yesterday's paragraph.

### Share image

The nightly workflow renders the bar chart with ECharts' server-side SVG renderer and the Nightshift theme. The
existing resvg step in `packages/pipeline/` turns the SVG into a 1200 by 630 PNG, stored in R2 at
`dashboards/<kind>/<subjectId>/<hash>.png`. Only public snapshots get an image. The page head's `og:image` points at
it. The pages' action menu gains Share with the page's url. On the web it opens a new Share dialog,
`apps/web/src/components/share/ShareDashboard.tsx`. In the app it opens the operating system's share sheet through a
new `apps/mobile/src/components/share/shareSheet.ts`.

### Visitors label and the Topic Post counter

Three places change their viewers word to visitors. `VIEWER_COUNT_LABEL` in `packages/contracts/viewerCounts.ts` labels
the topic page's counts line and every Visitors line. `packages/core/components/TopicSearchResultDetails.tsx` words the
search rows. `packages/core/lib/detailsLine.ts` words the Topic Post info popup. A `topicPost` kind joins
`COUNTER_KEY_PREFIXES` as `viewers:topicPost:`. `POST /api/topicPosts/:id/view` counts it, and
`GET /api/counts/topicPosts/:id` reads it. `ViewerCountLine` gains the kind, and the Topic Post page ends with
"Visitors: N" on web and mobile. The seed rebuild adds each published post's author, and publishing counts the author
live. The kind needs a `viewer_counters.topic_post_id` column, and `topic_posts.viewer_count` keeps the saved count the
way `teams.viewer_count` does, so a shown count never drops after a Redis restart.

### The monthly topic scan email line

The topic scan email adds one line linking the recipient's Topic Dashboard to the first one sent in each UTC month.
`users.dashboard_link_month` holds the `YYYY-MM` of the last topic scan email that had the line.

### Analytics

The events follow the `social_<subject>_<action>` names that reactions, comments, and the news already use.
`social_dashboard_view` sends the dashboard kind, the subject ID, and `isOwner`, which is true for the person on their
own pages and for a team's leader on Team Dashboard. `social_dashboard_item_kind_change`,
`social_dashboard_format_change`, and `social_dashboard_range_change` send the same three properties and the chart,
with the new `selection`, or `rangeDays` for the range. `social_dashboard_share` sends the dashboard kind, the subject
ID, and the share's channel: the option the web's Share dialog picked, or `share-sheet` in the app. The events have IDs
only, never titles.

### MCP tool

`read_dashboard` takes `dashboardKind` (`topics`, `podcasts`, or `team`) and an optional `userId` or `teamId`,
defaulting to the caller. It returns the summary strip, Carl's paragraph, the snapshot's day, and the page url, under
the same access rules as the route. It opens the dashboard MCP view, which links to the caller's three pages. The MCP
views have no account view, so the links sit under the dashboard's header.

## Risks / Trade-offs

- [Redis loss drops up to a minute of daily counts] → The same loss the counters already accept. The all-time
  counters stay the visitor number of record.
- [Snapshots for every subject every night grow with users] → Only subjects with a daily count row in the last 400 days
  are rebuilt. Others keep an empty snapshot until they get one. The batches are bounded and the workflow is leased.
- [City pins could expose a person in a small place] → The ten-person minimum after access filtering, with country
  remainders and the extra roll-in. Pins use Cloudflare's city centers, never a finer point.
- [Maps cost runs away] → Separate keys per platform, each restricted to its app and API, with daily quotas and a
  billing budget alert. Maps load only when the map section is open and in view.
- [Native dependencies need a new build] → Skia and react-native-maps change the native runtime, so the change
  bumps the app's runtime version and no over-the-air update reaches an older binary.
- [ECharts weight on the web] → Loaded with `import()` only on Dashboard pages, after hydration, with tree-shaken
  imports.

## Migration Plan

1. Deploy the migration: `daily_view_counts`, `daily_play_counts`, `dashboard_snapshots`, `users.dashboard_link_month`,
   `viewer_counters.topic_post_id`, and `topic_posts.viewer_count`.
2. Deploy the api and worker. Counting starts at once, and the first nightly run builds snapshots for the first
   completed day.
3. Release a native build with the new modules under the bumped runtime version.

Rollback: remove the routes and the schedule. The tables are inert without them and can be dropped later.
