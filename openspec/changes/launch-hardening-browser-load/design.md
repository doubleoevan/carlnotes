# Design

This is Part C of the launch hardening work, what the browser loads. The split into four changes, the places where a
person's experience would change, every finding from the closing read, and every stale claim are listed once, in
`launch-hardening`'s design under "Read this first". This change ships last, after `launch-hardening-page-reads`,
whose page reads and status reads it builds on.

## Context

See proposal.md for why. What shapes the approach:

- A signed-in layout sends 8 requests and 74 queries at load, the 698 KB feed twice, then 3 requests every 45
  seconds. A visitor's every page fetches a 600 KB feed it never shows (A.17, restated in the appendix here).
- Every page loads 1,675,317 bytes of script (571,416 gzip) before its own chunk. `posthog-js` is about half of the
  725 KB entry. Making every dialog lazy takes 5.7% off the home (A.19).
- Lighthouse on a throttled phone, before: home 64, topic 54, Topic Post 66. The topic page's largest paint is the
  film player's poster, inside a section that starts at opacity 0.
- A play counts when the audio or film route is fetched, and that route reads the listener's place. Nothing here may
  fetch it before a press or put a stored file's url where a client could skip it.
- Parts of this change reach the mobile app in its next build. Every shipped build keeps working: six badge routes,
  the feed route, and the podcast episode read all stay.

## Goals / Non-Goals

**Goals:**

- A signed-in layout sends three requests at load: the session, the badges, and the rooms.
- A signed-in full page load paints the signed-in page from its first frame.
- The first row's images and the page's largest image load first, and nothing moves as the rest arrive.
- A dialog or panel a person may never open is not in the page's first scripts, and opens without a wait.
- Sound starts inside the press.

**Non-Goals:**

- Rendering a signed-in page on the server.
- Changing what any screen says. Nothing a person reads changes.
- A smaller feed. Its paging belongs to `launch-hardening-page-reads`.

## Decisions

### D1. The feed loads where a reader mounts, once the session is known

- **Chose:** the feed query takes an `isEnabled` option, true by default so the mobile app is unchanged. The web's
  provider counts mounted readers (the Topics page, the tags row, the Edit topic dialog) and enables the query while
  one is mounted and the session is known, which is at once if the page request brought no session cookie. The
  provider's value is memoized. A link or button that leads to a reader prefetches the feed on hover, focus, or
  touch start, with a few seconds of stale time so hover then click is one request. With no reader mounted, a
  reload marks the feed stale and fetches nothing.
- **Why:** eight other consumers read only the filters and the handlers. The state bundles all of it, and the
  mobile app shares the hook, so the query stays where it is.
- **Rejected:** moving the query into each reader, and the router's intent preload for the feed (its loaders cannot
  reach the query client).

### D2. One badges read, one poll, and the Comment Mentions ride it (close)

- **Chose:** `GET /api/badges` returns the chat mention count, the pending topic invites, the note badges, the unseen
  Comment Mentions, and for an admin the open report count, each in the shape its own route returns. One poll reads
  it every 45 seconds on the web and on mobile. The six routes a shipped build reads stay. The note badges and the
  pending invites are cached per user and cleared by each write (finding R18), as the Comment Mentions already are.
  The rooms stay their own read, on the first count and on a changed one. Team statuses load only with a session.
- **Why:** one route alone saves two requests and little else: the note badges' four queries and the invites' two
  would stay, and ten thousand open tabs are about 1,800 queries a second.
- **What would tip it:** a living spec says the client "SHALL never read [Comment Mentions] on a timer". The request
  asks for every count in one poll, and the read behind it is a five-minute cache that every writer clears, so the
  spec is modified. If that rule was deliberate for a reason the spec does not give, leave the Comment Mentions out
  of the poll and keep their read on a path change.

### D3. The cookie flag picks the face before the session answers

- **Chose:** the header's links and menu and the home's first section read `useIsSignedInBeforeSession`, the root
  loader's cookie flag. The home, news, and opener reads start at mount if the flag is set. The layout route gets a
  pending component with no minimum time, so a signed-in load paints the shell from the html. A stale cookie falls
  back to the visitor's face once the session resolves to nothing, without an error.
- **Why:** the home read takes the user from the cookie, so the browser needs no user id to start it.
- **Rejected:** reading the session on the server to render a signed-in page (a per-user render and an auth read in
  front of every signed-in load).

### D4. Images load by priority, and the film image gets sizes of its own

- **Chose:** `TopicImage` takes a priority: the page's header image, the film player's poster, the home's first
  three cards, and a Topic Post's first body image load eagerly at high priority, and everything else is lazy and
  decoded off the main thread, avatars included. The film image gets its own 16:9 size table under the topic
  image's three names: page 384 by 216, list 120 by 68, thumbnail 48 by 27, each also at twice that. A backfill
  draws them from the stored image with no render version bump, and a film not yet backfilled falls back to the
  poster. The server-rendered header and the film poster leave the hydrate-in animation.
- **Why:** a film card loads a 1280 by 720 poster to show 310 pixels. The film is 16:9 and the topic image box is
  3:2, so the topic's own table would letterbox the thumbnail and the player.
- **The pixel values are a design choice** and easy to change. The mechanism is not: the keys, the route, the url
  function, and the backfill.

### D5. A Topic Post's body is the same html on the server and in the browser

- **Chose:** one string transform in `packages/core/lib/topicPostBodyHtml.ts` turns the stored html into what the
  reader shows, on both sides: each image at its stored width and height, lazy and decoded off the main thread
  except the first. The reader becomes a plain element with the editor package's reader class, and that class's
  rules move into the page's own stylesheet. The stored html is sanitized again on read. The editor keeps its lazy
  package. Code coloring still loads only for a body with a colored block and only recolors.
- **Why:** the editor package's reader asserts a DOM, so it cannot render on the server, and its 547 KB chunk is
  what every reader of a post waits for today.
- **Checked by a test** that compares the transform's output with the package's for stored bodies, because the
  package also normalizes pasted html.
- **Rejected:** a `displayHtml` field from the api (a contract field mobile does not need).

### D6. A dialog or a panel loads on intent, and analytics after hydration

- **Chose:** the Edit topic dialog, the rank dialogs, the Topic Post page's share, image, and confirm dialogs, the
  Video dialog with the film player, both chat panels, the Add to AI dialog, and the Report issue dialog become
  lazy imports behind a named loader that hover, focus, or
  touch start also calls. `posthog-js` is imported after hydration, with page views and events queued until it
  starts, so the first page view is still captured. The router preloads on intent.
- **Why:** moving only the analytics call would change when it starts and leave about 374 KB in the entry.
- **A chat panel preloads on intent; its messages' 553 KB Markdown chunk still loads when a chat opens.**

### D7. A press sets the source inside the gesture

- **Chose:** the podcast episode summary gains two optional fields, `audioUrl` and `video`, holding the counted
  route paths the full podcast episode already returns. A press sets the loading state and the media element's
  source in its handler, and reads the full podcast episode beside it for chapters and saved progress. A source that
  is already set is never assigned again, because that would fetch the counted route twice. On hover or intent of a
  play control the page opens a connection to the storage origin, which it learns from one small public read, and
  fetches nothing.
- **Why:** sound today waits for a read, then a redirect, then storage. The paths are a pure function of the id, and
  a summary that names them still sends the press through the route that counts the play and reads its place.
- **Rejected:** a stored file's url in the summary (the request forbids it, and it would skip the count), and a path
  built in the client from the id (the route's path would live in two places).
- **An MCP view keeps its own tokenized urls.**

## Risks / Trade-offs

- [More lazy chunks mean more places an open page reloads after a deploy removes a chunk] → preloading on intent
  moves that reload to the hover, before a person has typed anything.
- [`loading="lazy"` hides an image from the preload scanner] → the priority images are eager, not only high
  priority.
- [The intent preload runs loaders] → every public loader returns at once in the browser. Two do not, and each is
  checked: the signed-in gate reads the session, and the team Specials route reads the teams.
- [The transform drops the editor package's sanitizer pass] → the read path runs the api's own sanitizer again.
- [A disabled feed query reads as loading] → only a reader may branch on it.
- [CLS reads 0 before and after for the Topic Post] → the task measures the article's height across the swap.

## Migration Plan

Ship the code. Run the film image backfill, which draws the three sizes for each film with an image of its own. The
Lighthouse runs and the chunk tables are taken again with the commands and scripts in the appendix, unchanged, and
kept beside the "before" ones in `logs/launch-hardening/research/lighthouse/`.

## Open Questions

- **Whether `posthog-js`'s slim bundle supports the options the app sets.** If it does, it is a further saving, and
  nothing here depends on it.

## Appendix A: counts and measurements, taken 2026-11-13 at 32d3dded

Each entry was written as it was taken, read-only. The closing read's findings (A.25 to A.28) are in
`launch-hardening`'s design.

### A.17 Polls and the layout's requests (items 17, 18), measured on the dev api's `Server-Timing` header

Claims that no longer match the code:

- **The topic page's film section does not poll while a newer film renders.** 8cb46ed added a filming line under the
  ready film's player and no poll, so that line stays until the page is read again. The section polls only while the
  film it shows is rendering, on a topic with no ready film
  (`packages/core/components/TopicPodcastEpisodeVideoSection.tsx:100-106,124`).
- **"Polls forever" is bounded by the sweep.** The client has no limit, but the sweep fails a dispatched scan after 2
  days 21 minutes. A waiting scan is never failed and polls like a running one: the page's scan has no field that
  says it is waiting (`packages/contracts/topics.ts:144-161`).
- **The film, discussion, and scan polls already pause in a hidden tab** and read at once when the tab shows again
  (`packages/core/lib/limitedPoll.ts:18-25`, `apps/web/src/lib/visiblePoll.ts:6-15`). The polls that do not pause are
  the web's `?episode=` poll and the topic image render poll (`packages/core/hooks/useTopicImageRender.ts:44-79`).
- **A film row is `rendering` only once the render activity starts.** While a new podcast episode's film waits for a
  slot it has no row, its page shows no filming card, and no poll starts.

Every poll, measured where a count is given:

| Poll | Reads | Interval | Mounts for | Pauses hidden | Limit | Queries a poll |
|---|---|---|---|---|---|---|
| Film render, podcast episode page | the whole podcast episode page | 30 s | every viewer | yes | 4 h a mount | visitor 26 (22 warm), signed in 31; 97 KB |
| Film render, topic page | `topics/:id?poll=1` | 30 s | every viewer | yes | 4 h a mount | visitor 18 on a miss, 0 on a hit; signed in 31, and every poll misses; 210 KB |
| Topic Post Discussion | the whole Topic Post page with its comment thread | 15 s | every viewer | yes | 45 min a mount | visitor 10, signed in 17 |
| Scan | `topics/:id?poll=1` | 3 s, 10 s after 30 s, 30 s after 2 min | every viewer, visitors too | yes | none | as the topic row above |
| Linked podcast episode `?episode=` | `/api/episodes/:id` | 5 s | every viewer who opens such a url | web no, mobile yes | none | visitor 3, signed in 7 |
| Counts | `/api/counts/...` | 60 s | every viewer | yes | none | 1 without credentials (the edge shares it 30 s), 4 with a cookie |
| Note badges | `/api/note-badges` | 45 s | signed in | skips a tick | none | 5 |
| Update badges | the mention count, the pending invites, and for an admin the report count | 45 s | signed in | yes | none | 1 to 2, and 3 |
| Topic image render | `/api/topic-image-renders/:id` | 3 s | the editor who started it | no | 20 min | not measured |

The topic poll is read through a two-second Redis cache keyed by user, or one key for every visitor
(`apps/api/topic/topicsRoute.ts:31,124-127`). A signed-in viewer's fastest interval is 3 seconds, so one viewer in
one tab never hits their own key: every poll is a full load of 31 queries and 210 KB. On the web the scan poll also
runs while a podcast episode records, and for 90 seconds after a scan succeeds with no podcast episode yet
(`apps/web/src/components/topic/TopicScanButton.tsx:26,29-48,79-82`).

A signed-in, non-admin layout on a cold full page load, in order:

| # | Request | Trigger | Queries |
|---|---|---|---|
| 1 | `GET /api/topic-feed?all=true` | the feed query mounts before the session is known | 28 |
| 2 | `GET /api/auth/get-session` | Better Auth's `useSession` | 2 |
| 3 | `GET /api/rooms/mention-count` | the update badges' first read | 2 |
| 4 | `GET /api/invites/topics/pending` | the same poll | 3 |
| 5 | `GET /api/comment-mentions/unseen` | on the session and on every path change | 2 |
| 6 | `GET /api/note-badges` | the note badges | 5 |
| 7 | `GET /api/topic-feed?all=true` | the same query under its new key | 26 |
| 8 | `GET /api/rooms` | the first mention count counts as a change | 6 |

**8 requests and 74 queries at load, then 3 requests and 9 to 10 queries every 45 seconds** from two timers. An admin
adds the report count. The feed is 698,048 bytes signed in and 600,870 for a visitor, the largest payload on every
page. A visitor's layout sends `get-session` and the feed on every page but `/topics`, whose loader seeds it; a
visitor's profile view also sends team-statuses, which returns 401. The feed context's readers that need its data
are three: the Topics page, the tags row (on the Topics and search pages), and the Edit topic dialog. Eight other
consumers read only the filters, the handlers, or `reloadTopicFeed`.

Facts the design rests on:

- **A status read already exists as a pattern:** `GET /api/topic-image-renders/:id` returns a status and the fields
  the editor swaps in (`apps/api/topic/topicImagesRoute.ts:84-101`).
- **Every status write of a film is in one pipeline module** (`topicPodcastEpisodeVideoRows.ts:45-229`) **and every one
  of a discussion in another** (`topicPostDiscussions.ts:63-313`), so a Redis delete there changes no workflow, and
  the live render, the backfill, and the close-out all get it. The render already deletes the film feeds' cache at
  the ready write.
- **`cacheJson` already falls back to the row**: a failed Redis read runs the load and stores nothing.
- **The film's page changes in five places when a film lands** (the card, the film feed url, the films list, an
  editor's film image fields), so a status read that returned every swap field would be a second copy of those
  shapes.
- **An MCP view mounts the discussion card** and cannot reach the api
  (`apps/web/src/mcpViews/TopicPostMcpView.tsx:23-30`), so a status read is passed in by the page, never called from
  inside the core hook.
- **The web sets a new topic object on every poll** (`apps/web/src/hooks/useTopicPagePayload.ts:83,160-168`).
  `replaceEqualDeep` from `@tanstack/react-query` returns the previous object if nothing changed. The mobile app
  already gets this from `queryClient.setQueryData`.
- **A signed-in request costs one query before its route runs**, so a public status read omits credentials, as the
  counts do, for everyone but the reader who is waiting.
- **Released builds** read `fetchNoteBadges`, `fetchChatMentionCount`, `fetchChatRooms`, `fetchTopicInviteBadges`,
  `fetchUnseenCommentMentions`, and `fetchOpenReportCount`, all named in `contracts/0.1.0.json`. All six stay.
- **A living spec forbids a timer for Comment Mentions:** "SHALL never read it on a timer", with a scenario that ends
  "and no read ran in between" (`openspec/specs/comment-mention-badges/spec.md:124-140`). The read behind it is a
  five-minute cache that every writer clears.
- **`reloadTopicFeed` calls `refetch`, which fetches a disabled query too** (`useTopicFeedState.ts:156-159`), and the
  web's `pendingChanges` is a new `[]` each render (`packages/core/hooks/useTopicFindingActions.ts:108`), which
  breaks a memoized value. A signed-in feed query's stale time is 0, so a prefetch needs a few seconds of it.

Found outside the items:

- **High under a wave: a signed-in viewer's scan poll never hits its cache.** Two hundred followers watching a
  topic's morning scan send about 2,000 queries a second for its first 30 seconds, then 62 a minute each for as long
  as the scan and its podcast episode run. The MCP view's `read_scan_status` already reads the scan row's status,
  counts, and `pickedUpAt` alone (`apps/api/mcp/scanResults.ts:140-146`).
- **Medium: the scan poll reads the whole topic page for hours while a podcast episode records** on the flex tier.
- **Medium: a queued film shows nothing and starts no poll** (above), and a film whose workflow is lost before its
  first row write has no row for a close-out to find.
- **Medium if the wave is signed in: the badge poll's query cost barely drops with one route.** The note badges' 4
  queries and the invitations' 2 stay: ten thousand open signed-in tabs are about 1,800 queries a second.
- **Low to medium: visitors behind one address share the scan poll's rate limit** of 1,800 requests a minute.
- **Low:** the Edit topic dialog and the tags row read the tags and four quota numbers from the 698 KB feed; the
  Personal sources polls have no limit.

### A.19 The first paint and the bundle (items 19, 20), by reading, by Lighthouse, and by the built chunks

Claims that no longer match the code:

- **A signed-in home never shows visitor cards.** A cookie-bearing load has no server payload (`_layout.tsx:12` turns
  ssr off), so the cards are `HomeSkeleton`. What flashes is the visitor's "How it works" steps where the news goes
  (`apps/web/src/pages/HomePage.tsx:114`). The header's hero already reads `useIsSignedInBeforeSession`
  (`Header.tsx:54-55`); only the links and `HeaderMenu` read `session` (`Header.tsx:86-141`).
- **The Topic Post swap does not move the discussion card.** The card renders before the body
  (`packages/core/components/TopicPostPage.tsx:129-135`). Only the comments and the viewer count line move, and CLS
  reads 0 because they are below the viewport, so CLS will not show the fix: measure the article's height.
- **`EditTopicModal` reaches every page through the layout** (`Layout.tsx:9` to `SearchBar.tsx:26` to
  `PageActionMenu.tsx:12`), not only four page chunks.
- **The word cloud is the app's own svg layout** (2,865 B), never an ECharts extension.
- **The podcast episode summary contract is `podcastEpisodeSummary` in `packages/contracts/podcast.ts:27-47`.**
- **`poster.jpg` is also the film player's poster**, which Lighthouse names as the topic page's largest paint on a
  phone, inside the section that starts at opacity 0 (`TopicPodcastEpisodeVideoPlayer.tsx:193`, `TopicPage.tsx:241`).

Lighthouse "before", 13.6.0 through `bunx`, its default phone profile (412 by 823, simulated 150 ms round trip,
1.6 Mbps, 4x CPU slowdown), the built ui on `:3000`, three runs a page, the median with each run in brackets:

| Page | Score | LCP simulated | LCP observed | CLS | TBT | Transfer | Requests |
|---|---|---|---|---|---|---|---|
| Home | 64 [28, 64, 64] | 29.5 s | 1.78 s | 0 | 110 ms | 9,773,893 B | 166 |
| Topic | 54 [54, 58, 52] | 23.8 s | 1.57 s | 0 | 231 ms | 3,833,713 B | 139 |
| Topic Post | 66 [66, 62, 66] | 23.1 s | 1.61 s | 0 | 282 ms | 4,020,806 B | 142 |

The command, which the "after" runs repeat unchanged:

```
bunx lighthouse <url> --only-categories=performance --output=json --output=html --output-path=<dir>/<name> \
  --chrome-flags="--headless=new" --blocked-url-patterns='*posthog.com*' --blocked-url-patterns='*/view' \
  --blocked-url-patterns='*/audio.mp3*' --blocked-url-patterns='*/video.mp4*' --quiet
```

The blocked patterns matter: the built ui posts to PostHog tagged production, and a topic or Topic Post page POSTs
its view. How to read the numbers: the local api sends no compression and production sends brotli from the edge, so
local text bytes are overstated and image bytes are not. Compare before and after on the same local setup. The
largest paint is the first topic card's image on the home, the film player's poster at 338 by 190 on the topic page,
and the first body image on the Topic Post, which exists only after the reader chunk loads. Home bytes: 44 images
6,574,143 B (six avatar requests 3,304,863 B, twelve film posters 1,725,078 B, `/carl-hero.png` 305,308 B), 108
scripts 1,930,341 B, `/api/topic-feed?all=true` 601,604 B, the document 432,126 B.

The built client (`apps/web/dist/client/assets/`, built Nov 12 22:33 from the working tree, so close to HEAD and
not exact): 212 script chunks, 8,046,291 B, 2,414,969 B gzip. What a full page load fetches as scripts:

| Route | Chunks | Bytes | Gzip |
|---|---|---|---|
| entry alone | 31 | 1,029,892 | 342,116 |
| entry + layout (every page) | 81 | 1,675,317 | 571,416 |
| home | 105 | 1,846,160 | 631,994 |
| topic | 113 | 1,946,594 | 665,633 |
| Topic Post | 110 | 1,867,098 | 639,451 |
| Topic Post + reader | 115 | 2,420,546 | 814,818 |
| Topic Post + reader + highlighter | 116 | 2,493,233 | 839,206 |
| podcast episode | 106 | 1,894,384 | 645,763 |
| profile | 120 | 1,921,498 | 659,296 |
| team | 117 | 1,908,758 | 655,084 |
| Specials, page only | 89 | 1,716,759 | 587,236 |
| Specials + charts + outline map | 100 | 2,495,404 | 859,853 |
| login (no layout) | 45 | 1,085,618 | 366,652 |

The largest chunks: `heic-to` 3,225,480 B (lazy on a HEIC pick), the entry `index` 725,197 B (react-dom, the router,
`posthog-js`, the Better Auth client), streamdown 552,694 B (lazy with a chat's messages), the editor package
`NoteLayout` 546,096 B, `EChart` 545,125 B, the voice activity detector 435,236 B, `EditTopicModal` 56,154 B,
`codeBlockColors` 72,687 B. `posthog-js`'s full bundle is 374,225 B of the 725,197 B entry. Making every dialog lazy
takes 106,085 B (5.7%) off the home. The dynamic edges confirm ECharts and the map load only from a Specials page,
and the highlighter only from the Topic Post reader or editor for a body with a colored block; the lazy chat lists
pull streamdown and neither of those.

Facts the design rests on:

- **The cookie flag** is the root loader's boolean `hasSessionCookie()` (`apps/web/src/routes/__root.tsx:71`), read by
  `useIsSignedInBeforeSession` (`apps/web/src/hooks/useIsSignedInBeforeSession.ts:11-15`). `GET /api/home` reads the
  user from the cookie, so the browser needs no user id to start it. A stale cookie sets the flag for a visitor.
- **The layout has no pending component**, and with ssr off the server sends an empty body for a signed-in load. The
  router's `defaultPendingMinMs` is 500, so a pending component needs `pendingMinMs: 0`.
- **Every topic, podcast episode, and Topic Post image goes through one `img`**
  (`apps/web/src/components/primitives/topic-image.tsx:32`): `loading="lazy"`, no `decoding`, no `fetchpriority`.
  Avatars have neither attribute (`Avatar.tsx:30`). `loading="lazy"` hides an image from the preload scanner.
- **Film image sizes need no render version bump.** `render_version` versions the mp4 parts and captions; the image
  key holds only the image hash. A backfill draws every size from the stored `image-<hash>.jpg` with sharp alone.
  The film is 16:9 and the topic image box is 3:2, so the film image gets its own 16:9 pixel table.
- **`EnrichedText` cannot render on the server**: it asserts a DOM, sanitizes with DOMPurify, and runs a `DOMParser`
  pass. `packages/core/lib/topicPostBodyHtml.ts:47-53` already rewrites each body image with pure string code. The
  package's css arrives in the lazy chunk and its `exports` map exposes only `"."`.
- **The hydrate-in animation** is `animate-hydrate` for sections 0, 1, 2 of a server-rendered topic page
  (`TopicPage.tsx:424-443`): 0.8 s from opacity 0 with a 6 px blur.
- **After the counted route's 302 the bytes come from the storage origin** (`packages/db/store.ts:311-333`), which the
  browser does not know today. The page's policy has no `connect-src` or `media-src`. A preconnect sends no request.
- **The play press is three hops**: `GET /api/episodes/:id`, then the counted `audio.mp3` or `video.mp4` route's 302,
  then storage. Both counted paths are pure functions of the id (`podcastEpisodeShapes.ts:238`, `:350-351`). The
  first state change is after the first fetch (`packages/core/stores/podcastEpisodeSource.ts:134-140`).
- **Pitfalls of the press:** `load` assigns `src` again (`apps/web/src/stores/podcastEpisodePlayerStore.ts:100`), which
  would be a second GET of the counted route; an MCP view's media urls are absolute and carry a play token
  (`apps/api/mcp/mcpViewData.ts:317-342`); the summary has no saved progress.
- **`defaultPreload: "intent"` runs loaders.** Every public loader returns at once in the browser, with two
  exceptions: `_signedIn`'s `beforeLoad` reads the session, and `teams.specials.tsx:8-10` calls `fetchTeams()`.
- **Lazy patterns that exist:** a named loader that `lazy` wraps and the code also calls early
  (`components/note/NoteDialog.tsx:37-42`, `:197`), and intent handlers `onPointerEnter`, `onFocus`, `onTouchStart`
  for data (`hooks/useScanNote.ts:40-44`). No chunk is preloaded on hover today.

Found outside the items:

- **High for item 19's goal: the topic page's largest paint on a phone is the film player's poster** (214,584 B at
  338 by 190), with no priority, inside the animated section.
- **Medium: avatars are stored as sent, up to 2 MB, and shown at 64 px and under** (`apps/api/avatars.ts:21`). The dev
  home loaded six avatar requests for 3,304,863 B, one of them 1,844,221 B.
- **Medium: `/carl-hero.png` is a 304,614 B png at 472 by 535**, shown at 112 px on a phone, on every visitor's home.
- **Low to medium: a Topic Post's body image has one copy up to 1920 px wide.** A phone loaded 316,956 B for an image
  drawn 346 px wide.
- **Low:** the dehydrated loader data is 175,957 B of the home document and 226,352 B of the topic's, beside the same
  content as markup. `TopicPostPage` statically imports five dialogs.
