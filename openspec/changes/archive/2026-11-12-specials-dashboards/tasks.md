# Tasks

## 1. Decide first

- [x] 1.1 Get the user's approval of the eight Decided first items in design.md, fold any changed decision into the
  proposal, design, specs, and this list, and verify `openspec validate specials-dashboards --strict` passes after
- [x] 1.2 Add view, play, daily view count, daily play count, place, dashboard, and dashboard snapshot to the
  domain-model skill with Specials and Visitors as their copy words, and verify a grep of the skill finds each word once
  in its table

## 2. Visitors label and the Topic Post counter

- [x] 2.1 Change the viewers word to visitors in `VIEWER_COUNT_LABEL`, `TopicSearchResultDetails`, and
  `packages/core/lib/detailsLine.ts`, update their tests and stories, and verify the topic footer, search rows, and info
  popup stories read visitors
- [x] 2.2 Add the `topicPost` kind to `packages/db/viewerCounts.ts`, the post's author to
  `apps/worker/viewerCountSeeds.ts`, `POST /api/topicPosts/:id/view` and `GET /api/counts/topicPosts/:id` in
  `apps/api/counts/`, and verify route tests for a reload counting once, a private post returning 204 on view and 404
  on read
- [x] 2.3 Add the `topicPost` kind to the shared `ViewerCountLine`, post the view from the web and mobile Topic Post
  pages, end both with the Visitors line, and verify the Topic Post page test and story show "Visitors: N"
- [x] 2.4 Grep copy in `apps/` and `packages/` for viewers used as a label for people and verify none is left outside
  identifiers

## 3. Daily view and play counts

- [x] 3.1 Add `daily_view_counts`, `daily_play_counts`, `dashboard_snapshots`, and `users.dashboard_link_month` to
  `packages/db/schema/`, run `bun run db:generate`, and verify the migration applies to the dev database
- [x] 3.2 Add `apps/api/requestPlace.ts` reading Cloudflare's place headers only through a trusted hop, and verify
  tests for a trusted request, a direct request with forged headers, and a request with no headers
- [x] 3.3 Add the Redis day buffer to `packages/db/dailyCountBuffer.ts` with the claims, the counts hash, and each row's
  sketch, and verify tests for once per person a day for views and once per five minutes for retried plays
- [x] 3.4 Call `addDailyView` from the topic view, the Topic Post view, and the finding view, and `addDailyPlay` from
  the listen route, file downloads, and feed downloads with the format, and verify route tests that each counts into
  the day's buffer with its place
- [x] 3.5 Flush the changed fields into the daily counts from the minute sweep under the `viewer-count-sync` lease,
  merging sketches through the restore pattern, and verify `apps/worker/syncViewerCounts.test.ts` covers a flush, a
  merge, and a failed batch listed again
- [x] 3.6 Add the shown places function with the ten-person city minimum, country remainders, and the extra roll-in
  to `apps/worker/dashboards/shownPlaces.ts`, and verify tests for a lone town, a 12-and-3 country, and an unknown
  place

## 4. Dashboard contracts, series, and snapshots

- [x] 4.1 Add the dashboard contracts to `packages/contracts/dashboards.ts`: kinds, item kinds, formats, ranges, the
  summary strip, every chart's series, pins, and the snapshot response, and verify `bunx tsc -b`
- [x] 4.2 Add the series functions to `apps/worker/dashboards/dashboardSeries.ts`: top ten bars, pie and trend with
  Other for findings, title words, trend ranges, and pins, and verify unit tests for each chart and subject
- [x] 4.3 Add `toPlacedWords` and `toTitleWords` to `packages/core/lib/`, and verify tests for the stopwords, the
  60-word limit, and a layout with no overlaps
- [x] 4.4 Add the `buildDashboardSnapshots` workflow and its nightly schedule in `apps/worker/`, building public and
  full snapshots per subject and kind, deleting rows past 400 days, and purging tags, and verify workflow tests for
  access filtering, an unchanged hash, and the retention delete
- [x] 4.5 Add the one-subject rebuild started by visibility, ownership, deletion, and publication changes,
  with an immediate purge, and verify a test that a topic made private leaves the public snapshot at once
- [x] 4.6 Add the prompt `packages/models/prompts/write-dashboard-paragraph.md` with its thin builder, its daily
  ceiling, and an eval in `evals/`, and verify a builder test that no title reaches the model input
- [x] 4.7 Render the share image from the bar series with ECharts' SVG renderer and the pipeline's resvg step, store it
  in R2, and verify a test that writes a 1200 by 630 PNG for a public snapshot only

## 5. Dashboard route, pages' heads, and caching

- [x] 5.1 Add `GET /api/dashboards/:dashboardKind/:subjectId` with access checks, the non-member strip, edge caching for
  public data, `private, no-store` for full data, and the per-address rate limit, and verify route tests for each case
- [x] 5.2 Add the client in `packages/client/dashboardClient.ts` with both apps' parity entries, and verify
  `bun scripts/check-client-parity.ts`
- [x] 5.3 Add the page heads with the strip, the paragraph, and og:image for the three pages, and verify a head test
  that holds no private item

## 6. Shared dashboard component

- [x] 6.1 Add the Nightshift chart theme to `packages/nightshift/chartTheme.ts` from the color tokens, and verify
  `bun run nightshift:write` leaves the generated files current
- [x] 6.2 Add the chart contract in `packages/core/lib/dashboardCharts.ts` and the shared `Dashboard`,
  `DashboardSummaryStrip`, `DashboardPointDetail`, `RadioGroup`, and `TeamDropdown` in
  `packages/core/components/` with their elements adapters, and verify component tests for per-chart controls, the
  trend day's lines, and the alphabetical team list
- [x] 6.3 Add the Dashboard rows to `UserMenuItems` between dividers with each row's icon, map the icons in both apps'
  adapters, and verify the user menu test and story show exactly the three rows

## 7. Web

- [x] 7.1 Add `echarts` and `@vis.gl/react-google-maps` to `apps/web`, and verify
  `bun scripts/check-package-boundaries.ts` and `bun run check:built-dependencies` after `build:ui`
- [x] 7.2 Add the web chart renderers, `PlaceMap`, and `OutlineMap` in `apps/web/src/components/dashboard/`, loaded
  with `import()`, with a story each, and verify the stories render and a topic page requests no chart code
- [x] 7.3 Add the routes `profiles.$userId_.specials.topics.tsx`, `profiles.$userId_.specials.podcasts.tsx`,
  `teams.$teamId_.specials.tsx`, and `teams.specials.tsx`, with pages that copy the Activity page's header and
  accordion layout, and verify route tests that the profile and team pages still render their own bodies
- [x] 7.4 Link Topic Dashboard and Podcast Dashboard from the profile page and Team Dashboard from the team page, add
  Share to the pages' action menu, send the analytics events, and verify tests for the links, Share, and the event
  properties
- [x] 7.5 Check the three pages at 1024 and 375 pixels wide in light and dark against the Activity page, and verify the
  rows, card spacing, and stacking match the layout requirement

## 8. Mobile

- [x] 8.1 Add Victory Native XL, Skia, and `react-native-maps`, bump the runtime version, and verify a development
  build installs on the iOS simulator
- [x] 8.2 Add the mobile chart renderers, the SVG word cloud, `PlaceMap`, and `PointDetail` on `Sheet` in
  `apps/mobile/src/components/dashboard/`, with on-device stories, and verify the stories render
- [x] 8.3 Add the three Dashboard routes and `teams/specials` under `apps/mobile/app/`, the account screen's three
  rows, and the profile and team page links, list the separately built components in `apps/mobile/parity.md`, and
  verify `bun scripts/check-component-parity.ts`
- [ ] 8.4 Compare each Dashboard screen with the web at phone width, largest text size included, on the iOS simulator
  and then the Android emulator, and verify every section, control, sheet, and map matches

## 9. MCP

- [x] 9.1 Add the `read_dashboard` tool in `apps/api/mcp/` under the route's access rules, and verify tool tests for
  the caller's own podcasts and a non-member's team
- [x] 9.2 Add the dashboard MCP view in `apps/web/src/mcpViews/` rendering the shared dashboard with `OutlineMap`, link
  the caller's three pages from it, and verify `bun run smoke:mcp-views`

## 10. Topic scan email and docs

- [x] 10.1 Add the monthly Topic Dashboard line to the topic scan email with `users.dashboard_link_month`, and verify an
  email test that the second topic scan email of a month has no line
- [x] 10.2 Add visitors by place, no IP stored, and the ten-person city minimum to the privacy page, and verify
  `privacyPage.test.ts`
- [x] 10.3 Update the AGENTS.md files and the routing table for the new folders, routes, and workflow, and update the
  Persona & Voice page in Notion with the Dashboard pages' copy names, the Visitors label, and the dashboard lines, and
  verify a grep of AGENTS.md finds each new folder

## 11. Integration

- [x] 11.1 Run `bun run check` and verify it passes
- [x] 11.2 Count views and plays from the local stack, run the sweep and the snapshot workflow, and verify the three
  pages chart them and that no table holds an IP address

## Workflow follow-up

- Ship through `/ship`, then archive with `openspec archive specials-dashboards --yes`.
