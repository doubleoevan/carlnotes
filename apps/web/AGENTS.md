# apps/web/

TanStack Start app on Vite, the `@carlnotes/web` app and the one browser entry. `apps/web/src/routes/` has one file
per route. `router.tsx` builds the router from the generated `routeTree.gen.ts` and configures the api client,
`client.tsx` hydrates it in the browser, and Start's own server entry renders it on the server. `bun run build:ui`
writes the browser bundle to `apps/web/dist/client/` and the server build to `apps/web/dist/server/`. The api serves
the browser bundle and renders pages through the server build, behind its own routes. Nothing imports this app.

- `routes/` — the route tree. `__root.tsx` is the document, the site-wide head, the one toast host every route shares,
  and the loader that reads whether the request brings a session cookie. `_layout.tsx` wraps every page but the sign-in
  pages and the join page in the header, search bar, footer, and chat panel, and it turns server rendering off if the
  request brings a session cookie, so a signed-in user's pages render in the browser. A route file names its
  `component`, the page it renders, and imports that page directly. A route file also names its `head`, and whether it
  renders on the server. A public page does. The join page, `invite.$token.tsx`, sets `ssr: "data-only"`, and the
  sign-in pages set `ssr: false`. The signed-in pages sit under the pathless `_layout/_signedIn.tsx` layout, which
  renders them in the browser and runs `requireSession` before they load. A public page's loader reads its head and page
  data from the api. The route generator skips a file whose name starts with `-`, such as the loader both topic routes
  share, the route tests' router in `-loadRouter.ts`, or a route test.
- `pages/` — one file per route; `components/<area>/` — components by domain area.
- `components/primitives/` is reserved for shadcn; custom shared components go in `components/common/`, among them
  `IconButton.tsx`, the button whose tooltip is also its accessible name.
- `components/table/` — the page tables and their cells: `TopicNameLink.tsx`, a topic's linked name with its latest
  podcast episode's play button, and `PodcastEpisodeTitleLink.tsx`, a podcast episode's linked title with its play
  button. `TeamMembershipRows.tsx` holds the teams table's membership and invite rows, `TeamSubtablesRow.tsx` the
  members or topics subtable a membership row opens under itself, with `useTeamSubtables`, the hook that holds which one
  is open and the team page payload that fills it, `AdminUserRows.tsx` the admin users table's row with its subtables,
  and `PagedTableSection.tsx` the titled section of a paged, sortable table that Similar topics and both episode tables
  share. `usePagination` in `TablePagination.tsx` starts a table at ten rows a page unless it asks for another size, and
  its `ScriptedTablePagination` shows a paged table's pagination only with JavaScript.
- `components/chat/` — the chat panel, both composers, the chat message lists, and the hooks behind them.
  `useChatRoom.ts` is the chat room's state, `useChatRoomSpokenAnswer.ts` speaks carl's reply to the browser's spoken
  message, and `useChatRoomLinkPreviews.ts` polls for fresh chat messages' link preview cards. `MicButton.tsx` is the
  mic in an empty composer's send slot, `RecordingBar.tsx` the bar that replaces the box while a recording runs, and
  `useVoiceRecording.ts` the recording's state machine from the mic tap to the transcript, which loads
  `lib/voiceRecorder.ts` on the first tap, with its rules in `voiceRecordingRules.ts` and listen mode in
  `useListenMode.ts`, which reopens the mic on the tap's audio context once carl finishes his spoken answer. A podcast
  player question records through `useVoiceRecording.ts` too, with no listen mode, ending on the voice activity
  detector. `PodcastEpisodeChapterTag.tsx` is the tag under a question asked from the podcast player, which plays that
  chapter. `SpokenAnswerButton.tsx` is the play button beside the copy button in a host's reply footer, and
  `SpokenAnswerAudio.tsx` the audio element that the hosts' spoken answers play through, which `Layout` mounts beside
  the podcast's. Only a question asked from the podcast player gets a `cohost` answer. Past the spoken questions cutoff,
  a mic opens the plans page through `spokenQuestionsPaused.ts`, which holds the plans page's upgrade toasts.
  `chatRejectionCopy.ts` holds the sentence for each chat rejection, the voice recording's toasts, the label and path of
  the link that opens the plans page, and `toastChatRejection`, which toasts a rejection. `chatTurns.ts` builds the chat
  panel's chat turns, and finds, replaces, and drops a chat turn by its spoken answer key. `chatRoomTestFixtures.ts` and
  `chatMessagesTestFixtures.tsx` hold the chat fixtures the chat tests share.
- `lib/` — `utils.ts` and small client-side helpers that read the browser. `toastActions.ts` builds the See plans and
  See account toast actions. `podcastEpisodePlayback.ts` holds the playback math and the lock screen's media session,
  with `isMediaSessionAvailable`, which the spoken answer queue shares. `voiceRecorder.ts` records the microphone, reads
  its level through an analyser, ends the recording once the user stops or the limit passes, and releases the microphone
  at every end, a rejected request included, with `@carlnotes/core/lib/voiceRecordingDecisions` for what it decides
  from each frame. `voiceActivity.ts` wraps `@ricky0123/vad-web`, the on-device voice activity detector that ends a
  podcast player question, loaded on the first question and made once per page. Its worklet, model, and WebAssembly
  runtime are served from `/assets/voice-activity-<versions>/` by `apps/web/voiceActivityAssetsPlugin.ts`, the Vite
  plugin that copies them out of the installed packages' folders into the client build and serves them in dev.
  `@carlnotes/core/lib/pageHead` turns a `PageHead`, or a fixed title and path, into the tags a route's `head()`
  returns. `loadOnServer.ts` runs a route loader's read on the server only, and its `loadPageOnServer` reads a page's
  head and page data together. Its `readWithDegradedFallback` returns a fallback for a failed read and marks the
  response, so the api responds 503. `requireSession.ts` is the sign-in guard the `_signedIn` layout runs before its
  pages load. `sessionCookie.ts` reads on the server whether the request brings a session cookie. `visitAnalytics.ts`
  starts the browser's analytics, reports a page view per route change, and captures the named visit events, their urls
  rewritten like every other event's. `renderedRows.ts` picks the rows a paged list renders: the page shown and the
  list's first fifty. `billingRedirects.ts` sends the browser to the Stripe Customer Portal at the url
  `@carlnotes/client/billingClient` returns, and the plans page opens Checkout the same way,
  and `inviteUrl.ts` builds an invite token's absolute url on the page's
  origin. Both read `window`. `installDeeplinks.ts` holds
  the Add to AI dialog's providers, their deeplinks and paste steps, and the remembered choice, `shareSheet.ts` opens
  the operating system's share sheet, and `staleBundleReload.ts` reloads the page once if a deploy removed a bundle
  file the open page still asks for.
- `components/session/` — the login and signup pages' layout and their sign-in pieces.
  `signupPrompts.ts` names each action that sends a visitor to signup, with the toast the signup page shows on arrival,
  and `toSignupNavigation` and `toSignupHref`, which every such action goes through.
- `components/account/` — the account page's sections. `SpendMeter.tsx` is the monthly budget's bar, with a circle
  above it for each monthly budget cutoff, a tooltip on each circle, and the list of what each cutoff stops.
  `MonthlyBudgetCutoffTable.tsx` is the plans page's monthly budget cutoff table of every plan's cutoffs, which a test
  checks against the docs page's copy, and `monthlyBudgetCutoffCopy.ts` holds the wording both of them use.
- `components/invite/` — the invite fields, editors, and modals, shared by the topic and team pages.
- `components/topic/` — the topic page's sections, cards, dialogs, and editors, and the edit topic modal.
  `saveTopic.ts` is the modal's save flow: the create or update, the podcast switch, the attachment uploads, edits, and
  removals, then the invites and the team change, with `MISSING_FIELD_NOTES` and `showSaveError` beside it;
  `EditTopicModal.test.tsx` covers both modules.
- `components/team/` — the team page's header, gate, menu, dialogs, and buttons, and the team modal. `saveTeam.ts` is
  the team save flow the team modal and the topic modal's teams field share: `createTeam`, `createTeamForInviteLink`,
  `saveTeam`, and `TEAM_REJECTION_REASONS`, the sentence for each team rejection.
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
  `PodcastEpisodeQuestionControls.tsx` (the mic in the docked player and the podcast card that asks Carl and Vienna, and
  the docked player's stop that ends a question),
  `RemovePodcastEpisodeDialog.tsx` (the remove confirmation and the trash button that opens it),
  `PodcastEpisodePill.tsx` (the pills on findings and scan history rows), `PodcastEpisodeRow.tsx` (an episode's row in
  the episodes card and the topic roast), `PodcastEpisodeDetails.tsx` (an episode's season, title, and details line, in
  the player card and a tooltip), `PodcastEpisodePlayButton.tsx` (a podcast episode's play button, beside a topic's
  note icon and in a table's title cell), `PodcastEpisodesSection.tsx` (the episode page's Other episodes and
  Similar podcasts tables, sortable by title and description), `PodcastEpisodeTranscript.tsx` (the episode page's
  transcript), `podcastEpisodeTestFixtures.ts` (the web tests' podcast episode summary, chapter, and full
  podcast episode), `PlaybackControlButtons.tsx` (the skip and playback speed buttons, in the player card and the bottom
  player),
  `ThemeSongNote.tsx` (the note icon whose popup credits the theme song, beside the podcast's name and episode titles,
  with the lyrics from `themeSongLyrics.ts`),
  `PodcastEpisodeCover.tsx` (an episode's cover square), and `PodcastEpisodeAudio.tsx`, the one audio element and the
  podcast player that `Layout` mounts.
  `stores/podcastEpisodePlayerStore.ts` drives that element, so playback continues from one page to the next,
  `stores/podcastEpisodePlayActions.ts` plays or pauses a podcast episode or a chapter by id from a page, and
  `stores/podcastEpisodeListenStore.ts` saves a signed-in user's progress in the podcast episode.
- `components/note/` — the Tasting Notes section, table, and dialog, and the lazily imported
  BlockNote editor with its yjs SSE provider, comment threads, and the comment "@" mention menu.
  The editor chunk loads only when a note dialog opens, so it never runs on the server.
- Clients — the typed api clients live in `@carlnotes/client`, imported as `@carlnotes/client/<domain>Client`.
  `lib/webApiClient.ts` holds the app's `configureApiClient` call, with the base url, `""` in the browser and the api on
  port 3000 on the server, and `showError`, which toasts the message; `router.tsx` calls it where both the server
  render and the browser pass, and the route tests' `-loadRouter.ts` calls it the same way.
- `stores/` — the stores that reach the browser or a component library, named `<thing>Store.ts` and built the way
  `packages/core/AGENTS.md` describes, on `@carlnotes/core/stores/storeListeners`. Reach for a store only when state
  outlives a page or crosses the tree; `useState` and `providers/` cover everything else. The DOM-free stores,
  `chatRoomStore`, `noteBadgeStore`, and `topicInviteStore`, live in `@carlnotes/core/stores/`. The stores here:
  `chatPanelStore.ts` (which chat room or private chat the panel shows), `pageActionsStore.ts` (the
  search bar's page actions menu, with its lucide icons), and the podcast and spoken answer stores, which drive audio
  elements and the media session. `spokenAnswerStore.ts` drives the spoken answer audio element:
  the queue of one reply's spoken parts, keyed by its spoken answer key, the playing state the play buttons read, and
  the announcement of each queue's end that listen mode reads, with the queue's shape, its next step, and the lock
  screen's host name in `spokenAnswerQueue.ts`. It pauses the podcast episode before a host speaks, the podcast store
  stops the speaking host when the podcast episode plays, and it holds back a chat room's auto-played reply while a
  composer records. `spokenAudioCache.ts` keeps the session's spoken audio by each spoken part's voice and text within a
  size limit, and returns a spoken part's audio from the cache, from a fetch already on its way, or from the speech
  route. `streamedSpokenAnswer.ts` speaks a spoken question's reply as it streams, for the chat and the podcast player
  alike. `podcastEpisodeQuestionStore.ts` is a question asked from the podcast player: the pause and the resume, the
  recording's send and cancel, so every podcast mic slot can send, the chat turn it sends with the chapter, and the
  snapshots a chat panel showing that topic mirrors, with its phases, endings, resume rule, and chapter line label in
  `@carlnotes/core/stores/podcastEpisodeQuestionRules`, and its tests' player store spies and stubbed recording in
  `podcastEpisodeQuestionTestFixtures.ts`. `podcastEpisodeListenStore.ts` keeps whether the user is signed in and saves
  a signed-in user's progress in the loaded podcast episode, its playback start once per load, for the player store.
- `hooks/` — the React hooks that read the browser or a route, `useTopicPagePayload.ts` among them, the topic page's
  payload and its poll reload; `providers/` — context providers; `assets/` — images the bundler imports and serves
  as hashed files. The DOM-free hooks `useNow`, `useAvatar`, and `useUsernameChange` live in `@carlnotes/core/hooks/`. A
  component that reads the browser during render, `localStorage`, `window`, or `document`, reads it through
  `useBrowserValue` in `hooks/useBrowserValue.ts`, so the server and the first browser render agree. A page that starts
  from a server loader's data loads in the browser through `useLoadInBrowser` in the same file. `useLoadInBrowser` skips
  the first load while hydrating data the server already read. Code without its route's typed `useSearch` reads the
  query string as `URLSearchParams` through `useSearchParams` in `hooks/useSearchParams.ts`. `useCtaPromptToast` in
  `hooks/useCtaPromptToast.ts` toasts the prompt that a page's `cta` param names, on the signup and plans pages.
  `useIsSignedInBeforeSession` in `hooks/useIsSignedInBeforeSession.ts` says whether the page shows as signed in. The
  page load's session cookie decides until Better Auth's session request finishes, and the session decides after. An
  element that fades in as it scrolls into view takes its class from `useRevealClassName` in
  `hooks/useRevealClassName.ts`, which shows a server-rendered element before any script runs, so nothing a crawler or a
  browser without JavaScript reads starts hidden.
- `src/globals.css` — the app's stylesheet, with the keyframes in `animations.css`. It imports its `@theme inline`
  block and the `:root` and dark variables from `@carlnotes/tokens/tokens.css`.
- Imports: `@carlnotes/contracts/*`, `@carlnotes/client/*`, `@carlnotes/core/*`, and `@carlnotes/tokens/tokens.css`,
  plus types only from `@carlnotes/api`, such as `AppType` and `auth`. Never a server package (`@carlnotes/server`,
  `@carlnotes/db`, `@carlnotes/emails`, `@carlnotes/models`, `@carlnotes/pipeline`) and never another app. The
  preflight boundary check, `scripts/check-package-boundaries.ts`, fails an import outside this list.
- `.tsx` is exempt from the comment-groups hook; keep the comment style anyway.
- Dev: `bun run dev:ui` (port 5173). Build: `bun run build:ui`. Tests: `bun test apps/web`.
