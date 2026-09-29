## 1. Make the ui importable on a server

- [x] 1.1 Rewrite the six clients that read `window.location.origin` at module scope to build on one shared `apiClient` in `apiClient.ts`, relative in the browser and the api's own address on the server: `mcpClient.ts`, `activityClient.ts`, `billingClient.ts`, `authClient.ts` (two sites), `teamClient.ts`, `topicClient.ts`
- [x] 1.2 Import the ui's client modules in a test that runs with no DOM, and assert none throws
- [x] 1.3 Add `scripts/check-ui-boundary.ts`, a preflight check forbidding `ui/src` from importing `api`, `worker`, or `db` as values, and confirm `bun run check` fails when one is added
- [x] 1.4 Correct the sentence in `AGENTS.md` that claimed the boundary is compile-enforced by tsconfig project references

## 2. The route tree, server rendering off

- [x] 2.1 Add TanStack Start to the Vite build, keeping the existing plugins, and proxy `/mcp`, `/.well-known`, and the api's document routes in dev beside the five existing prefixes
- [x] 2.2 Create `ui/src/routes` with a route file per page, matching today's paths, with server rendering off for all of them
- [x] 2.3 Move the pathless layout route, the per-route suspense boundaries, and the not-found route
- [x] 2.4 Replace the 34 navigation sites across 16 files with the typed `Link` and `useNavigate`, including the one `Navigate` element in `InvitePage.tsx`
- [x] 2.5 Delete `ui/src/App.tsx` and its `BrowserRouter`
- [x] 2.6 Update the three component tests that wrap in `MemoryRouter`
- [x] 2.7 Mount the Start handler in `api/index.ts` in place of the `serveStatic` fallback that served `index.html`, leaving every other route registered ahead of it
- [x] 2.8 Confirm `robots.txt` still resolves at the site root

## 3. Server rendering, one route at a time

- [x] 3.1 Resolve the theme class on the server and reconcile it after mount, so the pre-paint script causes no hydration mismatch
- [x] 3.2 Keep BlockNote and yjs client-only, including their two bare CSS imports, and keep the lazy import its test asserts
- [x] 3.3 Turn server rendering on for `/`, then `/topics/$topicId`, then `/teams/$teamId`, `/profiles/$userId`, `/plans`, and `/terms`, checking each for hydration warnings before the next
- [x] 3.4 Add a JSON `PageHead` route beside each `preview.png` route, for a topic, a team, a profile, and an invite. Each ui route's loader fetches that `PageHead`, and the route's head renders it. Move the two homepage structured-data builders to `shared/seo.ts`
- [x] 3.5 Delete the 8 shell routes, `toShellWithHeadTags`, the four preview builders in `api/share/preview.ts`, `toFindingListHtml`, and both `noscript` bodies, and rename what is left of `api/pages.ts` to `api/documents.ts`
- [x] 3.6 Confirm the 7 document routes in `api/documents.ts` still respond ahead of the ui's server handler
- [x] 3.7 Guard `/activity`, `/account`, `/admin`, and `/mcp/consent` with a `beforeLoad` session check that redirects a signed-out visitor to `/login?next=<path>`, replacing the in-page sentences and redirect. `/invite/$token` keeps its own client-side redirect
- [x] 3.8 Turn server rendering off in `_layout.tsx` when the request brings a session cookie, and read the cookie in the root loader so the header draws the signed-in layout before the session request finishes

## 4. The SEO product

- [x] 4.1 Render a public Topic's findings as visible HTML: the name as a heading, the description, and the ranked findings as links with their relevance explanations, keeping a non-public Topic to card tags only
- [x] 4.2 Give every public page its own meta description, from the last scan's summary or the Topic's prompt, clipped to 160 characters
- [x] 4.3 Add the `/topics` page, server-rendered, reusing `loadPublicTopics` from `api/seo.ts`, and add it to the sitemap's static routes
- [x] 4.4 Render a visitor's homepage sections on the server from the homepage route's loader, page every section five at a time with a row of page links that name the page in the url, and keep a closed section in the HTML
- [x] 4.5 Add the slug to Topic urls after the id, with a permanent redirect from the id alone and from a stale slug, and use the slugged form in the sitemap, the canonical, the card url, the emails, and every link that has the Topic's name at hand
- [x] 4.6 Notify IndexNow from `finishScan` when a Scan added or removed a Finding on a public Topic, and from the api when a Topic is created public or an edit makes it public, without failing the Scan on a rejected notification
- [x] 4.7 Serve the IndexNow key file at the site root
- [x] 4.8 Mark every link to a finding's source `rel="noopener ugc"` through `AnchorLink`'s `isUserContent`, in the note popover, the topic's numbered findings, the links in Carl's scan notes, and the search results, and check it in the route test and `smoke:seo`
- [x] 4.9 Respond 404 for a missing Topic, profile, or team through `notFound()`, with the page itself as the route's `notFoundComponent`, and make the page head client throw on a failure other than a 404
- [x] 4.10 Declare `noindex, follow` on the sign-in pages, the signed-in pages, `/teams`, a private team's page, and a bad invite link, with the page's own title on the sign-in, sign-up, password reset, and `/teams` pages, and keep a team or profile with no public Topic out of the index and the sitemap, counting a team's shared public Topics
- [x] 4.11 Date a Topic's `lastmod` and `dateModified` by its newest Finding, write descriptions as plain words from the latest scan that kept a Finding, and give the plans, terms, and privacy pages their own description and card title and url
- [x] 4.12 List only pages in the sitemap, serve the discovery files with `X-Robots-Tag: noindex`, and redirect a page url ending in a slash to the url without it
- [x] 4.13 Link the site-wide feed from every page and a public Topic's feed from its page, add the homepage's `WebSite` structured data, and give the header's hero image its size
- [x] 4.14 Notify IndexNow when a rename moves a public Topic's url, with the old url beside the new one, from the topic editor, the chat, and the MCP tools

## 5. Build and docs

- [x] 5.1 Ship the Start server build in the Dockerfile's runtime stage through its existing `ui/dist` copy, keeping the Vite build args
- [x] 5.2 Add the `smoke:seo` script to package.json, and to the README Development section in the same change
- [x] 5.3 Update `ui/AGENTS.md` and the root module map for the route tree and the new server entry point
- [x] 5.4 Keep the domain-model skill in sync

## 6. Tests and verification

- [x] 6.1 Render the public Topic route to a string and assert its title, its heading, a finding link, and a description that differs from the site-wide one
- [x] 6.2 Test the slug and both redirects: the id alone, and a stale slug
- [x] 6.3 Test that `/topics` lists only public Topics
- [x] 6.4 Run `bun run check`
- [x] 6.5 Fetch a public Topic page as Googlebot and confirm its title, description, and finding links are in the HTML before any script runs
- [x] 6.6 Fetch the public topics page as Googlebot and confirm it links to every shown public Topic
- [x] 6.7 Confirm a signed-in page still arrives unrendered and renders in the browser
- [x] 6.8 Confirm a signed-out visitor to `/account` is redirected to sign in
- [x] 6.9 Add to `smoke:seo` a render of every public page as its route's first render in a fresh process, for a browser without JavaScript, failing on content streamed after the footer or a page still loading, and confirm it fails when a route lazily imports its page
- [x] 6.10 Respond 503 and report the error when the ui's server build fails to import, keeping the 404 for a build that is missing
- [x] 6.11 Report a topic page's slug to visit analytics as `:slug`, so a private topic's name never reaches the report
- [x] 6.12 Create the query client once per server request, so one visitor's render never shows the feed another request read
