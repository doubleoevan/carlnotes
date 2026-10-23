# packages/core/

`@carlnotes/core`, the DOM-free stores, hooks, and lib that `apps/web` imports as `@carlnotes/core/<folder>/<name>`:
state and rules with no browser in them. It imports `@carlnotes/contracts`, `@carlnotes/client`, and `react`.

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
  the avatar setting read from the session and updated through it; and `useUsernameChange.ts`, changing the signed-in
  user's username, shared by the account page and the profile page's edit modal.
- `lib/` — pure rules and formatting: `labels.ts` (values as the text a user sees: dates, durations, money, sizes, and
  counts), `pageHead.ts` (a `PageHead`, or a fixed title and path, as the tags a route's `head()` returns),
  `paginationSlots.ts` (the slots a row of page links shows), `planCards.ts` (which plan card matches the user's plan
  and billing interval, and which badge shows), `streamReconnect.ts` (how long a silent SSE stream runs before it counts
  as dropped and the wait before reopening it, shared by the note stream and the chat room stream),
  `topicFindingFilters.ts` and `topicFindingSorts.ts` (which findings a feed view shows and in what order),
  `topicSorts.ts` (the homepage's topic order under Trending: viewers, then followers, then the newest finding, with
  Featured kept in its own order),
  `topicPromptUrls.ts` (the urls written inside a topic prompt), `emailProviders.ts` (the webmail compose urls an invite
  is given), `chromeIntentUrl.ts` (the page as an Android intent url that opens it in Chrome, out of an embedded
  webview), and `voiceRecordingDecisions.ts` (what the voice recorder decides from each frame).
- Imports: `@carlnotes/contracts`, `@carlnotes/client`, and `react`. Never a server package or an app. Universal: the
  root rule. A module that needs a DOM type is a web module and lives in `apps/web/src`.
- Tests: `bun test packages/core`.
