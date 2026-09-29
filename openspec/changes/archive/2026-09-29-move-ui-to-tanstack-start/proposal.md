## Why

Google has indexed one page of carlnotes.com, its homepage. Bing has none. The sitemap offers 52 urls, 21 of them public Topics and 9 public Teams, and the crawl reaches almost none of it.

Three reasons, all measured:

**A crawler without JavaScript sees no links.** The api serves `ui/dist` behind hand-written shell routes, and those shells inject head tags only. `ui/index.html`'s `<noscript>` block has no links in it, and the one per-Topic `<noscript>` list exists on `/topics/:id` alone. The SPA does link every Topic from the homepage, at `ui/src/components/topic/Topic.tsx:61`, but that link is written by React after the bundle runs. In the HTML the server sends, nothing points at a Topic.

**Every shell page has one description.** `ui/index.html:28` is the only `name="description"` those pages get, and no shell route replaces it. The blog and release pages write their own at `api/content.ts:90`.

**A public Topic's substance is hidden from the page.** Its findings render into a `<noscript>` block through `toFindingListHtml` (`api/seo.ts:336`), which is markup written to be ignored by the browser that renders the real page.

The shells are the ceiling. Each one is a string rewrite over a built `index.html`, so a per-page description, a public topics page, a related-topics block, and visible finding text all mean more string rewriting in the api's shell routes against a bundle the server cannot render. Server rendering is what removes that ceiling, and TanStack Start is the Vite-native way to get it without leaving Bun, Hono, or the one-image deploy.

## What Changes

**Part one, the migration.** `react-router-dom` 7.18.1 in declarative mode is replaced by TanStack Start on Vite. File-based routes under `ui/src/routes` cover every page, the typed `Link` and `useNavigate` replace 34 navigation sites across 16 files, and the files under `ui/src/components` change only where the router or the server render needs it. The Start server handler mounts in the Hono server as the fallback for every non-api GET, in place of the `serveStatic` call that served `index.html` for every unmatched path, so the app stays one image on Bun.

SSR is on for `/`, `/topics`, `/topics/$topicId`, `/topics/$topicId/$topicSlug`, `/teams`, `/teams/$teamId`, `/profiles/$userId`, `/plans`, `/terms`, and `/privacy`. It is off for every route behind sign-in, and for every route when the request brings a session cookie, which keeps a signed-in user's pages rendering in the browser.

**Part two, the SEO pages**, built on that SSR. A public Topic page renders its findings as visible HTML: an `h1`, the description, and the ranked findings as links with each finding's relevance explanation. A private or invite Topic keeps card tags only. Every Topic page takes its own description from the last scan's summary, or the Topic's prompt when there is none, clipped to 160 characters. `/topics` lists every shown public Topic, most recently updated first, and the sitemap lists it. Topic urls gain a slug after the id, `/topics/<id>/<slug>`, with the bare id and any stale slug redirecting to the current slug. IndexNow is notified when a Topic is created public, when an edit makes it public or a rename moves its url, and when a scan changes a public Topic's findings.

**Corrections to the request.** Five claims in the request this change was written from are wrong:

- **TanStack Query is not the data layer.** Two files import it: `ui/src/main.tsx` and `ui/src/providers/TopicFeedProvider.tsx`. Sixty-seven files fetch imperatively through `ui/src/clients/` with `useState` and `useEffect`. "Keep TanStack Query as the data layer" describes a layer that does not exist, so route loaders have nothing to dehydrate into. Either those 67 files move onto the query client, which is a second migration the brief does not scope, or the SSR routes load their own data and the client keeps fetching as it does. This change takes the second path and says so.
- **There are no route guards to port.** `grep -rn "ProtectedRoute\|RequireAuth\|requireAuth" ui/src` returns nothing. Five of 17 routes are behind sign-in, and only two of them redirect: `invite/:token` and `mcp/consent`. The other three print a sentence in the page. `beforeLoad` guards are therefore new behavior, not a port, and adding them changes what an anonymous visitor sees on `/activity`, `/account`, and `/admin`.
- **The ui-to-api boundary is not compile-enforced.** `ui/tsconfig.json` references `../api`, there is no `rootDir`, and Biome has no import restriction, so an api value import from `ui/src` compiles today. It fails only because the browser has no server code. Under SSR it would silently work. The boundary has to be given real enforcement in this change, and the sentence in `AGENTS.md` claiming it is compile-enforced has to be corrected.
- **The homepage does link to Topics**, in the SPA. The accurate claim is that no Topic link appears in the server-delivered HTML.
- **Counts:** 21 public Topics, not 18. The sitemap lists 52 urls. `robots.txt` is the static file `ui/public/robots.txt`, not an api route. The api has about 174 method-and-path pairs, a number too brittle to be worth stating.

## Capabilities

### New Capabilities

- `ui-routing`: the TanStack Start route tree, with its file-based routes, the routes that render on the server and the routes that stay client-only, typed navigation, and the `beforeLoad` sign-in guards.

### Modified Capabilities

- `static-serving`: the Start server handler replaces the static bundle fallback and the shell rewrite, while the api keeps serving its document routes and the docs build ahead of it.
- `seo`: every public page declares its own description, the `/topics` page links crawlers to the public Topics, Topic urls include a slug with redirects from the bare id, and IndexNow is notified when a public Topic changes.
- `social-sharing`: the public Topic page's meta tags and structured data move from the api's shell rewrite into the route's own head, and its findings render as visible HTML instead of a `<noscript>` block. The profile page's tags move the same way, and a missing user is a 404.
- `docs-site`: the docs handler sits ahead of the ui's server handler instead of the app shell fallback, so no `/docs` path is rendered by the ui.

## Impact

- `ui/src/routes/` — new, 18 page routes under the root route, the `_layout` route, and the `_signedIn` layout. `ui/src/App.tsx` and its `BrowserRouter` are deleted.
- `ui/src/clients/` — six files read `window.location.origin` at module scope and would throw on the server. They move onto one shared `apiClient` in `apiClient.ts`, relative in the browser and the api's own address on the server.
- `api/index.ts` — the `serveStatic` fallback that served `index.html` becomes the Start handler, and the asset `serveStatic` serves `ui/dist/client`. `documentsRoute`, `contentRoute`, `releasesRoute`, and the docs routes stay mounted ahead of it.
- `api/pages.ts` becomes `api/documents.ts`. The 8 shell routes go, the 7 document routes stay, and the IndexNow key route joins them. `toShellWithHeadTags` and the four preview builders in `api/share/preview.ts` go with the shell routes.
- `api/share/pageHead.ts` — new, the four page head routes and the builders that return their `PageHead`, in place of the html builders in `api/share/preview.ts`, which keeps the preview card alone.
- `api/seo.ts` — keeps the sitemap and the Topic's JSON-LD builders, which the topic head route calls. `toFindingListHtml` goes, and the homepage's builders move to `shared/seo.ts`.
- `worker/workflows/run-topic-scan-activities.ts` — `finishScan` notifies IndexNow.
- `Dockerfile` — the runtime stage ships TypeScript source and copies `ui/dist`, which includes the Start server build beside the client files.
- `AGENTS.md`, `ui/AGENTS.md`, `README.md`, and the root module map — the routing model, the scripts, and the boundary claim.
- The api's routes change only for search: the page head routes, the public topics list, the IndexNow key file and notifications, a trailing-slash redirect, a noindex header on the discovery files, and the sitemap's page list. Signed-in users see no change beyond slugged urls and paged homepage sections.
