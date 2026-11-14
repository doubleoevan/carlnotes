# apps/web/

`mcpViews/TopicSuggestionsMcpView.tsx` renders every editable Topic in five-row cursor pages, checkboxes, a live
selected list using `TagPill`, results-only loading, and explicit multi-Topic sending. `TopicSuggestionsSearch.tsx`
reuses site autocomplete rows; `useTopicAutocomplete.ts` debounces name-only host calls. Both footer actions use the
standard Button size and padding: outlined Send first, highlighted new-Topic second. `useTopicSuggestionsMcpView.ts`
retains selections and retry IDs and opens the existing confirmed Topic Draft flow through `callMcpViewTool`. Its
interactive stories use synthetic host results. The MCP host iframe is web-only.


`components/account/AiAgentAccountSection.tsx` adapts shared connection and key controls.
`components/topic/TopicPersonalSourcesSection.tsx` shows saved items in Topic info and Artisanal Blend. Edit Topic has no Personal sources setup section. `TopicPersonalSources.tsx` remains a standalone Nightshift preview. `personalSourcesElements.tsx` supplies
the production adapters and their stories. `PersonalSourcesImportButton` opens `PersonalSourcesImportDialog`; `hooks/usePersonalSourcesImport.ts`
owns worker cancellation, buffer release, and stable selected-batch retries. `lib/personalSourcesImportSelection.ts` builds
uploads from selected conversations only. The import tests cover cancellation and unselected-text exclusion.

`lib/personalSourcesExport.worker.ts` parses selected ChatGPT/Claude exports and pasted text locally.
`personalSourcesExport.ts` recognizes visible conversation records. `personalSourcesExportArchive.ts` uses zip.js with path, count,
ratio, and declared/actual expansion limits. Attachments are never extracted. The import dialog terminates its worker.

`mcpViews/TopicMcpView.tsx` also renders `send_to_topic` confirmations, choices, and refusals. Send states are
display-only, use the shared text fallback, open Topic links through the host, and never resend a request or fetch
private entries.

Web components guide mobile. Before changing shared presentation or behavior, inspect the native counterpart and follow
the reuse and parity checklist in `../mobile/AGENTS.md`. Share portable components, rules, formatting, and visibility gates
through universal packages. Record a missing native feature instead of silently omitting its controls.
`common/RatingThumbs.tsx`, `topic/TopicFindingSummary.tsx`, and `note/NotesTable.tsx` supply DOM elements to the
shared rating, Resource metadata, and Notes table components in core.

`common/ThinkingLine.tsx` supplies the CSS shimmer to core's shared `ThinkingLine` component. The phrase deck and
shuffle now live in `packages/core/lib/thinkingLines.ts`. Room message deletion uses `common/ConfirmDialog` with
core's shared confirmation wording before the existing delete operation.

`ThinkingLine` consumes core's `ThinkingLineProps` through a direct `Pick`; its `ThinkingText` adapter stays at module
scope. `common/LinkPreviewCard.tsx` owns the link/video card and its private host formatter. Its compact loading note
lives in `common/LinkPreviewLoading.tsx`, with a story beside it; the existing LinkPreviewCard loading story remains.
Import `hasPreviewableLink` directly from core's `lib/chatLinkPreviews`. These components and `IconButton` are the web
examples enforced by `bun run check:components`; unrelated feature modules remain in the report-only inventory.

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
  `cn` until then, and an import from `clsx` or `tailwind-merge` anywhere outside `classNames.ts`. Custom shared
  components go in `components/common/`, among them
  `BrandLink.tsx`, the mug and name the header and the MCP view shell share, `BackButton.tsx`, the back control of the
  MCP view shell and the suggestions MCP view,
  `IconButton.tsx`, the button whose tooltip is also its accessible name, and `FlashingCount.tsx`, a labeled count
  whose highlighted number flashes once when the count changes, and never under reduced motion.
  `ScrollBox.tsx` is the bordered box that scrolls its overflow on the highlight scrollbar with a tab stop, and with
  `copyMarkdown` set it shows a copy button on its corner. `SourceResultsChart.tsx` is the Source footnotes bar chart
  in a scan recap. It fetches nothing, and it shows a trash button on an open row only for a Source id that its caller
  names as removable.
- `components/table/` — the page tables and their cells: `TopicNameLink.tsx`, a topic's linked name with its latest
  podcast episode's play button, and `PodcastEpisodeTitleLink.tsx`, a podcast episode's linked title with its play
  button. `AdminReportsTable.tsx` is the admin console's open content reports, the one the email linked to first, each
  with its reported avatar or images and Remove, Block, and Clear. Remove reads Reset avatar on a published avatar
  and Regenerate on a reported image or podcast episode. `TopicsTable.tsx`, `OwnerTopicsTable.tsx`,
  `TeamMembersTable.tsx`, `TeamsMembershipTable.tsx`,
  `TopicSubscriptionsTable.tsx`, `TopicInvitesTable.tsx`, and `SentInvitesTable.tsx` adapt their core tables, and
  `TableConfirmDialog.tsx` is their delete confirmation, its target linked or in bold, and `TooltipSwitch.tsx` and
  `TooltipRemoveButton.tsx` are their row switch and ghost X button, each with a tooltip that names its action.
  `TeamSubtables.tsx` holds the members or topics subtable a membership row opens under itself, on the sunken card, and
  `loadTeamSubtablesPage`, the team page read that fills it, `AdminUserRows.tsx` the admin users table's row with its
  subtables, and `PagedTableSection.tsx` the titled section of a paged, sortable table that Similar topics and both
  episode tables share. `OwnerTopicsTable.tsx` opens a topic row's scan costs from `TopicScansTable.tsx` and, in the
  admin console, its subscribers from `TopicSubscribersTable.tsx`, which reads them when it opens. `UserLinks.tsx` holds
  the links the user tables share: the avatar and username to the profile, and the email and plan to the activity and
  account pages. `usePagination` in `TablePagination.tsx` wraps core's shared pagination hook with server-rendered row
  handling. `usePaginatedRowSort` adds the same server policy around core's shared sorting and page-reset hook. It
  starts a table at ten rows a page unless it asks for another size, and its `ScriptedTablePagination` shows a paged
  table's pagination only with JavaScript.
- `components/chat/` — the chat panel, both composers, the chat message lists, and the hooks behind them.
  `useChatRoom.ts` adapts core's room state with the browser stream and toasts. `ChatRoomMessages.tsx` lists a team
  room's messages through core's `ChatRoomMessageList`. `MicButton.tsx` is the
  mic in an empty composer's send slot, `RecordingBar.tsx` the bar that replaces the box while a recording runs, and
  `useVoiceRecording.ts` wraps core's recording state machine with the browser's recorder adapter, which loads
  `lib/voiceRecorder.ts` on the first tap and opens an audio context for each composer's listen session and one for
  the page's podcast questions. A podcast player question records through `useVoiceRecording.ts` too, with no listen
  mode, ending on the voice activity detector. `sharedVoiceHooks.test.tsx` tests core's recording and listen mode
  hooks over a fake recorder. `PodcastEpisodeChapterTag.tsx` is the tag under a question asked from the podcast
  player, which plays that chapter. `SpokenAnswerButton.tsx` is the play button beside the copy button in a host's
  reply footer, and `SpokenAnswerAudio.tsx` the audio element that the hosts' spoken answers play through, which
  `Layout` mounts beside the podcast's, and which registers the voice notices as toasts. Only a question asked from
  the podcast player gets a `cohost` answer. Past the spoken questions cutoff, a mic opens the plans page, or toasts for
  a user on premium, through `useSpokenQuestionsPausedAction` in `spokenQuestionsPaused.ts`. `chatTurns.ts` re-exports
  core's turn helpers. `chatRoomTestFixtures.ts` and `chatMessagesTestFixtures.tsx` hold the chat fixtures the chat
  tests share.
- `lib/` — `utils.ts` and small client-side helpers that read the browser. `externalLinks.ts` opens a url in a new tab
  with no handle back to the page. `toastActions.ts` builds the See plans and See account toast actions.
  `appStoreBanner.ts` builds the App Store smart banner meta tag a page's head includes once `APP_STORE_ID` is set, with
  the page's own url as the app argument. `visiblePoll.ts` is the poll that runs only while the page is visible, one
  request at a time, used by the scan poll and the counts poll. `@carlnotes/core/lib/pageViews` sends a topic, profile,
  or team page's view once per page per tab, keeping the sent pages in memory only. `podcastEpisodePlayback.ts` adapts core's
  playback rules and metadata to the lock screen's media session, with `isMediaSessionAvailable`, which
  `stores/spokenAnswerStore.ts` uses. `voiceRecorder.ts` records the microphone, reads its level through an analyser,
  ends the recording once the user stops or the limit passes, and releases the microphone at every end, a rejected
  request included, with `@carlnotes/core/lib/voiceRecordingDecisions` for what it decides from each frame.
  `voiceActivity.ts` wraps `@ricky0123/vad-web`, the on-device voice activity detector that ends a podcast player
  question, loaded on the first question and made once per page. Its worklet, model, and WebAssembly runtime are served
  from `/assets/voice-activity-<versions>/` by `apps/web/voiceActivityAssetsPlugin.ts`, the Vite plugin that copies them
  out of the installed packages' folders into the client build and serves them in dev. `@carlnotes/core/lib/pageHead`
  turns a `PageHead`, or a fixed title and path, into the tags a route's `head()` returns. `loadOnServer.ts` runs a
  route loader's read on the server only, and its `loadPageOnServer` reads a page's head and page data together. Its
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
  `styleClasses.ts` holds the tailwind class strings pages share. The data tables' classes are in `tableClasses.ts`,
  the chat panel's in `chatClasses.ts`, and the page headers', a topic header's and the avatar header's, in
  `pageHeaderClasses.ts`. `tableActionLabel.tsx` builds a table row control's tooltip and accessible name.
- `components/session/` — the login and signup pages' layout and their sign-in pieces. `SessionLayout.tsx` opens the
  Google, GitHub, and Apple sign-ins and says so if one does not open. `VerifyEmailNotice.tsx` is the
  notice the signup page shows after a password signup, with a button straight into the app.
  `TermsAcceptanceDialog.tsx` renders core's `TermsAcceptanceNotice` in a dialog the layout mounts, for a signed-in
  user whose accepted Terms version is stale or whose write the api rejected for the Terms. It fails open: Not now and
  the close control put it off until the next rejected write, and a session without a version field never sees it. `signupPrompts.ts` holds
  `toSignupNavigation` and `toSignupHref`, which every action that sends a visitor to signup goes through, tagged with
  the action's cta from `@carlnotes/core/lib/signupPrompts`, whose prompt the signup page shows as a toast on arrival.
- `components/account/` — the account page's sections, which `pages/AccountPage.tsx` places in expandable Budget and
  Settings sections through `AccordionSection`'s optional icon. `SpendMeter.tsx` adapts core's `SpendMeter`, the monthly
  budget's bar, with a circle above it for each monthly budget cutoff, a tooltip on each circle, and the list of what
  each cutoff stops, drawn with `components/common/MeterBar.tsx`, `MeterMarker.tsx`, and `MeterCutoffList.tsx`, which
  the admin console's `FreePlanSpendMeter.tsx` draws its spend meter with too. The admin console's reset clock and count
  rings and the account budget's rings are `components/common/MeterRing.tsx`, which adapts core's `MeterRing`.
  `AccountFields.tsx` holds the DOM elements of core's account sections, the Blocked people rows among them, which
  `UserBlocksSection.stories.tsx` shows in every state. `globals.css` scans `core/lib/spendMeter.ts` for the shared bar
  and legend colors. The legend uses compact row gaps when wrapping, matching native. Cutoffs come from the API; an
  admin without a budget override has none. `MonthlyBudgetCutoffTable.tsx` is the plans page's monthly budget cutoff
  table of every plan's cutoffs, which a test checks against the docs page's copy, both worded by core's
  `monthlyBudgetCutoffCopy`. `ProfileSections.tsx` adapts core's `ProfileSections` in the profile's own accordion, with
  the own topics' loading states.
- `components/invite/` — the invite fields, editors, and modals, shared by the topic and team pages.
- `components/topic/` — the topic page's sections, cards, dialogs, and editors, and the edit topic modal.
  `RelatedTopicsSection.tsx` adapts core's `RelatedTopicsSection`, the page's similar topics.
  `TopicFindingControls.tsx` and `TopicFindingDetails.tsx` hold a Finding's controls and its expanded note, which the
  note popover and the MCP view tables share. `TopicNotePopover.tsx` adapts core's `TopicNotePopover`, a Topic's note
  under its note icon on a search row and a news row.
  `TopicResourceInfo.tsx` shows a Finding's details and actions in the popover opened from `TopicResource.tsx` or a Podcast Episode chapter.
  `TagsAndNewTopicRow.tsx` is the Tags picker and New Topic button row above the home feed and the search results.
  `TopicCountsLine.tsx` ends the topic page with its viewer and follower counts, empty in the server render.
  `components/common/DetailsLine.tsx` adapts core's details line, which `TopicPageHeader.tsx` draws under the byline
  and reactions with the counts of the page's sections, the Topic Post page under its byline's row, the profile's
  summary line and the team header as their counts, and the Topic Post popup under its Topic's name.
  `components/common/DotSeparatedTexts.tsx` adapts core's row details texts, which the news, search, and finding rows
  draw on their details lines.
  `saveTopic.ts` is the modal's save flow: the create or update, the podcast switch, the attachment uploads, edits, and
  removals, then the invites and the team change, with `MISSING_FIELD_NOTES` and `showSaveError` beside it;
  `EditTopicModal.test.tsx` covers both modules. `TopicSourceEditor.tsx` is the modal's sources field, with its source
  rows in `TopicSource.tsx` and its add a source link and Recommend button in `AddSourceButtons.tsx`.
  `TopicSource` and `TopicDefaultSource` adapt core's shared components, preserving the DOM badges, summaries, and
  tooltips. `core/lib/topicSources.ts` owns the staged summary formatter used by both editors.
- `components/team/` — the team page's header, gate, menu, dialogs, and buttons, and the team modal. `TeamHeader.tsx`
  adapts core's `TeamHeader` under the page's button row, and `TeamSections.tsx` adapts core's `TeamSections` inside
  the page's accordion, with the members table, the topics table and a leader's remove, and the notes section.
- `components/activity/` — `ActivitySections.tsx`, the Activity page's sections over core's `ActivitySections`, with
  the subscriptions and sent invites tables. `saveTeam.ts` is
  the team save flow the team modal and the topic modal's teams field share: `createTeam`, `createTeamForInviteLink`,
  `saveTeam`, and `TEAM_REJECTION_REASONS`, the sentence for each team rejection.
- `components/share/` — the share menus for a topic and a team, over the options they both use. `ShareTopic` takes
  a `topicPost` to share a Topic Post in its topic's place. `ShareDashboard.tsx` shares a Dashboard page and
  `ShareTeam.tsx` a team, both through the option list in `PageShareDialog.tsx`, and `usePageShare.ts` holds the page's
  title and url, the copy, the device's share sheet that falls back to the copy, and each option's report by its
  channel.
- `components/dashboard/` — the Dashboard pages' pieces. `DashboardHeader.tsx` is the header the page and the MCP view
  share, with core's `DashboardSubjectHeader` and `AvatarHeaderSkeleton` through `common/avatarHeaderElements.tsx`,
  the profile page's floated-avatar layout, which the Teams, Activity, and Account pages' `AvatarHeader` shares. `dashboardPageIcons.ts` holds each page's icon. `dashboardElements.tsx` adapts core's `Dashboard` with the
  Activity page's accordion, table cards, and each title row's select and radio buttons, and
  `webDashboardChartRenderers.tsx` holds the page's renderers, loaded with `import()` after hydration.
  `DashboardBarChart.tsx` and `DashboardPieChart.tsx` draw the bar chart and the pie through `EChart.tsx`, one ECharts
  chart on the svg renderer in the Nightshift chart theme, and `chartTooltipHtml.ts` builds their hover tooltips' html.
  `DashboardTrendChart.tsx` draws the trend with its day tooltip and the day it pins on a click,
  `DashboardWordCloud.tsx` draws the shared spiral layout in svg, and `PlaceMap.tsx` draws Google Maps with Advanced
  Markers on the site's Map ID, or `OutlineMap.tsx`, an ECharts world outline, with no key or Map ID. `PlaceMap.tsx`
  loads its map once the box scrolls into view and loads `OutlineMap.tsx` lazily. `pointDetailElements.tsx` draws a
  point's detail on Google's info window, the outline map's open place, and the trend's pinned day, and
  `PointDetailPanel.tsx` is the panel over the trend and the outline map. `TitleTooltip.tsx` shows a cut-off title in
  full in a tooltip on the pinned trend day and the open place, and `PlacedTitleTooltip.tsx` shows a bar label's full
  title at its place over the chart. `pages/DashboardPage.tsx` renders all three Dashboard pages, and
  `lib/dashboardRoute.ts` is what their routes load on the server: the head and the public read of the default
  selection. The routes are `profiles.$userId_.specials.topics.tsx`, `profiles.$userId_.specials.podcasts.tsx`, and
  `teams.$teamId_.specials.tsx`, with `_signedIn/teams.specials.tsx`, which opens the user's first team's in
  alphabetical order.
- `components/search/` — the header's search bar, its Filters menu, its typeahead rows, and `SearchResultsList.tsx`,
  the numbered result rows, their skeleton, and the page row that the search page and the search MCP view render, over
  the row pieces in `SearchRowParts.tsx`. A Topic Post's row shows its image, its title, and `Post · age · Topic`, and
  `toSearchRowTitleAside` in `SearchResultsList.tsx` returns the control beside each kind's title.
  Every kind of match comes from one site search, `GET /api/search`, sent once typing pauses. `searchBarChoices.ts`
  holds what Enter opens, the search page the bar's text opens, and a list after a toggle, `searchFindingChanges.ts`
  shows a finding note's change on its row, `searchFilterOptions.ts` holds the Filters menu's view and kind labels and
  the kind icons the rows share, and `searchRouteSearch.ts` reads and writes a search as the `/search` route's url
  values. On `/search` the bar's input, Filters menu, and sort show and change the page's url.
- `components/layout/` — the app shell every route shares: `Layout.tsx` holds the header, search bar, page content, and
  footer. `Header.tsx` is the global header, with `UserMenu.tsx`, the signed-in user's dropdown, `HeaderMenu.tsx`, the
  mobile-only menu, and `ThemeToggle.tsx`. The menu opens by script, so its button shows on a narrow screen only under
  the `scripted` class, and without JavaScript the header keeps its links at every width, wrapped onto a second row. `HomeHero.tsx` is a visitor's home page hero below the header's top bar,
  with its pitch and persona note buttons, and `HomeHeadline.tsx` is the home page's shimmering headline, on both faces.
  The header shows the tutorial video button beside the logo on every page. `Footer.tsx` is the global footer,
  `DocsLink.tsx` is every link to the docs, which opens in a new tab, and `Attribution.tsx` is the persona credit in the
  hero's popover.
- `components/admin/` — the admin console's own pieces beyond its tables: `MobileMinimumVersionsCard.tsx`, each
  platform's minimum app version with who saved it and the input that raises, lowers, or clears it;
  `DailySpendCutoffsCard.tsx`, the Limits section: the meter of the day's free-plan spend and rings of the waiting first
  scans and the past hour's signups, each over its settings, which save when a field loses focus, except the cutoffs,
  which save from a Save daily cutoffs button; `FreePlanSpendMeter.tsx`, that meter with a circle at each daily spend
  cutoff under a ring of the time left until midnight UTC; `spendControlDraft.ts`, the card's typed overrides, each
  cutoff's typed value, and the save body they send, which holds only the settings the tab changed since it loaded or
  last saved; `EstimatedMonthlySpend.tsx`, the card's table of the worst case
  monthly spend at each daily signup rate, limited by the highest cutoff beside the month without cutoffs, over the most
  this month and the past days slider, and its table of how long after midnight UTC each cutoff is passed over a slider
  for each cutoff; `ManageAdminsModal.tsx`, where an admin adds and removes other admins.
- `components/branding/` — the coffee drawings, the loading indicator, the note icon, and the avatars.
  `ShareMugsIcon.tsx` draws the two mugs of a comment that a Podcast Episode read. `CoffeeMug.tsx` draws the mug from
  `@carlnotes/nightshift/coffeeMug`, and `coffeeMugSteam.test.ts` fails if the steam's keyframes and still rules in
  `animations.css` differ from that module's steam motion. `Avatar.tsx` is the one avatar that `UserAvatar` and
  `TeamAvatar` render: the stored image, or the owner's initials on a tinted circle if there is no image or it fails to
  load. `HostAvatar.tsx` is Carl's or Vienna's own picture.
- `components/avatar/` — the user and team avatar pickers, over the upload pieces they both use.
  `UncheckedAvatarLine.tsx` is the line under an unchecked avatar, wrapped at the avatar's width and never narrower than
  5rem, in `UserAvatarPicker` and `TeamAvatarPicker`. The account page's profile fields place the line themselves, so
  their picker takes `hasUncheckedLine={false}`: `components/account/AccountFields.tsx` puts it under the avatar's row
  on a phone and beside the avatar under the username from sm up. `AvatarUpload.tsx`
  turns a chosen file into the resized re-encode the app stores, a PNG for a PNG, WebP, or GIF source so a transparent
  logo keeps its background, and a JPEG for a photo. A file of a megabyte or more decodes at 512 pixels wide,
  a HEIC file the browser rejects decodes through a HEIC decoder the page loads on that pick, and a file that could
  not be decoded or resized is reported by its content type and byte size and shows a message.
- `components/podcast/` — the podcast's components, `PodcastEpisodeHeader.tsx` (the podcast episode page's image, title,
  description, byline, and reactions), `PodcastEpisodeSkeleton.tsx` (that page's loading state),
  `PodcastEpisodePlayer.tsx` (the topic page's player),
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
  `PodcastThemeSongNote.tsx` (the headphones tile whose popup credits the theme song, the title note of the film
  section and the podcast section on the topic page and the podcast episode page, with the lyrics from
  `podcastThemeSongLyrics.ts`),
  `PodcastEpisodeCover.tsx` (an episode's cover square), and `PodcastEpisodeAudio.tsx`, the one audio element and the
  podcast player that `Layout` mounts.
  `stores/podcastEpisodePlayerStore.ts` binds that element and browser lifecycle/voice hooks to the core player, so
  playback continues from one page to the next, and core `stores/podcastEpisodePlayActions.ts` plays or pauses a
  podcast episode or a chapter by id from a page. `stores/topicPodcastEpisodeVideoElement.ts` owns the browser's one
  film element, the core player's video adapter for the app's lifetime. `TopicPodcastEpisodeVideoPlayer.tsx` moves it
  into its frame while its film is loaded and back to a hidden host in a layout effect's cleanup, before the frame
  leaves the document, so a film in picture-in-picture keeps playing from one page to the next and any other pauses
  for the audio. `TopicPodcastEpisodeVideoDialog.tsx` adapts core's Video dialog to the browser's dialog,
  `ReturnedTopicPodcastEpisodeVideoDialog.tsx`, which `Layout` mounts, is that dialog for a film that returned from
  picture-in-picture on a page with no film player, loading the dialog's code once a film returns, and
  `TopicPodcastEpisodeVideoSection.tsx` is the topic page's
  collapsible film section. While a topic with no ready film has a latest podcast episode whose film is rendering, the
  section shows `UnpublishedPodcastEpisodeCard` with `isVideoRendering` in the film player's place, the recording
  card's frame with the line "Carl and Vienna are filming...", and core's `useTopicPodcastEpisodeVideoRenderingPoll`
  reads the page again until the film is ready. `pages/PodcastEpisodePage.tsx` shows the same card in its Coffee Break
  Cinema section for a podcast episode whose film is rendering, and its poll replaces the page once the film is no
  longer rendering. A failed poll read of the topic page keeps the page shown.
  The film player's `PodcastEpisodeSeekBar` has `hasChapterTooltips`: hovering a chapter's
  segment shows `TopicPodcastEpisodeVideoChapterTooltip.tsx`, the chapter's title over the first image of
  `topicPodcastEpisodeVideoChapterImages.ts` that loads, the Finding's link preview image, then the chapter's generated
  image, then the podcast card. The image's frame shows the loading note until the image loads, and an image that
  failed to load is not requested again until the page reloads. The audio player card's bar has no tooltip.
  `pages/PodcastEpisodePage.tsx` holds the film in its Coffee Break Cinema section and the
  player card in its Coffee Break podcast section. Core `useShownPodcastEpisode` owns selection and recording polling; the web
  supplies its search parameter.
- `components/social/` — the web's adapters of the shared reaction row and comment thread. `socialElements.tsx` is the
  web's `SocialElements` set with the six reaction icons and the flame and mugs of a comment shared with the podcast.
  Its `COMMENT_ELEMENTS` are the comment parts and the one composer that `note/NoteComments.tsx` spreads too.
  `ReactionUsersTooltip.tsx` names who reacted, and `socialTestHarness.tsx` renders the thread for its tests.
  `ReactionRow.tsx` and `CommentThread.tsx` add sign-up for a visitor, a toast for an error, the report dialog, and the
  thread's view event. `SocialSection.tsx` holds the thread in the Topic page's, the Podcast Episode page's, and the
  finding popover's collapsible Hot takes card, with the week's count beside its title and the shared count at the
  card's top right. `topic/TopicPageHeader.tsx`, `pages/PodcastEpisodePage.tsx`, and `topic/TopicResourceInfo.tsx` place
  the reaction row in their headers. `NewsList.tsx` adapts core's `NewsList` as the news card of the signed-in home
  and of a profile. `CommentMentionBadge.tsx` adapts core's mention badge, a count whose press opens
  `CommentMentionList.tsx` in a popover, with `CommentMentionMenuRow`, the user menu's Mentions row. It sits right
  after the title of the podcast episode page and of the Topic Post page, and on a comment section's title.
- `components/note/` — the Tasting Notes section, table, and dialog, `NotesList.tsx` and `NoteDetails.tsx` adapting
  core's notes list and the open note's header, the dialog's create flow in `CreateNote.tsx`, and
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
  made during render a millisecond later if nothing has mounted, and a cold open of the dialog lost that race. The
  patch also names each checklist checkbox in `EnrichedText` by its line's text, since the package's label beside the
  checkbox is not tied to it. A drop of image files moves the caret to the drop point and sends them as a paste
  there. `noteStyle.ts` makes the image wrapper a block as wide as its image, so each image sits on its own line. Its
  image node view marks its wrapper as the drag handle, so a drag of the image moves it, and adds a resize handle, a button at the image's corner that a drag or
  the arrow keys move, which sets the image's width and height inside the column. Its image node keeps an `align`
  attribute as the img's `data-align`, set by `setImageAlign`, which `noteStyle.ts` floats at a side or centers. A `CodeBlockHighlightPlugin` colors a code block in a
  language with decorations from the highlighter that `setCodeBlockHighlighter` registers, which
  `hooks/useCodeBlockColors.ts` loads into the Topic Post editor. A change highlights only the blocks it changed, and
  an unlabeled block's language is guessed from its first 2,000 characters.
- Clients — the typed api clients live in `@carlnotes/client`, imported as `@carlnotes/client/<domain>Client`.
  `lib/webApiClient.ts` holds the app's `configureApiClient` call, with the base url, `""` in the browser and the api on
  port 3000 on the server, and `showError`, which toasts the message; `router.tsx` calls it where both the server
  render and the browser pass, and the route tests' `-loadRouter.ts` calls it the same way.
- `mcpViews/` — the MCP Apps views the mcp server's tools name: `main.tsx`, the entry `vite.mcpViews.config.ts` builds
  into two scripts and one stylesheet in `dist/mcp-views/` as part of `build` or alone with `build:mcp-views`:
  `mcpViews.js` for every MCP view but the dashboard, with `emptyDashboardMcpView.ts` in the dashboard MCP view's place,
  and `dashboardMcpView.js`, which alone holds the charts and the map. Beside them is
  `McpViewApp.tsx`, which connects to the host with `@modelcontextprotocol/ext-apps` and follows its theme and display
  mode. `mcpViewRouter.tsx` holds the routes in a memory router, one for each MCP view, and the route the html's MCP
  view opens on. `McpViewShell.tsx` is the layout around them: the brand link, the back button, the display mode buttons
  in `McpViewDisplayModeButton.tsx`, the heading in `mcpViewRouteHeading.ts`, and `McpViewToolText.tsx`, the tool's own
  words if a result has no MCP view data. `mcpViewHistory.ts` keeps each route's tool call in its history entry, so back
  calls no tool, and opens every other navigation on the site. `McpViewLink.tsx` takes the one hop, or opens the site
  after it, and every other link opens through the host by `LinkOpenerContext` in `AnchorLink`. `SearchMcpView.tsx`,
  `TopicMcpView.tsx`, `FindingsMcpView.tsx`, `UpdatesMcpView.tsx`, and `ScanMcpView.tsx` render the site's own
  components, `McpViewSubscribeButton.tsx` and `McpViewPodcastPlayer.tsx` beside them. `SearchResultsTable.tsx` and
  `FindingsTable.tsx` lay those components out as tables over `mcpViewElements.tsx` and `McpViewFindingCells.tsx`,
  `useMcpViewFindings.ts` keeps an MCP view's rows as its tool calls change them, `useFindingPages.ts` pages the
  findings through the tool's cursor, and `useScanStatus.ts` polls `read_scan_status` at its own 10 and 30 second rates.
  `McpViewReactionRow.tsx` renders the shared reaction row in a finding's details where the tool result came with its
  reactions, saving through `save_reaction`. `mcpViewHost.ts` holds the connected app, the MCP view data a tool result
  includes in `_meta`, and the tool calls the MCP views make, and `mcpViewFindingHandlers.ts` the finding note's
  handlers the search and findings MCP views share, each a tool call. `testHost/` runs the built bundle in Chrome under
  the test host: `mcpViews.smoke.ts`, which imports each MCP view's `*McpViewSmokeSections.ts`, runs over
  `mcpViewTestHarness.ts`, `mcpViewTestHost.ts`, `hostPage.ts`, and `mcpViewFixtures.ts` as `bun run smoke:mcp-views`,
  and `@carlnotes/contracts/mcpScanStatusTestFixtures` holds the Scan statuses it shares with the stories. The MCP view
  build aliases `@carlnotes/client/authClient` to `mcpViewAuthClient.ts`, whose session is the tool result's caller, and
  `@/lib/visitAnalytics` to `mcpViewVisitAnalytics.ts`, which reports nothing, and `@/lib/voiceActivity` to
  `mcpViewVoiceActivity.ts`, which never starts, and `mcpViewFetch.ts` returns a podcast episode read from the tool
  result, sends a finding's feedback, a comment thread's read and post, a reaction, and a Topic Post's read through
  their tools, and fails every other request, so an MCP view reaches the api only through a tool call.
  `mcpViewElements.tsx` holds every element more than one MCP view replaces in the site's components: the tables'
  narrow layout, the topics table with its kept count as text and its email switches disabled, a Topic Post's info
  popup with reactions through their tool, no Share, and the discussion's play button that plays a tool result's
  recording, the comment thread with no control a tool lacks, and `McpViewSiteLink`, the link under a view's list that
  opens its page on the site. `NewsMcpView.tsx`
  renders the shared news list with the mentions above it, paging past the tool's rows through `read_news`.
  `TopicPostsMcpView.tsx`
  renders a Topic's posts as the site's cards with no publish button, and `TopicPostMcpView.tsx` one post with its
  image, its recording, and its comments in `McpViewCommentThread.tsx`, which has no edit, delete, or report control.
  `McpViewTopicHeader.tsx` is the Topic's header the findings and posts MCP views share, and `mcpViewHop.ts` the
  one hop a link or a post card takes. The build also aliases the Topic Post editor to `mcpViewTopicPostEditor.ts`,
  which keeps the editor out of the bundle, a post body's links to `mcpViewExternalLinks.ts`, which opens them
  through the host, chat Markdown to `mcpViewChatMarkdown.tsx`, which renders Carl's room messages through
  `SafeNoteText`, and the HEIC decoder to `mcpViewHeicTo.ts`, which rejects a file. The note views import
  `note/NotesSectionItem.tsx` and the team view `chat/chatRoomMessageListElements.tsx`, which keep the note dialog's
  editor and the virtualized room list out of the bundle. `DashboardMcpView.tsx` renders the shared Dashboard from a `read_dashboard` result with the outline
  map and links to the caller's three Dashboard pages, and another chart selection reads through the tool.
  `NoteMcpView.tsx` renders a page's notes with the site's notes item and list, and one opened note read-only through
  `read_notes`. `TeamMcpView.tsx` renders the team page's header, sections, members, topics, and notes, and a member's
  room, whose earlier messages read through `read_team`'s cursor. `ProfileMcpView.tsx` renders a Café's header, news,
  sections, and tables, `ActivityMcpView.tsx` the Activity sections, whose Active switch and invite answers call
  `follow_topic` and `respond_to_invite`, and `AccountMcpView.tsx` the Budget section, whose plan and payment actions
  link to the site. `TopicsMcpView.tsx` renders a `list_topics` section as the home's topic cards, or a topic's
  similar topics. `McpViewTopicCard.tsx` is a Topic's card that takes the one hop to its findings, `McpViewCardLink.tsx`
  the stretched title link of a card that opens in the MCP view, and `mcpViewPageCardElements.tsx` the cards the
  profile and team MCP views' sections share. `McpViewPodcastPlayer.tsx` plays a film in the frame with
  `mcpViewElements.tsx`'s film player elements while the tool result includes the film's files.
- `stores/` — the stores that reach the browser or a component library, named `<thing>Store.ts` and built the way
  `packages/core/AGENTS.md` describes, on `@carlnotes/core/stores/storeListeners`. Reach for a store only when state
  outlives a page or crosses the tree; `useState` and `providers/` cover everything else. The DOM-free stores,
  `chatRoomStore`, `noteBadgeStore`, and `topicInviteStore`, live in `@carlnotes/core/stores/`. The stores here:
  `chatPanelStore.ts` (which chat room or private chat the panel shows), `pageActionsStore.ts` (the search bar's page
  actions menu, with its lucide icons), `searchBarStore.ts` (the search page the bar's text opens, which the header's
  logo links to from any other page, and the event the logo sends to empty the bar from the search page), and the
  podcast and spoken answer stores, which drive audio elements and the media session. `spokenAnswerStore.ts`
  registers the spoken answer audio element as core's spoken answer player: each spoken part plays as a blob url, a
  tap's silence unlocks the element, and the media session names the host, with its play and pause controls stopping the
  spoken answer. The queue, its state, its end announcement, and the podcast player question are core's, which the web
  imports from `@carlnotes/core/stores/`. Core's `podcastEpisodeListenStore.ts` keeps whether the user is signed in
  and saves a signed-in user's progress in the loaded podcast episode, its playback start once per load, for the player
  store.
- `hooks/` — the React hooks that read the browser or a route, `useTopicPagePayload.ts` among them, the topic page's
  payload, its poll reload, and a signed-in reader's related topics from their own read, `useConfirmDialog.tsx`, which asks before an action runs, `useSiteAssetUrl.ts`, a
  site image's url, absolute in an MCP view's frame, and `useScanNote.ts`, a scan's note behind its recap popover, read
  once the trigger is pointed at, focused, touched, or opened, and kept once the scan has finished, and
  `useColorMode.ts`, the color mode the page shows, kept current as the theme toggle switches it; `providers/` —
  context providers. The images the bundler imports, Carl's and Vienna's portraits, come from
  `@carlnotes/nightshift/assets/`. The DOM-free hooks `useNow`, `useAvatar`, `useUsernameChange`, `useNoteBodySave`, and
  `useNoteComments` live in `@carlnotes/core/hooks/`. A component that reads the browser during render, `localStorage`,
  `window`, or `document`, reads it through `useBrowserValue` in `hooks/useBrowserValue.ts`, so the server and the first
  browser render agree. A page that starts from a server loader's data loads in the browser through `useLoadInBrowser`
  in the same file. `useLoadInBrowser` skips the first load while hydrating data the server already read. Code without
  its route's typed `useSearch` reads the query string as `URLSearchParams` through `useSearchParams` in
  `hooks/useSearchParams.ts`. `useCtaPromptToast` in `hooks/useCtaPromptToast.ts` toasts the prompt that a page's `cta`
  param names, on the signup and plans pages. `useIsSignedInBeforeSession` in `hooks/useIsSignedInBeforeSession.ts` says
  whether the page shows as signed in. The page load's session cookie decides until Better Auth's session request
  finishes, and the session decides after. An element that fades in as it scrolls into view takes its class from
  `useRevealClassName` in `hooks/useRevealClassName.ts`, which shows a server-rendered element before any script runs,
  so nothing a crawler or a browser without JavaScript reads starts hidden. A box that scrolls takes its tab stop from
  `useScrollRegionTabStop` in `hooks/useScrollRegionTabStop.ts`, which returns `{ ref, tabIndex }` for the box, with a
  tab stop while its content overflows, so a keyboard can scroll text with no link in it. The box draws its focus ring
  with `SCROLL_REGION_FOCUS_CLASS`. The counts lines read their counts through `@carlnotes/core/hooks/usePolledCounts`,
  once the page has mounted and then every minute while it is focused.
- `src/globals.css` — the app's stylesheet, with the keyframes in `animations.css` and the `scrollbar-none` utility
  the note toolbar scrolls sideways with. It imports its `@theme inline` block, the `shadow-raised` utility, and the
  `:root` and dark variables from `@carlnotes/nightshift/tokens.css`, which is written from the Nightshift TypeScript
  source, has Tailwind read the contracts in `packages/nightshift/components/` and `field.ts`, and keeps Tailwind from
  scanning stories, so a story never adds a class to the app's css. It defines `sentence-link`, the class of a link
  inside a sentence: the link color with `faint-underline`, an underline at rest that turns solid on hover. A link in
  its own color inside a sentence, as the hero's is, takes `faint-underline` alone. A link that stands alone, such as a
  table cell, a footer link, or a link alone in its line, takes `STANDALONE_LINK_CLASS` from `lib/styleClasses.ts`, the
  link color underlined on hover.
- The top row of buttons under the search bar, and a titled header row's button, take their classes from
  `lib/styleClasses.ts`: `PLAIN_PAGE_BUTTON_CLASS` for the plain button at the left, with its icon in
  `PLAIN_PAGE_BUTTON_ICON_CLASS`, and `HIGHLIGHTED_PAGE_BUTTON_CLASS` for the one highlighted button at the right. The
  two share one size at every width, 36px tall with a pseudo-element that grows the touch target to 44px, and differ
  in their fill alone. `PAGE_BUTTON_ROW_CLASS` is the row, with 16px above it, from the search bar, and 16px below
  it. A page never gives a top row's button its own height, padding, or corner. `lib/styleClasses.test.ts` holds the
  pair to one size.
- A page's loading state is laid out in the classes and components its loaded page uses, so it holds each block where
  the page draws it. `SKELETON_SHAPE_CLASS` in `lib/styleClasses.ts` is a placeholder's fill, `AccordionSection` takes
  `isLoading` for a section's title and count, `CardsRowSkeleton` draws a section's cards in its grid, the news list's
  `Loading` element is a page of placeholder rows, and `PLAIN_TOPIC_HEADER_GRID_CLASS`, `FILM_CARD_CLASS`, and
  `NEWS_HEADING_ROW_CLASS` are shared by a loaded page and its loading state. `components/topic/TopicSkeleton.tsx`
  is the topic page's loading state under the page's button row, which holds its own two placeholders, and exports
  the collapsible section's, the film card's, the player card's, the theme song note's, and the empty section card's
  loading states that `components/podcast/PodcastEpisodeSkeleton.tsx` shares.
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
  `a11y.config`, with a comment saying why. The UI tests capture every story in both palettes at the phone and desktop
  widths, and a story's own viewport or theme globals limit it to that size or palette. A story whose component shows at
  one width only pins that width: `PHONE_VIEWPORT_GLOBALS` for the phone header's menu, and `DESKTOP_VIEWPORT_GLOBALS`
  from `.storybook/viewports.ts` for the wide-screen user menu. A story that cannot render the same pixels twice, such
  as one that reveals its text over seconds, takes the `no-screenshot` tag with a comment saying why.
  `ui-tests/AGENTS.md` describes the image captures. A story sits beside its component as `<Component>.stories.tsx`;
  every component file in `components/primitives`, `common`, `table`, and `layout` has one, which
  `components/stories.test.ts` checks. A story gets its data from mocked clients and invented fixtures, never from a
  change to the component. The shared fixtures are in `.storybook/fixtures.ts`, with the date from
  `@carlnotes/core/lib/storyFixtures`, the sessions, and the people, and in one file per domain under
  `.storybook/fixtures/`: topics, a visitor's and a user's topic feeds, podcast episodes, teams, admin users, and
  waiting updates. A story imports them from there, never from another story. The Dashboard stories read
  `@carlnotes/core/lib/dashboardStories`, and `.storybook/seriesColorsDecorator.ts` gives a chart story the series
  colors of the toolbar's palette. `public/stories/` holds the short film
  and its captions that the film stories play, which the web build serves at `/stories/` and
  `@carlnotes/core/lib/podcastEpisodeStories` names by url. `src/nightshift/` holds the Tokens,
  Typography, Inventory, and Layout pages, the swatch and specimen components they render, `ScrollingTable.tsx`, which renders
  their tables in the app's table classes with the first column fixed, and the pattern stories, each composed from
  `lib/styleClasses.ts` and its sibling class modules where a shared class exists, the section label from
  `SECTION_LABEL_CLASS`, which `lib/styleClasses.test.ts` checks against the sectionLabel type role in
  `@carlnotes/nightshift/typography`, as it checks `LOGO_CLASS`, the name beside the mug in the logo, against the logo
  role. `src/nightshift/` also holds the
  fetch guard and the in-memory storage the preview installs, outside `.storybook/` so that `bun test` finds their
  tests. `bun run dev:storybook` serves the component browser on port 6006 with Storybook's MCP server at
  `http://localhost:6006/mcp`, registered in `.mcp.json` and `opencode.json`: search its catalog before writing a
  component, and reuse what is there. `bun run build:storybook` writes the component browser to `dist/nightshift/`,
  which the api serves at `/nightshift`.
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
  MCP views too, and `bun run build:storybook`. Tests: `bun test apps/web`.

## Shared components

[Shared web components](shared-components.md) maps Feed, Tasting Notes, menu pages, chat, Coffee Break, Personal sources and MCP Apps views to their core components and browser adapters.

## Topic images and the home

`pages/HomePage.tsx` is the home's two faces over `GET /api/home`, and `pages/TopicsPage.tsx` the directory at
`/topics`. `components/topic/TopicCard.tsx`, `components/podcast/PodcastEpisodeCard.tsx`, and
`components/primitives/topic-image.tsx` adapt the shared cards and image, the last drawing the coffee mug in a box with
no file and also exporting the contract's frame
as `TOPIC_IMAGE_FRAME_CLASS`. `components/common/cardElements.tsx` is `CARD_ELEMENTS`, the card box, topic image, and
text row the two cards share, over core's `CardElements`, with a story beside it.
`components/podcast/PodcastEpisodeVideoButton.tsx` adapts the shared button that opens a film, with the Video dialog
its press opens: a film card's round play button, `PodcastEpisodePlayButton` centered over the card's image, and the
Video pill beside the play pill on a `components/social/NewsList.tsx` row whose Podcast Episode has a film. The news
MCP view's row shows none. Its thumbnail size is the play button over the film's poster in
`components/topic/TopicInfo.tsx`, whose popover shows the latest film's section, core's
`TopicPodcastEpisodeVideoInfoSection`, right above the podcast's.
`components/topic/TopicImageEditor.tsx` adapts the editor's image block, with the browser's file input as its picker.
`components/topic/TopicImageButton.tsx` is the image as a button with the camera overlay, and the page header's image,
which is that button for an editor. `components/topic/TopicImageLink.tsx` adapts core's `TopicImageLink`, the image
inside an `AnchorLink` to the page of what it shows: a search row's, a news row's, and a Topics row's image, the
Topic's image in a Finding's and a Topic Post's popup, each out of the tab order and the accessibility tree beside the
title that opens the same page, and the full-width image of a Topic's and a Topic Post's popup, each with its name
as the popup's one link to the page. It reads the open page from the router, and the open page's own image is a
plain image. Every image that opens its page goes through it, never its own link.
`components/topic/EditImageDialog.tsx` is the Edit topic image and Edit podcast
image dialog that the header image opens, and the Edit film dialog that the Edit film option opens from the actions
menu of the podcast episode page and of the topic page (`toEditTopicPodcastEpisodeVideoOption` in
`components/topic/TopicActions.tsx`), and `components/podcast/EditPodcastEpisodeDialog.tsx` the Edit podcast dialog
of the podcast episode page's actions menu.
`components/common/RankDialog.tsx` is the web's rows and frame for core's `RankDialog`, the list that orders pinned
topics, films, podcast episodes, or Topic Posts: the admin's home order list on a topic page and a podcast episode
page, and a person's own pins on their profile page, films among them, and on the page of one of their topics, podcast
episodes, or Topic Posts.
`components/topicPost/HomeTopicPostRankDialog.tsx` is the admin's Home posts list, which the home page's and a Topic
Post page's actions menus open: it reads the pinned Topic Posts and the ones a pin may name, offers the page's post a
place, and sends the order. `components/common/CardsSection.tsx` is the web's accordion section, grid, and page
buttons for core's `CardsSection`, which the home's, the profile's, and the team page's card sections render, and
`components/common/pageSectionsElements.tsx` is `PAGE_SECTIONS_ELEMENTS`, the sections and cards that the profile's
and the team page's adapters spread,
Featured Posts right below Featured Podcasts on the profile and the team page. The home writes its sections in
`HOME_SECTIONS`' order, New podcasts this week right below Featured podcasts and New posts this week right below
Featured posts, and a section with no card is absent. The profile's Featured Posts lists every post of its person and
is its only Topic Post section. The team page has the profile's four card sections, Featured Films right before
Featured Podcasts, and its Featured Posts lists every post of its topics.

Topic Posts: `components/topicPost/` holds the web adapters of the shared `TopicPostCard`, `TopicPostInfo` (the
info popover, which reads its post by id once it opens, and `TopicPostInfoButton`, the same popover under the
notebook-pen tile for a row, which `components/social/NewsList.tsx` draws on a published Topic Post's row. Its Share
and the page's Share open `components/share/ShareTopic.tsx` with the post as its `topicPost`, which shares the post's
page, title, and card in the topic's place, and whose invite option creates a link that opens the post),
`TopicPostsSection` (the Topic Posts section on the topic page, whose button creates a draft), and
`TopicPostEditor` (the title over the note's rich text input and toolbar, whose `TopicPostBodyControls.tsx` adds the
Image button with each upload's preview, the code block's language menu, and the selected image's alt text), with
`TopicPostReader.tsx`, which loads with the editor package in the browser alone, puts a Report image button over each
body image a reader may report through `TopicPostBodyImageReportButtons.tsx`, and colors a code block in a language
through `hooks/useCodeBlockColors.ts`. That hook imports `lib/codeBlockColors.ts`, highlight.js's core with the
languages the menu offers, only for a body with such a block, and the colors come from `CODE_BLOCK_COLORS_CLASS` in
`noteStyle.ts`. The server and the first render show the body's plain paragraphs at the
rich text's line spacing until it loads. `pages/TopicPostPage.tsx` is the page at
`/topics/$topicId/$topicSlug/posts/$topicPostId/$postSlug`: the shared `TopicPostPage` with the web's elements, the
actions menu's Share, Edit post, and Delete post, Home posts for an admin and Featured posts for the author on a
published post of a public topic, each a rank dialog with the post offered a place, the image dialog, and the post's
comment thread. Its body
renders as plain paragraphs on the server and in the first browser render, and the rich text display replaces them
once it loads. The routes are `topics.$topicId_.$topicSlug_.posts.$topicPostId.tsx`, the id alone, where an untitled
draft's editor opens, and `topics.$topicId_.$topicSlug_.posts.$topicPostId_.$postSlug.tsx`, the canonical path, both
over `-topicPostRoute.ts`, which redirects a stale slug. `components/account/ProfileHeader.tsx` adapts the shared
profile header, and the profile route reads the first page of the week's news on the server.
`components/common/cardElements.tsx` holds the reaction count every card shows at the right of its last row.

Topic Post Discussions and the Topic Post chat: `components/topicPost/TopicPostDiscussionCard.tsx` adapts the shared
discussion card to a page card with the podcast play button and the account forms' label, input, and buttons. The
card's name is the summary of a details element behind the news card's caret (`EXPANDER_CARET_CLASS` in
`lib/styleClasses.ts`), and the transcript stays in the html, hidden until that element opens, so the card is closed
at first and opens with and without JavaScript. Its lines are the podcast episode transcript's Text and Strong.
`pages/TopicPostPage.tsx` exports `TOPIC_POST_PAGE_ELEMENTS` for the page's stories, names the open post to
`topicPostChatStore`, and offers Report image in the page's actions menu. While a post is named,
`components/chat/AppChatPanel.tsx` opens the chat launcher on the topic's private chat for a user, through
`toDefaultChatId`, and shows a visitor the sign-up panel. `PrivateChatPanel` reads its question box's line from
`toPrivateChatPlaceholder`, and the row that names the open chat and the menu's private chat option read
`toPrivateChatIdLabel`, each on one line with the whole label as its title. `components/chat/TopicPostTag.tsx` adapts
the shared tag to a link, and `ChatTurnBlock` shows it under a question asked from a post's page.
