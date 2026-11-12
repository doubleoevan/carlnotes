# Proposal

## Why

A person who runs public topics and podcasts on CarlNotes cannot see who reads or listens, or where. The app keeps
all-time unique counts and cumulative play counts, but no count has a day or a place, so no chart can show a trend
or a map. The Dashboard pages show every person and every team their numbers, and give CarlNotes a page worth
sharing.

## What Changes

- Three Dashboard pages built from one shared dashboard component. **Topic Dashboard** covers a person's topics,
  **Podcast Dashboard** covers a person's podcasts and their films, and **Team Dashboard** covers a team's topics.
  Copy calls them Specials, with the titles "Topic Specials", "Podcast Specials", and "Team Specials". Identifiers say
  `topicDashboard`, `podcastDashboard`, and `teamDashboard`.
- Each page copies the Activity page's layout. The header holds the page's own icon, ChartBar, ChartPie, or ChartLine,
  and the page title on the left, with the subject header under it: the person's or team's avatar and name over the
  summary strip. Carl's one-paragraph read of the numbers follows. Expandable sections come next, each holding a card:
  the bar chart on the first row, the pie chart and the word cloud side by side on the second, the trend on the third,
  and the map on the fourth.
- Team Dashboard has a team dropdown in the header's top right corner, listing the user's teams in alphabetical order.
- Every Topic Dashboard and Team Dashboard chart has its own Findings, Topics, and Posts dropdown. Every Podcast
  Dashboard chart has its own Podcasts, Films, and Both radio group, starting on Both.
- The user menu gains one divider section with three rows, each with its icon left of its text, like the other rows:
  "Topic Specials", "Podcast Specials", and "Team Specials". A person's profile page links to their Topic Dashboard and
  Podcast Dashboard, and a team page links to its Team Dashboard.
- New daily **daily view counts** and **daily play counts**: one row per item, place, and UTC day, with a place read
  from Cloudflare's geolocation headers on requests through a trusted Cloudflare hop. No IP address and no individual
  event is stored. Rows are kept for 400 days.
- A city pin needs at least ten distinct people per item and format. Smaller groups roll into their country's pin.
- A `topicPost` kind joins the viewer counters, and a Topic Post's page ends with a Visitors line.
- Visitors replaces viewers as the copy word for unique people on a topic's counts line, its details line in search
  rows and in the Topic Post info popup. Code keeps `viewer_counters`, `viewerCount`, and the counter kinds.
- Carl writes the paragraph once a day from numbers alone with a cheap model. A nightly job builds each dashboard's
  snapshot, its share image, and its paragraph, then purges the pages at the edge.
- A read-only MCP dashboard tool returns the summary strip and Carl's paragraph. An MCP view renders the same
  dashboard with links to the caller's three Dashboard pages.
- PostHog events for dashboard views, control changes, and shares, IDs only.
- New dependencies: ECharts and the vis.gl Google Maps library on the web. Victory Native XL on Skia and
  react-native-maps on mobile, which need a new native build.

## Capabilities

### New Capabilities

- `specials-dashboards`: the three Dashboard pages, the shared dashboard component and its chart contract, the layout,
  the controls, who sees what, the summary strip, Carl's paragraph, the snapshots, the share image, the user menu
  section, the links to the pages, the MCP tool and view, and the dashboard analytics events.
- `daily-view-and-play-counts`: counting views and plays by item, place, and day, reading places from Cloudflare's
  headers only through a trusted hop, the 400-day retention, and the ten-person city threshold with country remainders.

### Modified Capabilities

- `viewer-counts`: a `topicPost` counter kind with a Visitors line on the Topic Post page, the topic page's counts line
  reading Visitors, and the privacy page naming visitors by place.
- `topic-posts`: the info popup's Topic details line counts visitors.
- `site-search`: a Topic row shows its visitors and followers.
- `public-profiles`: the user menu gains the Dashboard section.
- `mcp-server`: the read-only `read_dashboard` tool and the dashboard MCP view join the annotation contract and the
  release gates, which now cover twenty-six tools and ten UI resources.

## Impact

- **Database**: three new tables, `daily_view_counts`, `daily_play_counts`, and `dashboard_snapshots`, and a migration.
  `users` gains `dashboard_link_month`, `viewer_counters` gains `topic_post_id`, and `topic_posts` gains `viewer_count`
  for the `topicPost` kind.
- **API**: three dashboard JSON routes, a Topic Post view route, place reading beside `apps/api/trustedProxies.ts`,
  the counting call sites in `apps/api/counts/`, `apps/api/topicPost/`, `apps/api/topic/findings.ts`,
  `apps/api/podcast/podcastEpisodeListens.ts`, `podcastEpisodeFiles.ts`, and `podcastFeeds.ts`, page heads for the
  three pages, a new MCP tool and view, and edge cache tags.
- **Worker**: the minute sweep flushes the day's Redis counters into the daily counts. A new nightly job builds the
  snapshots, the paragraphs, and the share images, deletes rows past 400 days, and purges the pages.
- **Packages**: dashboard contracts in `packages/contracts`, a client in `packages/client`, the dashboard, its series
  functions, and its controls in `packages/core`, a chart theme in `packages/nightshift`, and a prompt in
  `packages/models/prompts/`.
- **Web and mobile**: four routes each, counting `teams/specials`, the chart and map adapters, the user menu, the
  profile and team page links, and the label changes in `packages/contracts/viewerCounts.ts`,
  `packages/core/components/TopicSearchResultDetails.tsx`, and `packages/core/lib/detailsLine.ts`.
- **External setup**: Cloudflare IP geolocation and visitor location headers on the zone, three restricted Google Maps
  keys with quotas, a web Map ID, and a new native mobile build.
- **Docs**: the domain-model skill, the privacy page, the Persona & Voice page in Notion, and a docs site page on the
  Dashboard pages.
