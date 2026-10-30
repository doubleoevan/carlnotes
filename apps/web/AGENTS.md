# apps/web/

Web components guide mobile. Before changing shared presentation or behavior, inspect the native counterpart and follow
the reuse and parity checklist in `../mobile/AGENTS.md`. Share portable components, rules, formatting, and visibility gates
through universal packages. Record a missing native feature instead of silently omitting its controls.
`common/RatingThumbs.tsx`, `topic/TopicFindingSummary.tsx`, and `note/NotesTable.tsx` supply DOM elements to the
shared rating, Resource metadata, and Notes table components in core.

`common/ThinkingLine.tsx` supplies the CSS shimmer to core's shared `ThinkingLine` component. The phrase deck and
shuffle now live in `packages/core/lib/thinkingLines.ts`. Room message deletion uses `common/ConfirmDialog` with
core's shared confirmation wording before the existing delete operation.

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
- `pages/` — one file per route, `SearchPage.tsx` among them, the `/search` page over the site search in its url, with
  `legalMarkdownOptions.ts`, the Markdown options that the terms and privacy pages share; `components/<area>/` —
  components by domain area. `components/markupTestFixtures.ts` holds `toElementClassNames`, which returns the class
  attribute of each element with a tag name in rendered markup, for the render tests.
- `components/primitives/` is reserved for shadcn. `button.tsx` and `badge.tsx` are the web's implementations of the
  Nightshift Button and Badge contracts: each builds on its contract's box and text classes from
  `@carlnotes/nightshift/components/` and adds only the web's own classes, such as hover, focus-visible, and the aria,
  svg, and `has-` selectors, in records keyed by the contract's variant and size names. A call site imports the
  implementation, never the contract. `primitiveClasses.test.tsx` holds every variant and size to the recorded classes
  in `primitiveClassesTestFixtures.ts`. An intended style change rewrites the fixture in the same change. The shadcn
  CLI reads `apps/web/components.json`, so add a component with `bunx shadcn@latest add <name> --cwd apps/web`. The
  component it writes imports `cn` from the `cn` package and adds that package to `package.json`, which no setting
  changes. Move the import to `@carlnotes/nightshift/classNames` and remove the dependency. Biome fails an import from
  `cn` until then. Custom shared components go in `components/common/`, among them
  `IconButton.tsx`, the button whose tooltip is also its accessible name, and `FlashingCount.tsx`, a labeled count
  whose highlighted number flashes once when the count changes, and never under reduced motion.
  `ScrollBox.tsx` is the bordered box that scrolls its overflow on the highlight scrollbar with a tab stop, and with
  `copyMarkdown` set it shows a copy button on its corner. `SourceResultsChart.tsx` is the Source footnotes bar chart
  in a scan recap. It fetches nothing, and it shows a trash button on an open row only for a Source id that its caller
  names as removable.
- `components/table/` — the page tables and their cells: `TopicNameLink.tsx`, a topic's linked name with its latest
  podcast episode's play button, and `PodcastEpisodeTitleLink.tsx`, a podcast episode's linked title with its play
  button. `AdminReportsTable.tsx` is the admin console's open content reports, the one the email linked to first, each
  with Remove and Keep. `TeamMembershipRows.tsx` holds the teams table's membership and invite rows, `TeamSubtablesRow.tsx` the
  members or topics subtable a membership row opens under itself, with `useTeamSubtables`, the hook that holds which one
  is open and the team page payload that fills it, `AdminUserRows.tsx` the admin users table's row with its subtables,
  and `PagedTableSection.tsx` the titled section of a paged, sortable table that Similar topics and both episode tables
  share. `OwnerTopicsTable.tsx` opens a topic row's scan costs from `TopicScansTable.tsx` and, in the admin console, its
  subscribers from `TopicSubscribersTable.tsx`, which reads them when it opens. `UserLinks.tsx` holds the links the
  user tables share: the avatar and username to the profile, and the email and plan to the activity and account pages.
  `usePagination` in `TablePagination.tsx` wraps core's shared pagination hook with server-rendered row handling.
  `usePaginatedRowSort` adds the same server policy around core's shared sorting and page-reset hook.
  It starts a table at ten rows a page unless it asks for another size, and its
  `ScriptedTablePagination` shows a paged table's pagination only with JavaScript.
- `components/chat/` — the chat panel, both composers, the chat message lists, and the hooks behind them.
  `useChatRoom.ts` adapts core's room state, `useChatRoomSpokenAnswer.ts` speaks carl's reply to the browser's spoken
  message, and `useChatRoomLinkPreviews.ts` re-exports core's bounded preview polling. `MicButton.tsx` is the
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
  `chatRejectionCopy.ts` imports core's chat rejection sentences. It retains the voice recording toasts, the plans link, and `toastChatRejection`.
  `chatTurns.ts` re-exports core's turn helpers. `chatRoomTestFixtures.ts` and
  `chatMessagesTestFixtures.tsx` hold the chat fixtures the chat tests share.
- `lib/` — `utils.ts` and small client-side helpers that read the browser. `externalLinks.ts` opens a url in a new tab
  with no handle back to the page. `toastActions.ts` builds the See plans and See account toast actions.
  `appStoreBanner.ts` builds the App Store smart banner meta tag a page's head includes once `APP_STORE_ID` is set, with
  the page's own url as the app argument. `visiblePoll.ts` is the poll that runs only while the page is visible, one
  request at a time, used by the scan poll and the counts poll. `@carlnotes/core/lib/topicViews` sends a topic page's
  view once per topic per tab, keeping the sent topic ids in memory only. `podcastEpisodePlayback.ts` adapts core's
  playback rules and metadata to the lock screen's media session, with `isMediaSessionAvailable`, which the spoken
  answer queue shares. `voiceRecorder.ts` records the microphone, reads its level through an analyser, ends the
  recording once the user stops or the limit passes, and releases the microphone at every end, a rejected request
  included, with `@carlnotes/core/lib/voiceRecordingDecisions` for what it decides from each frame. `voiceActivity.ts`
  wraps `@ricky0123/vad-web`, the on-device voice activity detector that ends a podcast player question, loaded on the
  first question and made once per page. Its worklet, model, and WebAssembly runtime are served from
  `/assets/voice-activity-<versions>/` by `apps/web/voiceActivityAssetsPlugin.ts`, the Vite plugin that copies them out
  of the installed packages' folders into the client build and serves them in dev. `@carlnotes/core/lib/pageHead` turns
  a `PageHead`, or a fixed title and path, into the tags a route's `head()` returns. `loadOnServer.ts` runs a route
  loader's read on the server only, and its `loadPageOnServer` reads a page's head and page data together. Its
  `readWithDegradedFallback` returns a fallback for a failed read and marks the response, so the api responds 503.
  `requireSession.ts` is the sign-in guard the `_signedIn` layout runs before its pages load. `sessionCookie.ts` reads
  on the server whether the request brings a session cookie. `visitAnalytics.ts` starts the browser's analytics, reports
  a page view per route change, and captures the named visit events, their urls rewritten like every other event's.
  `renderedRows.ts` picks the rows a paged list renders: the page shown and the list's first fifty.
  `billingRedirects.ts` sends the browser to the Stripe Customer Portal at the url `@carlnotes/client/billingClient`
  returns, and the plans page opens Checkout the same way, and `inviteUrl.ts` builds an invite token's absolute url on
  the page's origin. Both read `window`. `installDeeplinks.ts` holds the Add to AI dialog's providers, their deeplinks
  and paste steps, and the remembered choice, `shareSheet.ts` opens the operating system's share sheet, and
  `staleBundleReload.ts` reloads the page once if a deploy removed a bundle file the open page still asks for.
- `components/session/` — the login and signup pages' layout and their sign-in pieces. `SessionLayout.tsx` opens the
  Google, GitHub, and Apple sign-ins and says so if one does not open. `VerifyEmailNotice.tsx` is the
  notice the signup page shows after a password signup, with a button straight into the app.
  `TermsAcceptanceDialog.tsx` renders core's `TermsAcceptanceNotice` in a dialog the layout mounts, for a signed-in
  user whose accepted Terms version is stale or whose write the api rejected for the Terms. It fails open: Not now and
  the close control put it off until the next rejected write, and a session without a version field never sees it. `signupPrompts.ts` holds
  `toSignupNavigation` and `toSignupHref`, which every action that sends a visitor to signup goes through, tagged with
  the action's cta from `@carlnotes/core/lib/signupPrompts`, whose prompt the signup page shows as a toast on arrival.
- `components/account/` — the account page's sections. `SpendMeter.tsx` is the monthly budget's bar, with a circle
  above it for each monthly budget cutoff, a tooltip on each circle, and the list of what each cutoff stops.
  `AccountFields.tsx` holds the DOM elements of core's account sections, the Blocked people rows among them, which
  `BlockedUsersSection.stories.tsx` shows in every state.
  `globals.css` scans `core/lib/spendMeter.ts` for the shared bar and legend colors. The legend uses compact row gaps
  when wrapping, matching native. Cutoffs come from the API; an admin without a budget override has none.
  `MonthlyBudgetCutoffTable.tsx` is the plans page's monthly budget cutoff table of every plan's cutoffs, which a test
  checks against the docs page's copy, and `monthlyBudgetCutoffCopy.ts` holds the wording both of them use.
- `components/invite/` — the invite fields, editors, and modals, shared by the topic and team pages.
- `components/topic/` — the topic page's sections, cards, dialogs, and editors, and the edit topic modal.
  `TopicResourceInfo.tsx` shows a Finding's details and actions in the popover opened from `TopicResource.tsx` or a Podcast Episode chapter.
  `TagsAndNewTopicRow.tsx` is the Tags picker and New Topic button row above the home feed and the search results.
  `TopicCountsLine.tsx` ends the topic page with its viewer and follower counts, empty in the server render.
  `saveTopic.ts` is the modal's save flow: the create or update, the podcast switch, the attachment uploads, edits, and
  removals, then the invites and the team change, with `MISSING_FIELD_NOTES` and `showSaveError` beside it;
  `EditTopicModal.test.tsx` covers both modules. `TopicSourceEditor.tsx` is the modal's sources field, with its source
  rows in `TopicSource.tsx` and its add a source link and Recommend button in `AddSourceButtons.tsx`.
  `TopicSource` and `TopicDefaultSource` adapt core's shared components, preserving the DOM badges, summaries, and
  tooltips. `core/lib/topicSources.ts` owns the staged summary formatter used by both editors.
- `components/team/` — the team page's header, gate, menu, dialogs, and buttons, and the team modal. `saveTeam.ts` is
  the team save flow the team modal and the topic modal's teams field share: `createTeam`, `createTeamForInviteLink`,
  `saveTeam`, and `TEAM_REJECTION_REASONS`, the sentence for each team rejection.
- `components/share/` — the share menus for a topic and a team, over the options they both use.
- `components/search/` — the header's search bar, its Filters menu, its typeahead rows, and `SearchResultsList.tsx`,
  the numbered result rows, their skeleton, and the page row that the search page and the mcp search card render.
  Every kind of match comes from one site search, `GET /api/search`, sent once typing pauses. `searchBarChoices.ts`
  holds what Enter opens, the search page the bar's text opens, and a list after a toggle, `searchFindingChanges.ts`
  shows a finding note's change on its row, `searchFilterOptions.ts` holds the Filters menu's view and kind labels and
  the kind icons the rows share, and `searchRouteSearch.ts` reads and writes a search as the `/search` route's url
  values. On `/search` the bar's input, Filters menu, and sort show and change the page's url.
- `components/layout/` — the app shell every route shares: `Layout.tsx` holds the header, search bar, page content, and
  footer. `Header.tsx` is the global header, with `UserMenu.tsx`, the signed-in user's dropdown, `HeaderMenu.tsx`, the
  mobile-only menu, and `ThemeToggle.tsx`. `HomeHero.tsx` is a visitor's home page hero below the header's top bar,
  with its pitch and persona note buttons. `Footer.tsx` is the global footer, `DocsLink.tsx` is every link to the
  docs, which opens in a new tab, and `Attribution.tsx` is the persona credit in the hero's popover.
- `components/admin/` — the admin console's own pieces beyond its tables: `MobileMinimumVersionsCard.tsx`, each
  platform's minimum app version with who saved it and the input that raises, lowers, or clears it;
  `ManageAdminsModal.tsx`, where an admin adds
  and removes other admins.
- `components/branding/` — the coffee drawings, the loading indicator, the note icon, and the avatars. `CoffeeMug.tsx`
  draws the mug from `@carlnotes/nightshift/coffeeMug`, and `coffeeMugSteam.test.ts` fails if the steam's keyframes
  and still rules in `animations.css` differ from that module's steam motion. `Avatar.tsx`
  is the one avatar that `UserAvatar` and `TeamAvatar` render: the stored image, or the owner's initials on a tinted
  circle if there is no image or it fails to load. `HostAvatar.tsx` is Carl's or Vienna's own picture.
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
  transcript), `PodcastEpisodeCountsLine.tsx` (the podcast episode page's listener count, empty in the server render),
  `PlaybackControlButtons.tsx` (the skip and playback speed buttons, in the player card and the bottom
  player),
  `PodcastThemeSongNote.tsx` (the note icon whose popup credits the theme song, beside the podcast's name and episode titles,
  with the lyrics from `podcastThemeSongLyrics.ts`),
  `PodcastEpisodeCover.tsx` (an episode's cover square), and `PodcastEpisodeAudio.tsx`, the one audio element and the
  podcast player that `Layout` mounts.
  `stores/podcastEpisodePlayerStore.ts` binds that element and browser lifecycle/voice hooks to the core player, so playback continues from one page to the next,
  `stores/podcastEpisodePlayActions.ts` plays or pauses a podcast episode or a chapter by id from a page, and
  `stores/podcastEpisodeListenStore.ts` re-exports the shared listen save interval. Core `useShownPodcastEpisode` owns selection and recording polling; the web supplies its search parameter.
- `components/note/` — the Tasting Notes section, table, and dialog, the dialog's create flow in `CreateNote.tsx`, and
  the shared core note composition adapted to `react-native-enriched-html`, whose web build is a Tiptap editor. `NoteDialog.tsx` fetches the
  note's html and version on every open, loads the comment thread through `useNoteComments` at the same time, and
  loads the editor or the reader lazily, starting the chunk as the dialog mounts, so neither chunk runs on the server:
  `NoteEditor.tsx` mounts `EnrichedTextInput` over the stored body with `NoteToolbar.tsx` (the inline marks, headings 1
  to 3, the bulleted, numbered, and checklists, the quote and code block, and the link popover, each a `ToolbarButton`,
  a Nightshift ghost `Button` lit from the editor's state, which the dialog's own controls reuse), schedules the save
  through `@carlnotes/core/hooks/useNoteBodySave`, flushes it on unmount, and shows `NoteConflictNotice.tsx` with its
  Reload button if somebody else saved since the open; `NoteViewer.tsx` renders `EnrichedText` for a read-only open.
  Both sit in `NoteLayout.tsx`, the page card with the thread of `NoteComments.tsx` beside it on a wide screen and in a
  sheet on a phone. `noteStyle.ts` holds `NOTE_HTML_STYLE`, the Nightshift note style over the theme's CSS variables,
  `NOTE_PLACEHOLDER_COLOR`, and `NOTE_BODY_CLASS`. `src/reactNativeTypes.d.ts` declares the React
  Native types the package's
  declarations import, and `tsconfig.json` maps `react-native` to it under `paths`, so React Native's global
  declarations never merge into the DOM's and no React Native code reaches the bundle.
  `patches/react-native-enriched-html@1.1.1.patch` makes the package's web editor create its Tiptap instance after
  the component mounts and lets its hooks and ref methods take a null editor until then. Tiptap destroys an editor
  made during render a millisecond later if nothing has mounted, and a cold open of the dialog lost that race.
- Clients — the typed api clients live in `@carlnotes/client`, imported as `@carlnotes/client/<domain>Client`.
  `lib/webApiClient.ts` holds the app's `configureApiClient` call, with the base url, `""` in the browser and the api on
  port 3000 on the server, and `showError`, which toasts the message; `router.tsx` calls it where both the server
  render and the browser pass, and the route tests' `-loadRouter.ts` calls it the same way.
- `mcpCards/` — the MCP Apps cards the mcp server's search, topic, and finding tools name: `main.tsx`, the entry
  `vite.mcpCards.config.ts` builds into one script and one stylesheet in `dist/mcp-cards/` as part of `build`, and
  `McpCardApp.tsx`, which connects to the host with `@modelcontextprotocol/ext-apps`, follows its theme, and renders the
  card its html names in a one-route memory router, every link opening through the host by `LinkOpenerContext` in
  `AnchorLink`. `SearchCard.tsx`, `TopicCard.tsx`, and `FindingsCard.tsx` render the site's own components,
  `CardSubscribeButton.tsx` and `CardPodcastPlayer.tsx` beside them. `cardHost.ts` holds the connected app, the card
  data a tool result includes in `_meta`, and the tool calls the cards make, and `cardFindingHandlers.ts` the finding
  note's handlers the search and findings cards share, each a tool call. The card build aliases
  `@carlnotes/client/authClient` to `cardAuthClient.ts`, whose session is the tool result's caller, and
  `@/lib/visitAnalytics` to `cardVisitAnalytics.ts`, which reports nothing, and `cardFetch.ts` returns a podcast episode
  read from the tool result and fails every other request, so a card reaches the api only through a tool call.
- `stores/` — the stores that reach the browser or a component library, named `<thing>Store.ts` and built the way
  `packages/core/AGENTS.md` describes, on `@carlnotes/core/stores/storeListeners`. Reach for a store only when state
  outlives a page or crosses the tree; `useState` and `providers/` cover everything else. The DOM-free stores,
  `chatRoomStore`, `noteBadgeStore`, and `topicInviteStore`, live in `@carlnotes/core/stores/`. The stores here:
  `chatPanelStore.ts` (which chat room or private chat the panel shows), `pageActionsStore.ts` (the search bar's page
  actions menu, with its lucide icons), `searchBarStore.ts` (the search page the bar's text opens, which the header's
  logo links to from any other page, and the event the logo sends to empty the bar from the search page), and the
  podcast and spoken answer stores, which drive audio elements and the media session. `spokenAnswerStore.ts` drives
  the spoken answer audio element: the queue of one reply's spoken parts, keyed by its spoken answer key, the playing
  state the play buttons read, and the announcement of each queue's end that listen mode reads, with the queue's
  shape, its next step, and the lock screen's host name in `spokenAnswerQueue.ts`. It pauses the podcast episode
  before a host speaks, the podcast store stops the speaking host when the podcast episode plays, and it holds back a
  chat room's auto-played reply while a composer records. `spokenAudioCache.ts` keeps the session's spoken audio by
  each spoken part's voice and text within a size limit, and returns a spoken part's audio from the cache, from a
  fetch already on its way, or from the speech route. `streamedSpokenAnswer.ts` speaks a spoken question's reply as it
  streams, for the chat and the podcast player alike. `podcastEpisodeQuestionStore.ts` is a question asked from the
  podcast player: the pause and the resume, the recording's send and cancel, so every podcast mic slot can send, the
  chat turn it sends with the chapter, and the snapshots a chat panel showing that topic mirrors, with its phases,
  endings, resume rule, and chapter line label in `@carlnotes/core/stores/podcastEpisodeQuestionRules`, and its tests'
  player store spies and stubbed recording in `podcastEpisodeQuestionTestFixtures.ts`. `podcastEpisodeListenStore.ts`
  keeps whether the user is signed in and saves a signed-in user's progress in the loaded podcast episode, its
  playback start once per load, for the player store.
- `hooks/` — the React hooks that read the browser or a route, `useTopicPagePayload.ts` among them, the topic page's
  payload and its poll reload, and `useScanNote.ts`, a scan's note behind its recap popover, read once the trigger is
  pointed at, focused, touched, or opened, and kept once the scan has finished; `providers/` — context providers;
  `assets/` — images the bundler imports and serves as hashed files. The DOM-free hooks `useNow`, `useAvatar`,
  `useUsernameChange`, `useNoteBodySave`, and `useNoteComments` live in `@carlnotes/core/hooks/`. A component that
  reads the browser during render, `localStorage`, `window`, or `document`, reads it through `useBrowserValue` in
  `hooks/useBrowserValue.ts`, so the server and the first browser render agree. A page that starts from a server
  loader's data loads in the browser through `useLoadInBrowser` in the same file. `useLoadInBrowser` skips the first
  load while hydrating data the server already read. Code without its route's typed `useSearch` reads the query string
  as `URLSearchParams` through `useSearchParams` in `hooks/useSearchParams.ts`. `useCtaPromptToast` in
  `hooks/useCtaPromptToast.ts` toasts the prompt that a page's `cta` param names, on the signup and plans pages.
  `useIsSignedInBeforeSession` in `hooks/useIsSignedInBeforeSession.ts` says whether the page shows as signed in. The
  page load's session cookie decides
  until Better Auth's session request finishes, and the session decides after. An element that fades in as it scrolls
  into view takes its class from `useRevealClassName` in `hooks/useRevealClassName.ts`, which shows a server-rendered
  element before any script runs, so nothing a crawler or a browser without JavaScript reads starts hidden. A box that
  scrolls takes its tab stop from `useScrollRegionTabStop` in `hooks/useScrollRegionTabStop.ts`, which returns
  `{ ref, tabIndex }` for the box, with a tab stop while its content overflows, so a keyboard can scroll text with no
  link in it. The box draws its focus ring with `SCROLL_REGION_FOCUS_CLASS`. The counts lines read their counts
  through `@carlnotes/core/hooks/usePolledCounts`, once the page has mounted and then every minute while it is focused.
- `src/globals.css` — the app's stylesheet, with the keyframes in `animations.css` and the `scrollbar-none` utility
  the note toolbar scrolls sideways with. It imports its `@theme inline` block, the `shadow-raised` utility, and the
  `:root` and dark variables from `@carlnotes/nightshift/tokens.css`, which is written from the Nightshift TypeScript
  source, has Tailwind read the contracts in `packages/nightshift/components/` and `field.ts`, and keeps Tailwind from
  scanning stories, so a story never adds a class to the app's css. It defines `sentence-link`, the class of a link
  inside a sentence: the link color with `faint-underline`, an underline at rest that turns solid on hover. A link in
  its own color inside a sentence, as the hero's is, takes `faint-underline` alone. A link that stands alone, such as a
  table cell, a footer link, or a link alone in its line, takes `STANDALONE_LINK_CLASS` from `lib/styleClasses.ts`, the
  link color underlined on hover.
- The Nightshift component browser, Storybook on `@storybook/tanstack-react`, a dev dependency. `.storybook/main.ts`
  aliases `@carlnotes/client/authClient` to `.storybook/mocks/authClient.ts`, resolves `@tanstack/react-router` to
  `.storybook/mocks/reactRouter.tsx`, the framework's router mock with a `Link` that keeps the caller's ref and
  `onClick`, so a tooltip on a link finds its anchor and a link's click runs, sets the CarlNotes icon as the favicon,
  links the Nightshift fonts, names the tab Nightshift in place of Storybook, and turns the onboarding checklists and
  what's new notices off. `.storybook/manager.ts` brands the frame: Carl's avatar and the name Nightshift, linked to
  carlnotes.com, with the sidebar and toolbar in the Dark roast palette and Karla, every value read from
  `@carlnotes/nightshift`. `.storybook/preview.tsx` loads `globals.css` and adds the light and dark toggle. The toggle
  puts the `dark` class on the html element before a story renders, as the app's head script does, and remounts the
  story when the theme changes. Every docs page, MDX or component, shows the toolbar's theme on the app's page fill,
  and a story in its own frame on a docs page takes that page's theme from its `dark` class. The preview checks every
  story against the WCAG 2 A and AA rules at error level, mocks every other `@carlnotes/client` module, mounts the toast
  host, adds the `scripted` class as the app's head script does, and rejects any `/api` fetch on its own origin through
  `toGuardedFetch` in `src/nightshift/guardedFetch.ts`. A story's parameters name who it renders for (`session`:
  `visitor`, `user`, or `admin`, from `.storybook/fixtures.ts`), put it on the card fill when the app shows the
  component on a card, a table, a popover, or a dialog (`surface: "card"`), put a header control on the header's hero
  band (`surface: "hero"`), show the page without JavaScript (`hasJavaScript: false`), or leave the toast host out
  (`hasToaster: false`). `.storybook/viewports.ts` adds the 375-pixel `phone` viewport beside Storybook's own sizes, and
  a story opens on it through `PHONE_VIEWPORT_GLOBALS`. The helpers the stories share sit beside the preview.
  `parameters.ts` has `toOwnFrameDocs`, which gives each story its own frame on the docs page, for a component whose
  open panel floats over the page. `tableDecorators.tsx` has `StoryTable` and `toTableBodyDecorator`, which render table
  rows in the card, scroll box, and table that the app's tables use, with a card class such as
  `ONE_PAGE_TABLE_CARD_CLASS`. `useSyncedArg.ts` is the hook a controlled component's story uses to report a change and
  keep its control in step. `useToolbarTheme.ts` is the hook a theme control's story uses to read the toolbar's theme
  and switch it. `play.ts` has `findVisibleByRole`, which waits for a popover, menu, or dialog to fade in,
  `showMouseFocus`, which focuses the dialog's focused element again with no focus ring, as a mouse click leaves it, and
  `StoryPlayContext`, the type of a play function's context. A story that turns an axe rule off does it in its own
  `a11y.config`, with a comment saying why. A story sits beside its component as `<Component>.stories.tsx`; every
  component file in `components/primitives`, `common`, `table`, and `layout` has one, which `components/stories.test.ts`
  checks. A story gets its data from mocked clients and invented fixtures, never from a change to the component. The
  shared fixtures are in `.storybook/fixtures.ts`, with the date, the sessions, and the people, and in one file per
  domain under `.storybook/fixtures/`: topics, a visitor's and a user's topic feeds, podcast episodes, teams, admin
  users, and waiting updates. A story imports them from there, never from another story. `src/nightshift/` holds the
  Tokens, Typography, and Inventory pages, the swatch and specimen components they render, `ScrollingTable.tsx`, which
  renders their tables in the app's table classes with the first column fixed, and the pattern stories, each composed
  from `lib/styleClasses.ts` where a shared class exists, the section label from `SECTION_LABEL_CLASS`, which
  `lib/styleClasses.test.ts` checks against the sectionLabel type role in `@carlnotes/nightshift/typography`, as it
  checks `LOGO_CLASS`, the name beside the mug in the logo, against the logo role.
  `src/nightshift/` also holds the fetch guard and the in-memory storage the preview installs, outside `.storybook/` so
  that `bun test` finds their tests. `bun run dev:storybook` serves the component browser on port 6006 with Storybook's
  MCP server at `http://localhost:6006/mcp`, registered in `.mcp.json` and `opencode.json`: search its catalog before
  writing a component, and reuse what is there. `bun run build:storybook` writes the component browser to
  `dist/nightshift/`, which the api serves at `/nightshift`.
- Imports: `@carlnotes/contracts/*`, `@carlnotes/client/*`, `@carlnotes/core/*`, `@carlnotes/nightshift/tokens.css`,
  `@carlnotes/nightshift/classNames`, the `cn` class merge, the coffee mug and the sign-in providers' icons both apps
  draw, `@carlnotes/nightshift/coffeeMug` and `@carlnotes/nightshift/oauthProviderIcons`, the note's style,
  `@carlnotes/nightshift/noteHtmlStyle` and `toColorCssVariable` from `@carlnotes/nightshift/theme`, plus types only
  from `@carlnotes/api`, such as `AppType` and `auth`. A Nightshift component contract reaches the app only through its
  implementation in `components/primitives/`. A test, a story, `.storybook/`, and `src/nightshift/` may read the rest of
  `@carlnotes/nightshift`'s TypeScript, so the browser bundle includes no palette module. Only a story,
  `.storybook/`, and `src/nightshift/` may import a story or Storybook. Never a server package (`@carlnotes/server`,
  `@carlnotes/db`, `@carlnotes/emails`, `@carlnotes/models`, `@carlnotes/pipeline`) and never another app. The
  preflight boundary check, `scripts/check-package-boundaries.ts`, fails an import outside this list.
- `.tsx` is exempt from the comment-groups hook; keep the comment style anyway.
- Dev: `bun run dev:ui` (port 5173), `bun run dev:storybook` (port 6006). Build: `bun run build:ui`, which builds the
  mcp cards too, and `bun run build:storybook`. Tests: `bun test apps/web`.

## Shared Feed adapter

The Brew diary's `TopicScanRecap` and `SourceResultsChart` use shared React components in `packages/core/components/`,
along with table and section pagination, numbered Findings, safe note links, scan failures, expansion controls,
and copy feedback. Web wrappers retain DOM semantics, styles, tooltips, SSR handling, and browser APIs. Edit the
shared composition first; keep component adapters at module scope so rerenders preserve their identity.
`Pagination` uses render callbacks to retain its clicked DOM node while restoring scroll position after a page change.
Pure ordering, totals, detail copy, and Markdown construction remain in core's `lib/topicScanRecap.ts` and `sourceResults.ts`.

`providers/TopicFeedProvider.tsx` supplies the session id, visitor loader data, context, pathname reset, and Feed availability.
State, selection, reheat, and Finding actions live in `@carlnotes/core/hooks/useTopicFeedState` and `useTopicFindingActions`.
The provider preserves its consumer exports and the web's default non-optimistic timing. Topic pages keep their page reload handlers.
Matching section, sort, view, empty-state, and tutorial labels come from core.
`lib/hookTestHarness.tsx` mounts live React hooks and optional rendered state with Happy DOM and TanStack Query, then restores its globals.
`hooks/useTopicFeedState.test.tsx` verifies shared lifecycle and mutation behavior without importing native components.
`components/common/sharedComponents.test.tsx` verifies size/sort resets, control identity and focus, pagination scroll
restoration, and Source detail expansion through the real web adapters.

## Shared Tasting Note adapters

`components/note/` keeps the browser-only enriched HTML imports and DOM controls. Core owns editor initialization,
format order, captured link ranges, conflict Reload, creation validation, comments, and unread badge content.
Keep `NoteDialog` lazy imports: listing notes must fetch neither bodies nor editor chunks.
`NoteLayout` preserves the toolbar above the card and the desktop column / phone-browser comment sheet.
`providers/TopicFeedProvider` mounts `useNoteBadges`; badge polling does not depend on opening chat.
`TopicScanRecap` renders the shared safe Markdown tree directly. `SafeNoteLink` remains its final destination guard.

## Shared mobile page foundations

The Account budget/settings, plan cards, invite fields, and TeamFields delegate portable composition to core.
OwnerTopicsTable, TopicsTable, TopicScansTable, TopicSubscriptionsTable, and SentInvitesTable consume shared domain
columns through `table/DataTable.tsx`'s semantic DOM elements. Team membership/member rows retain web-specific
expandable controls. The global Footer is a core composition with web routing and active-link styling supplied here.

Topic fields, Source editing, Team choices, and Topic/Team saving now use core hooks and save functions. Web wrappers
supply browser files, routing, and toast feedback. Retries keep created identities and accepted membership writes;
unsent invitation chips remain visible. Maintain native adapters when changing any of these shared concerns.

`topic/TopicSkeleton` delegates section order to core while preserving DOM placeholders and the desktop grid.
Its exported section/player skeletons still serve PodcastEpisodePage. Stories cover unknown and known titles.

`layout/PageSkeleton` renders core's Profile, Teams, Activity, Account, and Team loading layouts. The page keeps known
headings and actions visible; Profile and Team reserve their identity while it loads. Account keeps Settings usable.
Its stories cover each page and the Profile topics table loading separately. Motion respects reduced motion.

The menu parity adapters `search/PageActionMenu`, `layout/UserMenu`, and `common/AddToAiDialog` render the shared
core menu composition. DOM popovers, badges, installation links, storage, and clipboard remain web adapters.
`AccountPage` uses core's `useAccount`, shared with mobile, for complete budget loading and retries. Teams and own
Profile topic reads offer retry after a failed initial request instead of presenting an empty table or endless skeleton.

Visit analytics reuses the contracts URL/path privacy redaction and public Topic attribution with native. Its registered device dimensions and environment match native event dimensions while preserving cookieless visits and disabled person profiles.

## Shared chat

`ScrollDownButton` adapts core's centered latest-message action and retains the browser's hover feedback.
`ChatPanelWidget` renders core's shared `ChatPill` with browser elements, preserving its portal, badge, hover, and
podcast-player clearance. `branding/CoffeeCup` reads the same Nightshift vector paths as mobile.

`components/chat/ChatAuthor`, `ChatTurnBlock`, `ChatRoomMessageBubble`, and `TopicDraftCard` are DOM element adapters
for the same-named core components. The turn's rejection uses core `ChatRejectionNotice`; web retains its plans link.
`ChatMarkdown` retains Streamdown and re-exports `safeChatMarkdown` helpers. Host portraits come from Nightshift's
shared `assets/`, also used by mobile.

`useTopicChat` injects voice, new-topic, attachment, and podcast effects into the core hook. `useChatRoom` injects
browser streaming and spoken-answer effects. `useChatRoomStream` supplies browser EventSource to the shared lifecycle
controller. `useChatConversationLoad`, `useEditableTopicDraft`, `useRoomReply`, both preview hooks, `chatHistoryTurns`,
and `topicToolCalls` retain compatible imports over core. Member loading is core `useRoomMembers`; mention and reply
rules are core `chatMentions`/`chatRoomReplies`. Keep these wrappers thin. `chatPanelStore` retains panel dimensions,
open state, and browser effects while core `chatConversationStore` owns account/conversation selection and proposals.


Coffee Break player/card/details/pills/controls, chapter list, episode row, season card, chat chapter tag, mini player, transcript, theme-song
credits, feed dialog, unpublished card, and removal confirmation compose the corresponding core components.
The web files retain DOM markup, responsive/SSR behavior, popovers, tooltips, the audio element, Media Session,
clipboard, and spoken-question adapters. `PodcastEpisodeSeekBar.tsx` adapts shared segments to browser pointer and
keyboard input. `UnpublishedPodcastEpisodeCard.tsx` retains browser shimmer and cover styling over shared content.
`usePodcastFeed` and `usePodcastEpisodeChapterRating` live in core; reset-private-feed now confirms before sending,
while failure retains the old link and denial clears it. Stories use shared fictional episode/transcript fixtures.
Existing playback and spoken-question regression assertions remain the compatibility gate.
`PodcastEpisodesCard` keeps server-loaded seasons and no-JavaScript rows around the shared card. Its season links use
`AnchorLink` with replace-history and retained-scroll options. Both episode tables use core's column/total definitions;
web retains its server-rendered table, while mobile uses its existing fixed-first-column table.
