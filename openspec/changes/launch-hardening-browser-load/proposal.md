# Proposal

## Why

A signed-in layout sends 8 requests and 74 queries before its page's own, the 698 KB feed twice, and every visitor's
page fetches a 600 KB feed it never shows. A signed-in load paints the visitor's page first and swaps it, every
image is lazy with no priority, and a play press waits three hops before sound. On a throttled phone Lighthouse
scores the home 64, a topic page 54, and a Topic Post 66. This is Part C of the last work before launch, what the
browser loads. Its sibling changes are `launch-hardening`, `launch-hardening-page-reads`, and
`launch-hardening-safety`.

## What Changes

- **The layout's requests.** The feed loads only where a reader mounts and once the session is known, prefetched on
  intent. One badges read returns every count to one poll, with the existing badge routes left for shipped builds.
  Team statuses load only with a session. A signed-in layout sends three requests where it sends eight.
- **The first paint.** The header and the home choose the signed-in face from the cookie flag and start their reads
  at mount. The page's largest image and the first row load first, and the rest lazily. A film's image gets page,
  list, and thumbnail sizes. A Topic Post's body is the same html on the server and in the browser, so nothing moves
  as it loads.
- **The bundle and the press.** Dialogs and panels a person may never open load on intent, analytics loads after
  hydration with the first page view still captured, the router preloads on intent, and a press sets its source
  inside the gesture, through the route that counts the play.

Nothing a person reads changes. The mobile app gets the badges read and the page reads in its next build, and every
shipped build keeps working.

## Capabilities

### New Capabilities

- `layout-requests`: what a layout fetches at load and on a timer, and its budget of three requests signed in.
- `page-load`: the first paint, image priority, lazy imports preloaded on intent, and a press that starts playback
  inside the gesture.

### Modified Capabilities

- `topic-feed-state`, `note-badges`, `comment-mention-badges`, `mobile-chat`, `activity-page`: the feed's enabled
  rule and the one badges poll.
- `topic-cards`, `topic-podcast-episode-video-player`, `topic-podcast-episode-video-rendering`, `user-avatars`,
  `home-page`: image priority, the film image's sizes and their backfill, lazy avatars, and the hero image.
- `topic-posts`, `topic-detail-page`: the body rendered the same on both sides, and the header and the film poster
  left out of the hydrate-in animation.
- `podcast-episode-player`, `monitoring-analytics`, `performance-telemetry`, `ui-routing`: the press, analytics
  after hydration, the layout's request budget, and preload on intent.

## Impact

- `packages/core`: `useTopicFeedState.ts`, `updateBadgePoll.ts`, `useNoteBadges.ts`, `TopicImage.tsx`,
  `topicPostBodyHtml.ts`, the play actions and stores.
- `apps/web`: `TopicFeedProvider.tsx`, `Header.tsx`, `HomePage.tsx`, `_layout.tsx`, `client.tsx`, `router.tsx`,
  `visitAnalytics.ts`, the lazy dialogs and panels, the Topic Post reader, `topic-image.tsx`, `Avatar.tsx`.
- `apps/api`: a badges route, the film image route's sizes, a storage origin read, the summary's two new fields.
- `packages/contracts`: the badges contract, `podcast.ts` (two optional fields), `topicImages.ts` (the film sizes).
- `packages/db`, `packages/pipeline`: the film image's size keys and their backfill.
- `apps/mobile`: the badges poll and image priority in its next build.
- Lighthouse reports and chunk tables, before and after: the tables in design.md, the reports in
  `logs/launch-hardening/research/lighthouse/`.
