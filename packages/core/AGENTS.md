# packages/core/

`@carlnotes/core`, the DOM-free components, stores, hooks, and lib that web and mobile import as `@carlnotes/core/<folder>/<name>`.
It imports `@carlnotes/contracts`, `@carlnotes/client`, `react`, and `@tanstack/react-query`.

- `components/` — portable React composition exported as `@carlnotes/core/components/<name>`. `TablePagination`,
  `Pagination`, `SourceResultsChart`, `TopicScanRecap`, `NumberedTopicFindingList`, `SafeNoteLink`, `TopicScanFailure`,
  `MoreButton`, `CopyMarkdownButton`, `NotesTable`, `ResourceMetadata`, and `RatingThumbs` own repeated content,
  visibility, ordering, and interaction state. Each app
  supplies the small set of typed platform elements the component needs. Keep component adapters at module scope
  so state changes preserve their identity. Use render callbacks when controls must retain app-local refs or routing.
  Core imports no DOM or native component library. Platform wrappers keep their existing stories; web integration
  tests exercise the shared composition through real DOM adapters, and device checks cover native adapters.

- `stores/` — app state one module owns and any component may read, named `<thing>Store.ts`. Each keeps its value in
  module scope and takes its `publish` call and `useStoreVersion` hook from `storeListeners.ts`, the one place the
  `useSyncExternalStore` contract lives, beside `toEventListeners` for a store's subscribe and announce of an event, so
  two components read one live value with no provider wrapping them. Every store hook calls `useStoreVersion`, which
  reads the same version as the server snapshot. `chatRoomStore.ts` is the user's chat rooms and their chat mention
  badge counts, `noteBadgeStore.ts` the unread note counts the poll last read, with the notes opened this session that
  already cleared, and `topicInviteStore.ts` the topic invitations waiting for the user's answer.
  `podcastEpisodeQuestionRules.ts` holds a podcast player question's phases, endings, resume rule, and chapter line
  label, which `apps/web/src/stores/podcastEpisodeQuestionStore.ts` drives. A store that reaches an audio element, the
  media session, or a component library stays in `apps/web/src/stores/`.
- `hooks/` — `useNow.ts`, the current time re-read on a tick for relative labels, one clock per list; `useAvatar.ts`,
  the avatar setting read from the session and updated through it; `useUsernameChange.ts`, changing the signed-in
  user's username, shared by the account page and the profile page's edit modal; `useNoteBodySave.ts`, the save
  schedule of the note an editor has open and the hook that reads it (`toNoteBodySave`: a save a second after the
  last change, one on its way and one waiting at most, nothing for a body equal to the saved one or to the one on its
  way, `img` tags stripped first, a failed save read as unsaved and retried on the next change, a conflict that stops
  every save until it is resolved, a waiting save sent on unmount, and `EMPTY_EDITOR_HTML`, the html the editor
  reports for an empty document); and `useNoteComments.ts`, a note's comment thread loaded when the note opens, with
  its post and delete.
- `lib/` — pure rules and formatting: `labels.ts` (values as the text a user sees: dates, durations, money, sizes, and
  counts), `pageHead.ts` (a `PageHead`, or a fixed title and path, as the tags a route's `head()` returns),
  `paginationSlots.ts` (the slots a row of page links shows), `planCards.ts` (which plan card matches the user's plan
  and billing interval, and which badge shows), `streamReconnect.ts` (how long a silent SSE stream runs before it counts
  as dropped and the wait before reopening it, for the chat room stream),
  `topicFindingFilters.ts` and `topicFindingSorts.ts` (which findings a feed view shows and in what order),
  `topicSorts.ts` (the homepage's topic order under Trending: viewers, then followers, then the newest finding, with
  Featured kept in its own order),
  `topicPromptUrls.ts` (the urls written inside a topic prompt), `emailProviders.ts` (the webmail compose urls an invite
  is given), `chromeIntentUrl.ts` (the page as an Android intent url that opens it in Chrome, out of an embedded
  webview), `sessionCopy.ts` (the lines the sign-in, sign-out, sign-up, and close-account controls say, shared by the
  web and the mobile app), and `voiceRecordingDecisions.ts` (what the voice recorder decides from each frame).
- Imports: `@carlnotes/contracts`, `@carlnotes/client`, `react`, and `@tanstack/react-query`. Never a server package or an app. Universal: the
  root rule. A module that needs a DOM type is a web module and lives in `apps/web/src`.
- Tests: `bun test packages/core`.

## Shared Feed

`hooks/usePagination.ts` owns table page selection, row slicing, and clamping after the rows or page size change.
`hooks/useRowSort.ts` owns column ordering and `usePaginatedRowSort.ts` returns to page one after sorting.
Web adds its server-rendered row policy; mobile renders the same selection with native page and row-count controls.

`hooks/useTopicFeedState.ts` owns account-keyed Feed reads, optional visitor hydration, filter state, and reheat generations.
Its exported `useTopicFeedFilters` also serves query-free component stories. Apps reset filters when their navigation changes.
Reheat advances only when every requested read succeeds. A known-offline refresh returns immediately.
`hooks/useTopicFindingActions.ts` owns Finding writes and the router-free page handlers. Web keeps its existing non-optimistic timing.
Mobile opts into pending-mutation presentation and acknowledged cache updates across Home, Topic, and account-scoped search queries.
A failed write removes only its tentative change. Writes never retry or enter an offline queue.
Its optional `onChangeConfirmed` callback retains acknowledged edits in a separately mounted Finding sheet.

`lib/topicFeed.ts` owns Feed/tag selection and Resource-kind reset. Existing Finding filters and sorts keep their bookmark and tie rules.
`lib/topicFindingChanges.ts` applies action fields and unread-count changes without changing source payloads.
Its search adapter preserves result order and metadata while applying the same Finding edits across loaded pages.
`lib/topicFeedLabels.ts` owns shared section, sort, view, tag, and empty-state labels, plus the Finding-view menu options and Team bookmark scopes.
`lib/topicTutorialVideo.ts` owns tutorial openers, event properties, and first-play recording.
`lib/topicViews.ts` sends one view per Topic per web tab or native app runtime, shared by both Topic screens.
`lib/sourceResults.ts` shares Source footnote ordering, totals, detail labels, and the earlier-findings row.
`lib/topicSources.ts` shares default/custom Source ordering, off states, and screening messages between both Topic info views and the web editor.
`lib/topicScanRecap.ts` shares the diary fields, missing-entry copy, and copied note Markdown. Shared React components
compose the recap and chart from these rules; platform adapters draw the elements. Web supplies its browser origin
when building Markdown links.
Pure tests live beside these modules. Live hook tests use web's React DOM harness in `apps/web/src/hooks/useTopicFeedState.test.tsx`.
Core imports no router, DOM, React Native, native storage, or device API.
