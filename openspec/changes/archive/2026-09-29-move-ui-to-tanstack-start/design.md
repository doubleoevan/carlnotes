## Context

The ui was a Vite SPA: `ui/src/App.tsx` declared 18 `<Route>` elements over 17 lazily imported pages inside one `<BrowserRouter>`. The api served the built bundle from `ui/dist` through two `serveStatic` calls, with 8 shell routes ahead of them that rewrote head tags into the built `index.html` before it went out.

That rewrite was the whole of the server's contribution to a page. It could inject a title, a canonical, card tags, and JSON-LD, and for a public Topic it could append a `<noscript>` finding list. It could not render the page, so anything a crawler should read had to be written twice: once as React for the browser, once as a string in the api for the crawler. The second copy was why `toFindingListHtml` existed, and why there was no per-page description, no public topics page, and no link into any public Topic.

Server rendering collapses those two copies into one. TanStack Start is Vite-native, so the existing Vite config, the 158 component files, and the Bun runtime stay, and its server handler is a fetch handler that Hono can mount.

## Goals / Non-Goals

**Goals:**

- Render public pages on the server so a crawler reads the same content a browser does.
- Give every public page its own description, and give crawlers a path from the sitemap and the public topics page into all 21 public Topics.
- Keep one image, one process, one Hono server, and the docs as the static Astro build.
- Change nothing a signed-in user sees beyond slugged urls and the homepage sections' paging.

**Non-Goals:**

- Moving the 67 files that fetch imperatively onto TanStack Query. That is a second migration, and this change is already large.
- Server-rendering any signed-in page's component. Those routes keep `ssr: false`, or `ssr: "data-only"` where a shared link needs card tags, so the migration buys their components nothing and risks them nothing.
- Changing any api route beyond what search needs: the page head routes, the public topics list, the IndexNow key file and notifications, the trailing-slash redirect, the discovery files' noindex header, and the sitemap's page list.
- Redesigning any page beyond the homepage sections' paging. A component file changes only where the router, the server render, or a finding link needs it.
- Growing the amount of public content. 21 Topics and 9 Teams is all the public content this change makes crawlable. Making it larger is a product question.

## Decisions

**A page's `PageHead` is an api response, and the api keeps deciding what a private page reveals.** A Topic's, Team's, Profile's, or invite's title, description, canonical, card tags, and structured data, and for a public Topic its findings, come from database readers in the api. A route head cannot call those readers: `ui/src` may not import the api as a value, and `scripts/check-ui-boundary.ts` fails it. So each of those four has a JSON route beside its `preview.png`, returning a `PageHead`. The route's loader fetches it from the api over http and its `head()` renders it. The rule that a private or invite Topic serves card tags and never its findings stays in the api, where it is enforced, instead of in a loader where a bug would leak. The homepage's three structured-data blocks, `WebSite`, `Organization`, and `SoftwareApplication`, are pure functions of the site url and live in `shared/seo.ts`, which the homepage route reads.

**A signed-in page whose link gets shared still renders its head on the server.** An invite page is behind sign-in, but its url is what gets pasted into a chat, so its card tags have to be in the html the server sends. `ssr: "data-only"` runs the route's loader on the server and renders the component on the client, which is exactly that split.

**A server-rendered route loads its own data, and the client keeps fetching as it does.** Only the topic feed reads through TanStack Query, so most pages have no query to dehydrate into. A server-rendered route's loader calls the api over http and passes the result to the component as route data. Those 67 files still fetch imperatively, and a signed-in page fetches on mount. A public page fetches once on the server. The topic, profile, and team pages skip their mount fetch while hydrating what the server loaded, through `useLoadInBrowser`, since the server renders only a request with no session cookie and reads the api as a visitor. A later mount, a signed-in session, and a topic whose scan was running still fetch.

**A preflight script enforces the ui boundary.** `ui/tsconfig.json` references `../api` and the compiler stops no value import, and with server rendering such an import runs instead of failing in the browser. Biome's `noRestrictedImports` flags `import type` and has no way to exempt it, and the one workaround, allowing named imports, would also allow the value import of that same name. So the check is `scripts/check-ui-boundary.ts`, which forbids any value import, value re-export, side-effect import, or `import()` of `api`, `worker`, or `db` from `ui/src`.

**No client module reads `window` at import time.** Every client under `ui/src/clients/` builds on the one `apiClient` in `apiClient.ts`, whose base url is relative in the browser and the api's own address on the server, or calls `fetch` on a relative path inside a function, and `authClient.ts` creates Better Auth's client with no base url, so importing the client graph on the server throws nothing. `toInviteUrl` in `topicClient.ts` reads `window` inside the function, which runs on a click and has to return an absolute url to share.

**The theme class is set before paint and read back after mount.** The server has no `localStorage`, so a class it emitted from a saved theme would differ from the one the browser computes, which React reports as a hydration mismatch. The server renders the light theme, the pre-paint script in `__root.tsx` sets the dark class from `localStorage` or the OS setting before paint, and `useTheme` reads the class back in a layout effect instead of during the first render.

**A route behind sign-in redirects a signed-out visitor.** `requireSession` runs in `beforeLoad` on `/activity`, `/account`, `/admin`, and `/mcp/consent` and redirects a signed-out visitor to `/login?next=<path>`. `/invite/$token` has its own client-side redirect, because its loader runs on the server, where no session is visible.

**The slug is derived from the Topic name.** `/topics/<id>/<slug>` builds the slug from the name at render time, as its own segment after the id, so no id shape is assumed. Nothing is added to the schema, a renamed Topic gets a new slug for free, and the id keeps routing. A request whose slug does not match the current name redirects 301 to the current slug, and a url by id alone redirects the same way. The api's routes take the id alone.

**IndexNow is notified when a Topic is created public, when an edit makes it public or moves its url, when a public Topic goes private or is deleted, and when a scan changes its findings.** "Changed" means the scan added or removed at least one Finding on a public Topic, so a re-score that leaves a feed as it was does not notify. A rename sends the old url with the new one, so the engine finds the redirect, and a Topic that leaves the index sends its old url, so the engine drops it. `notifyIndexNowOfTopicChange` in `api/topic/topics.ts` makes that decision for the topic editor, the chat, and the MCP tools alike.

**A missing page is a 404 that shows the page's own missing message.** A route loader throws `notFound()` when the api has no such Topic, profile, or team, and the route's `notFoundComponent` is the page itself. The server renders the page's loading state, and in the browser the page's own request draws its missing message. The status comes from the router's result, so the response is a 404. The page head client returns null only for a 404 and throws on any other failure, so an api outage never reads as a missing page.

**A page with nothing to rank says so.** Sign-in pages, signed-in pages, the teams list, a private team's gate, and a bad invite link declare `noindex, follow`, so a crawler that reaches them leaves them out of results and still follows their links. A team or profile with no public Topic has nothing to rank yet, so its head is `noindex, nofollow` with no canonical until it has one. The sitemap lists no profile, and no team without a public Topic. The discovery files are for other readers than a search engine, so they are served with `X-Robots-Tag: noindex` and the sitemap lists pages only.

**A topic's date is its content's date.** The sitemap's `lastmod` and the structured data's `dateModified` read the newest Finding's creation time, or the Topic's creation time when it has none, instead of `topics.updated_at`, which moves on any settings edit. The public topics list keeps its order by `topics.updated_at`, so the page reads as it did.

**A request with a session cookie gets the app as the browser renders it.** The `_layout` route's `ssr` option is a function, and it turns server rendering off when the request brings a session cookie. A signed-in user therefore gets the shell and then the browser's render, and nothing they see is drawn once by the server and again by the browser. A visitor and a crawler, who bring no cookie, get the rendered pages. The root route's loader reads the same cookie, so the header knows before the session request finishes whether to draw the signed-in layout. Loaders that only serve a page's head return at once in the browser, so a navigation draws the page's skeleton without waiting.

**The homepage's sections are crawlable through their paging.** The homepage route's loader reads a visitor's feed on the server and the feed provider seeds its query with it, so the server renders the Featured and Popular sections and the browser's first render matches. Each section shows five topics per page above a row of page links, `/?popular=2`, whose search value is the section's page number, so a crawler reaches every Topic the sections show and a user pages without a reload. A long list skips pages in the row, and a crawler still reaches every page through the previous and next links. The accordion force-mounts every section so a closed section is in the HTML, hidden, at the cost of that section's collapse animation. A signed-in user's request renders in the browser, so the loader returns nothing there and the provider fetches the feed itself.

**A route file imports its page directly.** The Start plugin already splits each route's component into its own chunk and the router loads that chunk before rendering. A route file that lazily imports its page on top of that adds a second chunk the router does not load ahead of the render, so the route's first render in each server process suspends and streams its content after the footer for a script to swap in. A crawler the stream handler recognizes is sent the page only once it is whole, but anyone else, a browser without JavaScript or a crawler it does not know, reads the loading fallback. With the page imported directly, every render is whole for every visitor. `smoke:seo` renders each public page as its route's first render in a fresh process and fails if anything streams in after the footer or arrives still loading.

**Every public page's loader reads that page's own data on the server.** The topic, profile, and team pages each fetch their page data beside their head, and the page starts from it instead of from a loading state, so the html a crawler reads includes the page itself. The shared `loadOnServer` helper runs a loader's read only on the server. On a browser navigation the page draws at once and loads its own data.

**A finding's link is user content.** The homepage's finding rows stay buttons that open Carl's note, since outbound links there would spend the homepage's link weight on other sites and skip the note. The topic page links each finding next to Carl's note, as a cited source, and those links have `rel="noopener ugc"`. Anyone can create a public Topic, so without `ugc` a public Topic would be a way to collect followed links from carlnotes.com. The links stay in the page and keep the content rich, and the site only stops vouching for them. They drop `noreferrer`, so a publisher sees CarlNotes in its referrer stats.

**The Start handler mounts last.** `documentsRoute`, `contentRoute`, `releasesRoute`, the docs routes, `/api`, `/mcp`, and the four `/.well-known/oauth-*` routes register ahead of it, then `serveStatic` over the built client files, then the redirect of a page url that ends in a slash, then the handler for every other GET. `robots.txt` is a file in `ui/public/` that the build copies to `ui/dist/client/`, so it resolves at the site root.

**The router restores the scroll position.** `scrollRestoration` on the router starts a new page at the top and returns a user to where they were on Back. The old `ScrollToTop` component scrolled to the top on every path change, Back included, and it is gone. A section's page links pass `resetScroll={false}`, so paging keeps the clicked link where it was, and opening a section snaps its header to the top through its own click handler.

## Risks / Trade-offs

**This is the largest change the repo has taken.** 17 pages moved onto 18 page routes, 158 component files, 34 navigation sites, and the server's entire delivery path. It cannot be shipped behind a flag, because the routing layer is either react-router or Start. The mitigation is order: the client-module fix goes first and alone, then the route tree with SSR off everywhere, then SSR is turned on one route at a time.

**Hydration mismatches are the likely source of bugs**, and they show as visual flicker or a React warning instead of as a failing test. The theme class is one. Others come from any component that reads `window`, `localStorage`, or a date during its first render, which `useBrowserValue` exists for. No DOM test environment exists, `bunfig.toml` has no preload and the component tests assert on `renderToStaticMarkup` output, so these are caught by rendering routes to a string in tests and by looking at real pages.

**A public page runs api calls on the server for every visitor.** A request for a public Topic page costs a server render plus the loader's two api calls, which puts crawler traffic on the app's request path. The pool in `db/index.ts`, ten connections by default, and the absence of a CDN are the ceiling it runs into.

**The runtime image includes the ui build.** The Dockerfile runtime stage copies TypeScript source, which Bun runs directly, and the Start build from the build stage, because `build:ui` writes a server bundle to `ui/dist/server/` beside the client files in `ui/dist/client/`. `VITE_TURNSTILE_SITE_KEY` and the `VITE_POSTHOG_*` values are build args, which Vite inlines.

**BlockNote and yjs are browser-only**, lazily imported by `ui/src/components/note/NoteDialog.tsx` and pinned by an assertion in `noteStates.test.tsx`. They stay client-only, and their two bare CSS imports in `NoteEditor.tsx` load with the editor chunk, never on the server.

**Slugged urls change every shared link's shape.** A 301 handles crawlers and browsers, but anything with a bare id url, an email already sent, a chat message, an MCP tool response, takes a redirect hop. Nothing breaks, and each gets one extra round trip.

**`appUrl()` defaults to `http://localhost:5173`** in `shared/appUrl.ts`. If dev collapses to a single Start origin, that default is wrong for canonical and `og:url`, and the wrongness is invisible until something reads a canonical in dev.

**The site url has two sources.** `SITE_URL` in `ui/src/lib/pageHead.ts` is `https://carlnotes.com`. The root route's card tags, the homepage's canonical and structured data, and the canonical and `og:url` that `toStaticHeadTags` builds for `/topics`, `/plans`, `/terms`, and `/privacy` read it. `appUrl()` in `shared/appUrl.ts` reads `BETTER_AUTH_URL` for the topic, team, profile, and invite heads, the sitemap, and the feeds. In production the two agree. Anywhere else, a static page's canonical names carlnotes.com while a topic page's canonical names the local or preview origin.

**A public Topic below the findings minimum is not indexed yet.** The sitemap, the public topics page, the homepage's Featured and Popular sections, and the public part of the MCP topic list include a public Topic only once it is shown, through `isPublicAndShown`. `toTopicPageHead` in `api/share/pageHead.ts` follows the same bar, so a Topic with fewer than `MINIMUM_SHOWN_FINDINGS` Findings is `noindex` with no canonical until it has them, the way a team or profile with no public Topic is. Its card and feed link stay, so a shared link still previews.
