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
- `components/table/` — the page tables and their cells: `TopicNameLink.tsx`, a topic's linked name with its latest
  podcast episode's play button, and `PodcastEpisodeTitleLink.tsx`, a podcast episode's linked title with its play
  button. `TeamMembershipRows.tsx` holds the teams table's membership and invite rows, `AdminUserRows.tsx` the admin
  users table's row with its subtables, and `PagedTableSection.tsx` the titled section of a paged, sortable table that
  Similar topics and both episode tables share. `usePagination` in
  `TablePagination.tsx` starts a table at ten rows a page unless it asks for another size, and its
  `ScriptedTablePagination` shows a paged table's pagination only with JavaScript.
- `components/chat/` — the chat panel, both composers, the chat message lists, and the hooks behind them.
  `useChatRoom.ts` is the chat room's state, `useChatRoomSpokenAnswer.ts` speaks carl's reply to the browser's spoken
  message, and `useChatRoomLinkPreviews.ts` polls for fresh chat messages' link preview cards. `MicButton.tsx` is the
  mic in an empty composer's send slot, `RecordingBar.tsx` the bar that replaces the box while a recording runs, and
  `useVoiceRecording.ts` the recording's state machine from the mic tap to the transcript, which loads
  `lib/voiceRecorder.ts` on the first tap, and listen mode, which reopens the mic on the tap's audio context once carl
  finishes his spoken answer. `SpokenAnswerButton.tsx` is the play button beside the copy button in
  carl's reply footer, and `SpokenAnswerAudio.tsx` the audio element
  carl's spoken answers play through, which `Layout` mounts beside the podcast's. `chatRejectionCopy.ts` holds the
  sentence for each chat rejection, and `chatRoomTestFixtures.ts` the chat fixtures the chat tests share.
- `lib/` — `utils.ts` and small pure client-side helpers. `voiceRecorder.ts` records the microphone, reads its level
  through an analyser, ends the recording once the speaker stops or the limit passes, and releases the microphone at
  every end, a rejected request included. `pageHead.ts` turns a
  `PageHead`, or a fixed title and path, into the tags a route's `head()` returns. `loadOnServer.ts` runs a route
  loader's read on the server only, and its `loadPageOnServer` reads a page's head and page data together. Its
  `readWithDegradedFallback` returns a fallback for a failed read and marks the response, which the api answers 503.
  `requireSession.ts` is the sign-in guard the `_signedIn` layout runs before its pages load. `sessionCookie.ts` reads
  on the server whether the request brings a session cookie. `visitAnalytics.ts` starts the browser's analytics,
  reports a page view per route change, and captures the named visit events, their urls rewritten like every other
  event's. `renderedRows.ts` picks the rows a paged list renders: the page shown and the list's first fifty.
- `components/invite/` — the invite fields, editors, and modals, shared by the topic and team pages.
- `components/share/` — the share menus for a topic and a team, over the options they both use.
- `components/search/` — the header's search bar, its Filters menu, and its result rows. The topic, podcast episode,
  team, and user matches are server searches sent once typing pauses, and the finding matches come from the loaded
  feed.
- `components/avatar/` — the user and team avatar pickers, over the upload pieces they both use. `AvatarUpload.tsx`
  turns a chosen file into the resized re-encode the app stores, a PNG for a PNG, WebP, or GIF source so a transparent
  logo keeps its background, and a JPEG for a photo. A file of a megabyte or more decodes at 512 pixels wide,
  a HEIC file the browser rejects decodes through a HEIC decoder the page loads on that pick, and a file that could
  not be decoded or resized is reported by its content type and byte size and shows a message.
- `components/podcast/` — the podcast's components, `PodcastEpisodePlayer.tsx` (the topic page's player),
  `PodcastEpisodePlayerCard.tsx` (a published podcast episode's card with its seek bar, also on the podcast episode
  page), `PodcastEpisodeChapters.tsx` (the card's chapter list), `PodcastEpisodeChaptersTable.tsx` (the episode
  page's chapters table), `PodcastEpisodesCard.tsx` (the topic page's podcast episodes by season),
  `PodcastFeedDialog.tsx` (the dialog that adds the podcast feed to a podcast app),
  `RemovePodcastEpisodeDialog.tsx` (the remove confirmation and the trash button that opens it),
  `PodcastEpisodePill.tsx` (the pills on findings and scan history rows), `PodcastEpisodeRow.tsx` (an episode's row in
  the episodes card and the topic roast), `PodcastEpisodeDetails.tsx` (an episode's season, title, and details line, in
  the player card and a tooltip), `PodcastEpisodePlayButton.tsx` (a podcast episode's play button, beside a topic's
  note icon and in a table's title cell), `PodcastEpisodesSection.tsx` (the episode page's Other episodes and
  Similar podcasts tables, sortable by title and description), `PodcastEpisodeTranscript.tsx` (the episode page's
  transcript), `podcastEpisodeTestFixtures.ts` (the ui tests' episode summary),
  `PlaybackControlButtons.tsx` (the skip and playback speed buttons, in the player card and the bottom player),
  `ThemeSongNote.tsx` (the note icon whose popup credits the theme song, beside the podcast's name and episode titles,
  with the lyrics from `themeSongLyrics.ts`),
  `PodcastEpisodeCover.tsx` (an episode's cover square), and `PodcastEpisodeAudio.tsx`, the one audio element and the
  podcast player that `Layout` mounts.
  `stores/podcastEpisodePlayerStore.ts` drives that element, so playback continues from one page to the next, and
  `stores/podcastEpisodeListenStore.ts` saves a signed-in user's progress in the episode.
- `components/note/` — the Tasting Notes section, table, and dialog, and the lazily imported
  BlockNote editor with its yjs SSE provider, comment threads, and the comment "@" mention menu.
  The editor chunk loads only when a note dialog opens, so it never runs on the server.
- `clients/` — one client module per domain, named `<domain>Client.ts`. Most build on the typed `apiClient` in
  `apiClient.ts`, whose base url is relative in the browser and the api's own address on the server. `apiClient.ts`
  also exports `readApiErrorMessage`, which reads the api's error message from a failed response. Some calls, and all
  of `chatClient.ts`, `flagContentClient.ts`, and `voiceClient.ts`, use `fetch` on a relative path instead.
  `pageHeadClient.ts` reads a page's head data.
- `stores/` — app state one module owns and any component may read, named `<thing>Store.ts`. Each keeps its value in
  module scope and takes its `publish` call and `useStoreVersion` hook from `storeListeners.ts`, the one place the
  `useSyncExternalStore` contract lives, so two components read one live value with no provider wrapping them. Reach for
  a store only when state outlives a page or crosses the tree; `useState` and `providers/` cover everything else. Every
  store hook calls `useStoreVersion`, which reads the same version as the server snapshot. `spokenAnswerStore.ts` drives
  the spoken answer audio element: the queue of one reply's spoken parts, keyed by its spoken answer key, the playing
  state the play buttons read, and the announcement of each queue's end that listen mode reads. It pauses the podcast
  episode before carl speaks, the podcast store stops carl when the episode plays, and it holds back a chat room's
  auto-played reply while a composer records. `spokenAudioCache.ts` keeps the session's spoken audio by spoken part text
  within a size limit, and returns a spoken part's audio from the cache, from a fetch already on its way, or from the
  speech route. `podcastEpisodeListenStore.ts` keeps whether the user is signed in and saves a signed-in user's progress
  in the loaded podcast episode, its playback start once per load, for the player store.
- `hooks/` — shared React hooks, `useTopicPagePayload.ts` among them, the topic page's payload and its poll reload;
  `providers/` — context providers; `assets/` — images the bundler inlines.
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
  or a browser without JavaScript reads starts hidden.
- Imports: `@shared/*`, plus types only from the api, worker, and db, such as `AppType` and `auth`.
  `scripts/check-ui-boundary.ts` fails a value import from the api, worker, or db.
- `.tsx` is exempt from the comment-groups hook; keep the comment style anyway.
- Dev: `bun run dev:ui` (port 5173). Build: `bun run build:ui`. Tests: `bun test ui/src`.
