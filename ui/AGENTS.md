# ui/

TanStack Start app on Vite. `ui/src/routes/` has one file per route. `router.tsx` builds the router from the
generated `routeTree.gen.ts`, `client.tsx` hydrates it in the browser, and Start's own server entry renders it on the
server. `bun run build:ui` writes the browser bundle to `ui/dist/client/` and the server build to `ui/dist/server/`.
The api serves the browser bundle and renders pages through the server build, behind its own routes.

- `routes/` — the route tree. `__root.tsx` is the document, the site-wide head, and the loader that reads whether the
  request brings a session cookie. `_layout.tsx` wraps every page but the sign-in pages and the join page in the
  header, search bar, footer, and chat panel, and it turns server rendering off when the request brings a session
  cookie, so a signed-in user's pages render in the browser. A route file names its `component`, the page it renders,
  and imports that page directly. A route file also names its `head`, and whether it renders on the server. A public
  page does. The join page, `invite.$token.tsx`, sets `ssr: "data-only"`, and the sign-in pages set `ssr: false`. The
  signed-in pages sit under the pathless `_layout/_signedIn.tsx` layout, which renders them in the browser and runs
  `requireSession` before they load. A public page's loader reads its head and page data from the api. The route
  generator skips a file whose name starts with `-`, such as the loader both topic routes share or a route test.
- `pages/` — one file per route; `components/<area>/` — components by domain area.
- `components/primitives/` is reserved for shadcn; custom shared components go in `components/common/`.
- `components/table/` — the page tables; `lib/` — `utils.ts` and small pure client-side helpers. `pageHead.ts` turns a
  `PageHead`, or a fixed title and path, into the tags a route's `head()` returns. `loadOnServer.ts` runs a route
  loader's read on the server only, and its `loadPageOnServer` reads a page's head and page data together.
  `requireSession.ts` is the sign-in guard the `_signedIn` layout runs before its pages load. `sessionCookie.ts` reads
  on the server whether the request brings a session cookie. `visitAnalytics.ts` starts the browser's analytics and
  reports a page view per route change.
- `components/invite/` — the invite fields, editors, and modals, shared by the topic and team pages.
- `components/share/` — the share menus for a topic and a team, over the options they both use.
- `components/avatar/` — the user and team avatar pickers, over the upload pieces they both use.
- `components/podcast/` — the podcast's components, `PodcastEpisodePlayer.tsx` (the topic page's player),
  `PodcastEpisodePlayerCard.tsx` (a published podcast episode's card with its seek bar, also on the podcast episode
  page), `PodcastEpisodeChapters.tsx` (the card's chapter list), `PodcastEpisodeChaptersTable.tsx` (the episode
  page's chapters table), `PodcastEpisodesCard.tsx` (the topic page's podcast episodes by season),
  `PodcastFeedDialog.tsx` (the dialog that adds the podcast feed to a podcast app),
  `RemovePodcastEpisodeDialog.tsx` (the remove confirmation and the trash button that opens it),
  `PodcastEpisodePill.tsx` (the pills on findings and scan history rows), `PodcastEpisodeRow.tsx` (an episode's row in
  the episodes card and the topic roast), `PodcastEpisodeDetails.tsx` (an episode's season, title, and details line, in
  the player card and a tooltip), `LatestPodcastEpisodePlayButton.tsx` (the play button beside a topic's note icon),
  `PlaybackControlButtons.tsx` (the skip and playback speed buttons, in the player card and the bottom player),
  `PodcastEpisodeCover.tsx` (an episode's cover square), and `PodcastEpisodeAudio.tsx`, the one audio element and the
  podcast player that `Layout` mounts.
  `stores/podcastEpisodePlayerStore.ts` drives that element, so playback continues from one page to the next.
- `components/note/` — the Tasting Notes section, table, and dialog, and the lazily imported
  BlockNote editor with its yjs SSE provider, comment threads, and the comment "@" mention menu.
  The editor chunk loads only when a note dialog opens, so it never runs on the server.
- `clients/` — one client module per domain, named `<domain>Client.ts`. Most build on the typed `apiClient` in
  `apiClient.ts`, whose base url is relative in the browser and the api's own address on the server. `apiClient.ts`
  also exports `readApiErrorMessage`, which reads the api's error message from a failed response. Some calls, and all
  of `chatClient.ts` and `flagContentClient.ts`, use `fetch` on a relative path instead. `pageHeadClient.ts` reads a
  page's head data.
- `stores/` — app state one module owns and any component may read, named `<thing>Store.ts`. Each keeps
  its value in module scope and takes its `publish` call and `useStoreVersion` hook from `storeListeners.ts`, the one
  place the `useSyncExternalStore` contract lives, so two components read one live value with no provider
  wrapping them. Reach for a store only when state outlives a page or crosses the tree; `useState` and
  `providers/` cover everything else. Every store hook calls `useStoreVersion`, which reads the same version as the
  server snapshot.
- `hooks/` — shared React hooks; `providers/` — context providers; `assets/` — images the bundler inlines.
  A component that reads the browser during render, `localStorage`, `window`, or `document`, reads it through
  `useBrowserValue` in `hooks/useBrowserValue.ts`, so the server and the first browser render agree. A page that
  starts from a server loader's data loads in the browser through `useLoadInBrowser` in the same file.
  `useLoadInBrowser` skips the first load while hydrating data the server already read. Code without its route's
  typed `useSearch` reads the
  query string as `URLSearchParams` through `useSearchParams` in `hooks/useSearchParams.ts`.
  `useIsSignedInBeforeSession` in `hooks/useIsSignedInBeforeSession.ts` says whether the page shows as signed in. The
  page load's session cookie decides until Better Auth's session request finishes, and the session decides after.
  An element that fades in as it scrolls into view takes its class from `useRevealClassName` in
  `hooks/useRevealClassName.ts`, which shows a server-rendered element before any script runs, so nothing a crawler
  or a browser without scripts reads starts hidden.
- Imports: `@shared/*`, plus types only from the api, worker, and db, such as `AppType` and `auth`.
  `scripts/check-ui-boundary.ts` fails a value import from the api, worker, or db.
- `.tsx` is exempt from the comment-groups hook; keep the comment style anyway.
- Dev: `bun run dev:ui` (port 5173). Build: `bun run build:ui`. Tests: `bun test ui/src`.
