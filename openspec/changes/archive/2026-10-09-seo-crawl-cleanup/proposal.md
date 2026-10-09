## Why

Google Search Console shows 44 URLs "Discovered – currently not indexed" and 17 "Crawled – currently not indexed".
Three things feed that: a `/topics` index that nothing links to and that repeats what the homepage's paged sections
already give a crawler, a `/login?next=<path>` link on every page that makes one crawlable sign-in URL per public page,
and public pages whose tables show a crawler five rows a page, so most of a topic's findings, scans, and episodes sit
behind page links. The sitemap's dates and its topic list were also suspected of being stale.

## What Changes

- **BREAKING** `/topics` is retired. Its route, page, api route (`GET /api/public-topics`), and ui client are removed,
  `/topics` redirects permanently to `/`, and it leaves the sitemap. Topic pages at `/topics/:id/:slug` are unchanged.
- `robots.txt` adds `Disallow: /login` and `Disallow: /signup`, and the header's sign-in and sign-up links are
  `rel="nofollow"`, so a crawler neither follows nor fetches the per-page sign-in URLs. The `next` param stays.
- A server-rendered public page holds up to 50 rows of each paged table in its HTML, and JavaScript hides the rows off
  the page a browser shows: the homepage's Featured and Popular sections, a topic page's findings, scan history, and
  episodes, a team's or profile's topic table, a team's members, and a page's notes. A browser keeps its page sizes,
  and a reader without JavaScript, a crawler included, sees the whole list. No reader is told apart by its user agent.
- A public topic page gets a server-rendered "More topics" section of plain links: other public shown topics held by
  the same public team first, then topics sharing a tag, then the public topics with the newest Finding, up to five.
- The sitemap keeps its dating rule and its topic list. Both suspicions traced to a cached copy: the sitemap is served
  with a one-hour cache, the live copy already lists v0.11.0, v0.12.0, all 25 public topics, and dates ai-gone-rogue
  Oct 5, and the homepage and the sitemap already share one `isPublicAndShown` filter. The episode pages already
  sit in the sitemap with their publish dates and have `PodcastEpisode` JSON-LD with every field asked for. Nothing
  changes there.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `seo`: robots.txt disallows the sign-in and sign-up paths and the links to them are nofollow, `/topics` redirects
  to `/`, the sitemap's static routes lose `/topics`, the homepage alone leads a crawler into the public topics, and
  every paged list on a public page holds up to 50 rows for a reader without JavaScript.
- `topic-detail-page`: a public topic page has a "More topics" section, and its findings list holds its findings, up
  to fifty, with those past five hidden with JavaScript.

## Impact

- Deleted: `ui/src/routes/_layout/topics.index.tsx`, `ui/src/pages/PublicTopicsPage.tsx`. Regenerated:
  `ui/src/routeTree.gen.ts`.
- `api/api.ts`, `api/seo.ts`, `api/seo.smoke.ts`, `api/documents.ts` (the redirect), `ui/public/robots.txt`,
  `ui/src/clients/topicClient.ts`, `ui/src/components/layout/Header.tsx`.
- The rows a paged list renders: `ui/src/lib/renderedRows.ts`, read by `TopicSection.tsx`, `TopicScanHistory.tsx`,
  `PodcastEpisodesCard.tsx`, `Pagination.tsx`, and `usePagination` in `TablePagination.tsx` with the public pages'
  tables, and `TopicFindingsSection.tsx` for the findings list.
- The "More topics" section: a query in `api/topic/`, a field on the topic page payload in `shared/contracts.ts`, and
  a component under `ui/src/components/topic/`.
- No migration.
