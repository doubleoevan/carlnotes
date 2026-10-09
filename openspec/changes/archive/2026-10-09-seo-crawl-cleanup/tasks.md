## 1. Retire /topics

- [x] 1.1 Delete `ui/src/routes/_layout/topics.index.tsx` and `ui/src/pages/PublicTopicsPage.tsx`, regenerate
  `ui/src/routeTree.gen.ts`, and remove `fetchPublicTopics` from `ui/src/clients/topicClient.ts`
- [x] 1.2 Remove `GET /api/public-topics` from `api/api.ts` and `/topics` from `STATIC_ROUTES` in `api/seo.ts`, and stop
  fetching `/topics` in `api/seo.smoke.ts`
- [x] 1.3 Add a permanent redirect from `/topics` to `/` beside the `/pricing` redirect in `api/documents.ts`, with a
  test beside the `/pricing` one in `api/seo.test.ts`

## 2. Stop the sign-in crawl leak

- [x] 2.1 Add `Disallow: /login` and `Disallow: /signup` to `ui/public/robots.txt`, which the api serves with the built
  ui, with a test in `api/seo.test.ts` that reads the file
- [x] 2.2 Add `rel="nofollow"` to the header's sign-in and sign-up links in `ui/src/components/layout/Header.tsx`,
  keeping their `next` param, and cover it in `-homeRoute.test.tsx`, which renders the header for a visitor

## 3. Fifty rows for a reader without JavaScript

- [x] 3.1 Add `NO_SCRIPT_ROW_LIMIT = 50` to `shared/seo.ts` and `toRenderedRows(rows, { pageNumber, pageSize })` to
  `ui/src/lib/renderedRows.ts`, the page's rows and the first fifty, each with its class, with a test
- [x] 3.2 Render those rows in `TopicSection.tsx`, `TopicScanHistory.tsx`, and `PodcastEpisodesCard.tsx`, and hide a
  section's page links in `Pagination.tsx` without JavaScript while the HTML holds every row
- [x] 3.3 Return the rendered rows from `usePagination` in `TablePagination.tsx`, and render them in `TopicsTable.tsx`,
  `TeamMembersTable.tsx`, `NotesTable.tsx`, and `PodcastEpisodeChaptersTable.tsx`
- [x] 3.4 Render up to fifty findings in `TopicFindingsSection.tsx` on the topic page, the rows past five hidden until
  the expander opens and the expander hidden without JavaScript, while a homepage card keeps its five rows
- [x] 3.5 Extend `api/seo.smoke.ts`: a public topic seeded with more than five findings has every finding in its HTML,
  and the homepage's HTML links the seeded public topic

## 4. More topics

- [x] 4.1 Add `loadMoreTopics(topic)` in `api/topic/moreTopics.ts`: the other public shown topics ordered by whether a
  public team holding this topic holds them, then by shared tag count, then by newest finding, up to five, and empty
  for a topic that is not public and shown. Unit-test the query's shape and the empty case with a stubbed pool
- [x] 4.2 Add `moreTopics: { id, name }[]` to the topic page payload in `shared/contracts.ts`, loaded with the page
- [x] 4.3 Add `MoreTopicsSection.tsx` under `ui/src/components/topic/`, rendered last on the topic page as plain links,
  and cover it in `-topicRoute.test.tsx` for a visitor without JavaScript, and in `api/seo.smoke.ts` with a second
  public topic sharing the seeded tag

## 5. Docs and checks

- [x] 5.1 Update `ui/AGENTS.md` and `api/AGENTS.md` for the new files, and the stale-name list for the `/topics` page
- [x] 5.2 Run `bun run check`, `bun run smoke:seo`, and `bun run smoke:signup`
