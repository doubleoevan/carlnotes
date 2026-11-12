# packages/core/

`AiAgentAccountSection`, `AiAgentAccountCard`, and its `AiAgentApiKeys` share connected-app and one-time API key
controls. `TopicPersonalSources`, `TopicPersonalSourcesCard`, `PersonalSourceCard`, `PersonalSourceEntryList`,
`PersonalSourcesAiAgentPicker`, and `PersonalSourcesEmailControls` share Personal sources composition. The editor has no
email setup; `PersonalSourcesEmailControls` loads only the empty-content mailbox hint, and `PersonalSourcesEmailAddress`
renders that single line and Copy. `PersonalSourcesImportButton` and `PersonalSourcesImportDialog` share the opener,
guidance, preview selection, paging, and confirmation. Apps supply Nightshift fields, links, confirmations, clipboard,
and the browser-only file parser. `useAiAgentAccount`, `useTopicPersonalSources`, `usePersonalSource`, and
`useTopicPersonalSourcesContents` scope reads and actions to the current account. Entry pages and metadata leave
inactive query caches immediately. Secrets never enter a query cache. `personalSourcesCopy.ts` owns privacy, retention,
and readiness copy. `personalSourcesStories.ts`, `expandableRowStories.ts`, `aiAgentAccountStories.ts`, and
`userBlocksStories.ts` supply fictional fixtures for both component browsers. `TopicPersonalSourcesSectionStory` shares
the in-place section fixtures. Personal sources stay outside the fetched Source count in the shared Source editor.

`@carlnotes/core`, the DOM-free components, stores, hooks, and lib that web and mobile import as
`@carlnotes/core/<folder>/<name>`. It imports `@carlnotes/contracts`, `@carlnotes/client`, `@carlnotes/nightshift`,
`react`, and `@tanstack/react-query`, and the non-UI `markdown-to-jsx/markdown` parser.

- `components/` — portable React composition exported as `@carlnotes/core/components/<name>`. `cardElements.tsx`
  holds the `CardElements` type both card components extend. `Dashboard` is the body of all three Dashboard pages on
  the web, in the mobile app, and in the MCP view: Carl's paragraph and five chart sections in four rows, each chart
  drawn by the platform renderer an app supplies, opening on the default selection on every page, and opening
  `DashboardPointDetail` for a point, a pin, or a trend day. `RadioGroup` is a row of choices of which one is on, and
  `TeamDropdown` is the team dropdown over a user's own teams in alphabetical order. `AvatarHeader` is a page's person
  or team, laid out like the profile page, with an optional details line, and `AvatarHeaderSkeleton` holds its place.
  Specials, Teams, Activity, and Account open with it. `DashboardSubjectHeader` is the Dashboard page's
  `AvatarHeader` over `DashboardSummaryStrip`. `TablePagination`,
  `Pagination`, `SourceResultsChart`, `TopicScanRecap`, `NumberedTopicFindingList`, `SafeNoteLink`, `TopicScanFailure`,
  `MoreButton`, `CopyMarkdownButton`, `NotesTable`, `ResourceMetadata`, `RatingThumbs`, and `UpdatesList`, the
  updates MCP view's list, own repeated content, visibility, ordering, and interaction state. `CommentMentionBadge`
  counts the unseen Comment Mentions of a thread or a page and opens `CommentMentionList`, every unseen mention newest
  first, both over `stores/commentMentionStore.ts`, which `hooks/useCommentMentionsLoad.ts` fills as each page or
  screen loads. `usePageCommentMentions` in that store reads one page's mentions for its title's badge: a Topic's
  through `hooks/useUpdateCounts.ts`, a Podcast Episode's in each app's header, and a Topic Post's in `TopicPostPage`.
  `TopicNotePopover` is a Topic's note under its note icon on a row that holds only the Topic's id,
  which `hooks/useTopicNote.ts` loads once the note opens. `UserBlocksSection` lists the
  people the user blocked with their confirmed Unblock, over `UserBlocksCard`, which the stories render from a fixture
  list. `DetailsLine` is the muted details line under a page's byline, which wraps between details, each with its
  middle dot at its own end, and is absent with no detail. `lib/detailsLine.ts` builds its details: `toCountDetails`
  (counts in order, a zero left out), `toTopicDetails` (the counts of a topic page's sections), and
  `toTopicCountsDetails` (a topic's viewers and followers under its name in the Topic Post popup). A Topic Post's
  page builds its line with `toTopicPostDetails`, and a team's page with `toTeamDetails`. `ProfileSummaryLine` is the
  details line under a profile's name, with the page's topic, podcast episode, and team counts and its Blocked link.
  `TermsAcceptanceNotice` asks a
  stale account to accept the published Terms or put it off, and `useIsTermsAcceptanceDialogOpen` says when it shows.
  Each app supplies the small set of typed platform elements the component needs. Keep component adapters at module
  scope so state changes preserve their identity. Use render callbacks when controls must retain app-local refs or
  routing. Core imports no DOM or native component library. Platform wrappers keep their existing stories; web
  integration tests exercise the shared composition through real DOM adapters, and device checks cover native adapters.

- `stores/` — app state one module owns and any component may read, named `<thing>Store.ts`. `openReportStore.ts` holds
  the open report count an admin's badges show.
  `termsAcceptanceStore.ts` holds whether the Terms dialog is open: a write rejected for the Terms opens it, Not now
  puts it off for that user, and the acceptance clears it. `appUpdateStore.ts` holds whether an installed build is
  waiting on a store update: a 426 from any transport opens the blocking notice, a later body fills in the minimum,
  and "Check again" clears it, with the notice's words in `@carlnotes/contracts/appVersions`. Each keeps its value in
  module scope and takes its `publish` call and `useStoreVersion` hook from `storeListeners.ts`, the one place the
  `useSyncExternalStore` contract lives, beside `toEventListeners` for a store's subscribe and announce of an event, so
  two components read one live value with no provider wrapping them. Every store hook calls `useStoreVersion`, which
  reads the same version as the server snapshot. `chatRoomStore.ts` is the user's chat rooms and their chat mention
  badge counts, `noteBadgeStore.ts` the unread note counts the poll last read, with the notes opened this session that
  already cleared, and `topicInviteStore.ts` the topic invitations waiting for the user's answer.
  `podcastEpisodeQuestionRules.ts` holds a podcast player question's phases, endings, resume rule, chapter line label,
  the mic's label, whether a podcast episode shows the mic, and what each mic slot shows.
  `podcastEpisodeQuestionStore.ts` drives the question: the pause and the resume, the recording's send and cancel, the
  chat turn it sends with the chapter, the audio adapter callbacks that end a question on a play or a seek, the
  sign-out's end that never resumes the podcast episode, and the snapshots that a chat panel showing that topic mirrors.
  Its tests' player store spies and stubbed recording are in `podcastEpisodeQuestionTestFixtures.ts`.
  `spokenAnswerStore.ts` is the queue of one reply's spoken parts, keyed by its spoken answer key. It holds the playing
  state that each play button reads for its own reply, and the announcement of each queue's end that listen mode reads.
  Each app registers its player with `registerSpokenAnswerPlayer`, over the `SpokenAnswerPlayerAdapter` in
  `lib/spokenAnswerPlayer.ts`. `spokenAnswerQueue.ts` has the queue's shape, its next step, and the host's name for the
  lock screen. `spokenAudioCache.ts` holds the session's spoken audio within a size limit, 40 MB by default or the
  `maxBytes` an app sets with `configureSpokenAudioCache`, and drops the least recently played first. The mobile app
  empties it on sign-out through `clearSpokenAnswers`, and the web's sign-out reloads the page.
  `streamedSpokenAnswer.ts` speaks a spoken question's reply as it streams. `voiceNoticeStore.ts` holds the voice
  notices each app registers, the web's toasts and the app's alert. `purchaseOffersStore.ts` holds what the app's store
  sells on the user's storefront, which the app sets, and `usePurchaseOffers`, the signed-in user's purchase offers in
  the app, which read a paid plan's billing provider and stay read-only until it loads. A store that reaches an audio
  element, the media session, or a component library stays in its app.
- `hooks/` — `useDashboardSnapshot.ts`, a Dashboard's snapshot for one chart selection, read once and shared by every
  chart that shows it, `useDashboardPage.ts`, a Dashboard page's access, default snapshot, subject, title, and team
  dropdown, which the web page and the mobile app's screen share, `useTeams.ts`, the signed-in user's teams and team
  invites read once per account, `useTopicPostView.ts`, a Topic Post page's view sent once its published Topic Post
  loads, `useNews.ts`, one page of a window of the signed-in user's news or of a profile's, `useNewsList.ts`, a
  news list's window, page, and open state, and `useUpdatesOpener.ts`, the day's opener above the user's own news;
  `useYourTopicsPages.ts`, the home's Your topics five to a page, the first from the home payload;
  `useUserBlocks.ts`, the user's user block list and the unblock that shortens the list once the server
  accepts; `useNow.ts`, the current time re-read on a tick for relative labels, one clock per list; `useAvatar.ts`, the
  avatar setting read from the session and updated through it; `useUsernameChange.ts`, changing the signed-in user's
  username, shared by the account page and the profile page's edit modal; `useNoteBodySave.ts`, the save schedule of the
  note an editor has open and the hook that reads it (`toNoteBodySave`: a save a second after the last change, one on
  its way and one waiting at most, nothing for a body equal to the saved one or to the one on its way, `img` tags
  stripped first, a failed save read as unsaved and retried on the next change, a conflict that stops every save until
  it is resolved, a waiting save sent on unmount, and `EMPTY_EDITOR_HTML`, the html the editor reports for an empty
  document); `useNoteComments.ts`, a note's comment thread loaded when the note opens, with its post and delete;
  `useUpdateCounts.ts`, the update badges a menu trigger or one page reads from the chat room, note badge, and topic
  invite stores; and `useUpdateBadges.ts`, the 45-second poll of the chat mention count and the waiting topic
  invitations while the app is focused and online, which reloads the chat rooms into the store when the count changes
  and drops a response from a replaced account; and `usePolledCounts.ts`, a page's viewer, follower, or listener counts
  read once the page shows and then every minute while the app is focused and online.
- `lib/` — pure rules and formatting: `dashboardCharts.ts` (the Dashboard charts' contract: the five charts, their
  controls, the renderer props, and a point's detail lines), `dashboardMapPins.ts` (the map's box, center, and zoom
  padding, and its pins: nearby places grouped at a zoom, each pin's size, label, and point, and the box a click zooms
  to), `groupBy.ts` (values grouped by a key in a loop. Hermes has no `Map.groupBy`), `dashboardCounts.ts` (a chart's
  views or plays, split into podcast and film plays, and their sums), `wordCloud.ts` (the word cloud's words and spiral
  layout, which both apps draw, and the title words the snapshots count), `dashboardStories.ts` (the Dashboard story
  fixtures), `reportCopy.ts` (the report dialog's words on both apps), `confirmElement.ts` (the props of a confirmation
  dialog), `confirmationCopy.ts` (the words of each one), `labels.ts` (values as the text a user sees: dates, durations,
  money, sizes, and counts), `pageHead.ts` (a `PageHead`, or a fixed title and path, as the tags a route's `head()`
  returns), `paginationSlots.ts` (the slots a row of page links shows), `worstCaseMonthlySpend.ts` (the admin console's
  worst case free-plan spend for the UTC month at a daily signup rate, the rates its table compares, and the daily
  signup average of the past days), `planCards.ts` (which plan card matches the user's plan and billing interval, and
  which badge shows), `streamReconnect.ts` (how long a silent SSE stream runs before it counts as dropped and the wait
  before reopening it, for the chat room stream), `topicFindingFilters.ts` and `topicFindingSorts.ts` (which findings a
  feed view shows and in what order), `topicSorts.ts` (the Topics page's topic order under Trending: viewers, then
  followers, then the newest finding, with Home topics kept in its own order), `topicPromptUrls.ts` (the urls written
  inside a topic prompt), `emailProviders.ts` (the webmail compose urls an invite is given), `chromeIntentUrl.ts` (the
  page as an Android intent url that opens it in Chrome, out of an embedded webview), `pushCopy.ts` (the push permission
  sheet's and the Notifications section's words), `sessionCopy.ts` (the lines the sign-in, sign-out, sign-up, and
  close-account controls say, shared by the web and the mobile app), `signupPrompts.ts` (the prompt each account action
  shows a visitor on the sign-up page, and the lookup by cta tag), `inviteRejections.ts` (what an invite page says while
  it checks a token, if the check fails, and for each way a token is rejected), `updateCounts.ts` (one badge's count
  summing chat mentions, note changes, and topic invitations, its accessible labels, and the groups a tooltip or a
  long-press sheet lists), `updateBadgePoll.ts` (the poll behind `useUpdateBadges`, on `activePoll.ts`), `countsPoll.ts`
  (the poll behind `usePolledCounts`, on `activePoll.ts`), `focusAndOnline.ts` (whether the app is focused and online
  through Query's adapters, and how a poll subscribes to a change), `limitedPoll.ts` (a poll on `activePoll.ts` that
  reads on an interval while the app is focused and online and stops at a time limit, behind the Topic Post discussion
  poll and the film rendering poll), `topicGateCopy.ts` (the invite-only gate's words), `podcastEpisodeCopy.ts` (the
  words shown if a podcast episode fails to load or play, the lines shown while it records and while its film renders,
  and the film section's title on the topic page and the podcast episode page), `topicPodcastEpisodeVideoDisplay.ts`
  (what a film section shows for a podcast episode: the film player for a ready film, the rendering card while its film
  renders, or nothing, and the section a topic's page shows while its only film is rendering), and
  `voiceRecordingDecisions.ts` (what the voice recorder decides from each frame, with the `SilenceThresholdSettings`
  type and the browser's default settings), `voiceRecordingRules.ts` (the mic's visibility, the recording timer, the
  reopened recording's rejection, and the meter's callback), `voiceRecorder.ts` (the recorder adapter each app supplies:
  the session a tap opens, the start, the recording's delete, the rejected microphone's action, and the background
  listener), `spokenAnswerPlayer.ts` (the spoken answer player adapter each app supplies), and
  `spokenQuestionsPaused.ts` (the mic's action past the spoken questions cutoff, and the plans page's upgrade lines),
  and `storefrontPurchaseRules.ts` (whether a user may buy a plan and where a paid plan is managed, from the platform,
  the store's offering, and the user's plan and billing provider, with each place's label). `sessionCopy.ts` also holds
  the closing copy for a store subscriber, whose plan keeps billing through the store.
- Imports: `@carlnotes/contracts`, `@carlnotes/client`, `@carlnotes/nightshift`, `react`, and `@tanstack/react-query`.
  Never a server package or an app. Universal: the root rule. A module that needs a DOM type is a web module and lives
  in `apps/web/src`.
- Tests: `bun test packages/core`.

## Shared podcast playback

`lib/podcastEpisodePlayback.ts` owns chapter lookup, seek bounds, skip lengths, playback speed, and portable system
metadata. `@carlnotes/contracts/podcastEpisodeTestFixtures` supplies the episode, summary, and chapter fixtures shared
by tests and component stories. Web keeps its Media Session objects in its own playback adapter.

## Shared chat

`lib/chatTurns.ts` owns turn identities, attachments, and stopped/finished turn handling.
`lib/chatHistoryTurns.ts` selects the history sent with the next question, retaining tool-only turns.
Web keeps import-compatible re-exports; both apps use the same implementation and existing contracts/client compaction.
Core tests cover interrupted and rejected turns, alongside the unchanged web regression tests.

`components/ChatAuthor`, `ChatTurnBlock`, `ChatRoomMessageBubble`, `ChatRejectionNotice`, and `TopicDraftCard` own
shared author, message, rejection, and draft field composition. Apps supply stable element adapters, Markdown, links,
and action controls. `lib/chatStoryFixtures.ts` supplies fictional conversations to both component browsers.

`hooks/useChatConversationLoad` owns history/access gates and proposal restoration; `useTopicChat` owns send, stop,
retry, clear, and tool outcomes. The attachment state, the topic draft state, and the notice remain injected app
extensions. `useVoiceRecording` is the recording's state machine from the mic tap to the transcript over the app's
recorder adapter, with listen mode in `useListenMode`, which reopens the mic on the tap's session once Carl finishes his
spoken answer, and `useChatRoomSpokenAnswer`, which `useChatRoom` calls, speaks Carl's reply to this device's spoken
room message, once. `useSpokenAnswerButton` is the play button's state and its tap, and
`usePodcastEpisodeQuestionButton` the podcast player mic's state and its tap. The `useVoiceRecording` and
`useListenMode` tests run in `apps/web/src/components/chat/sharedVoiceHooks.test.tsx` on the web's hook harness, with
the notices they collect and the wait for the spoken answer queue in `stores/voiceTestFixtures.ts`.
`useChatRoomSpokenAnswer.test.ts` sits beside its hook, and the button hooks are tested through each app's
`SpokenAnswerButton` and `PodcastEpisodeQuestionControls` tests.
`useEditableTopicDraft` reads authoritative settings and overlays proposed changes.
`hooks/useChatAttachments` owns a draft's attachment list, the per-question and keep limits, room mode (nothing kept),
and the kept-file delete. Each app supplies how it reads its own files and shows a line. `lib/chatAttachmentRules`
holds the kind a file reads as, each kind's data url limit and its line, the size estimate checked before a read, and
the shared rejection lines. Its hook tests run in `apps/web/src/components/chat/sharedChatAttachments.test.tsx`.
`lib/imageUpload` holds the avatar types and rejections, the 512-pixel avatar edge, the 2048-pixel attached photo
edge, and `toResizedImage`, the size and format both apps' resizers re-encode a picked image to.
`hooks/useNewTopicDraft` owns the new-topic chat's waiting files: it presets a team page's team, takes the draft at
creation, uploads each file to the created topic with a line for one that did not attach, and deletes each file's
copy on remove, reset, and unmount through the app's `deleteAttachmentFile`. Its tests run in
`apps/web/src/components/chat/sharedNewTopicDraft.test.tsx`. `components/ChatTopicLimitNotice` is the plan's topic
limit above the new-topic composer, with the plans link only where an app supplies one, and
`components/TopicEditorChoice` is the New topic and Edit topic choice between "Do it myself" and Carl, which the web
renders as a dialog and the app as a sheet. `lib/chatCopy`'s `NEW_TOPIC_CHAT_COPY` holds the new-topic chat's name,
placeholders, and opening line.
`lib/topicToolCalls` interprets accepted/rejected tools with injected notice effects; `lib/chatRejectionCopy` keeps
both clients' wording together. `stores/chatConversationStore` scopes selection, proposals, and delayed callbacks by
account and conversation; `lib/chatConversations` holds selection rules, private conversation addressing, names,
alphabetical room ordering, and `toProfileChatContext` for both apps. Reset the account on sign-out.
`lib/chatCopy` holds shared composer, confirmation, empty-room, and completion wording. Account replacement also
clears `chatRoomStore` and its opened-room markers. Member reads can reuse the current account's loaded Team page.

`components/ThinkingLine` owns the stable waiting phrase with app-supplied text rendering. Its `ThinkingLineProps` names
the component-owned props; `ThinkingLineTextProps` remains the shared adapter contract. Both apps consume a `Pick` of
the shared props and retain module-level text adapters. This family is in the adopted component-convention set; other
components remain report-only. `lib/thinkingLines` owns the shared phrase deck and shuffle, moved from web's common
components and utilities. Web retains CSS shimmer; native motion and app activity stay in the mobile adapter.
`lib/chatCopy` also owns individual-message deletion confirmation wording; platform adapters use the web confirmation
dialog and native alert. `lib/chatRoomActions` shares confirmed deletion, accepted history refresh, failure notices, and
retired-conversation guards.

`components/ScrollDownButton` shares the centered latest-message action, visibility, label, and Nightshift classes.
Its adapters supply the browser button or native touch control and the Lucide arrow.
`components/ChatPill` composes the launcher icon, label, action, and optional badge for both apps. Native safe-area
placement and browser portals/player clearance stay in their adapters.

`hooks/useChatRoom` owns posting, access state, and tool events. `hooks/useChatMessagePages` owns room history,
earlier pages, and virtual list indices. The room hook reconciles pending Carl replies
against recovered history and ignores model replies older than the pending question. `lib/chatRoomMessages` deduplicates
and orders rows without dropping loaded metadata. `hooks/useChatRoomStream` binds React lifetime to the controller
in `lib/chatRoomStream`: monotonic cursor, backoff, heartbeat recovery, and retired-connection guards. Apps supply
transport and activity; core imports neither EventSource nor AppState. `useRoomMembers`, `useRoomReply`,
`lib/chatMentions`, and `lib/chatRoomReplies` share member/reply/caret rules. `useLinkPreviewRefresh` and
`useChatRoomLinkPreviews` bound polling to six attempts and retire delayed reads. `lib/chatLinkPreviews` and
`lib/chatMessages` hold portable link/message helpers. Existing `chatRoomStore` owns mention acknowledgement.

`lib/safeChatMarkdown` holds the web's HTTP(S) link predicate and new-topic invitation rule. Recap link safety stays
separate. `lib/nativeChatMarkdown` transforms parsed chat Markdown into safe text segments and labeled table rows:
raw HTML stays literal, rejected links retain their labels, images become links, and incomplete table rows wait.
Apps still guard link actions at the renderer boundary. Shared hook tests use the existing web DOM harness; core's
pure/controller/store tests remain platform-free.

## Shared Feed

`hooks/usePagination.ts` owns table page selection, row slicing, and clamping after the rows or page size change.
`hooks/useRowSort.ts` owns column ordering and `usePaginatedRowSort.ts` returns to page one after sorting.
Web adds its server-rendered row policy; mobile renders the same selection with native page and row-count controls.

`hooks/useTopicFeedState.ts` owns account-keyed Feed reads, optional visitor hydration, filter state, and reheat
generations. Its exported `useTopicFeedFilters` also serves query-free component stories. Apps reset filters when their
navigation changes. Reheat advances only when every requested read succeeds. A known-offline refresh returns
immediately. `hooks/useTopicFindingActions.ts` owns Finding writes and the router-free page handlers. Web keeps its
existing non-optimistic timing. Mobile opts into pending-mutation presentation and acknowledged cache updates across
Home, Topic, and account-scoped search queries. A failed write removes only its tentative change. Writes never retry or
enter an offline queue. Its optional `onChangeConfirmed` callback retains acknowledged edits in a separately mounted
Finding sheet. `keepTopicFindingReactions` writes a saved reaction summary into the same caches with no request, and
page handlers give it to the page's own change callback, so a reopened Finding shows the user's reaction.

`lib/topicFeed.ts` owns Feed/tag selection and Resource-kind reset, and `isUserTopicFeedEmpty`, which both apps' empty
home pages read. Existing Finding filters and sorts keep their bookmark and tie rules. `lib/topicFindingChanges.ts`
applies action fields and unread-count changes without changing source payloads. Its search adapter preserves result
order and metadata while applying the same Finding edits across loaded pages. `lib/topicFeedLabels.ts` owns shared
section, sort, view, tag, and empty-state labels, plus the Finding-view menu options and Team bookmark scopes.
`lib/topicTutorialVideo.ts` owns tutorial openers, event properties, and first-play recording. `lib/activePoll.ts`
serializes requests while an app-supplied activity predicate is true. `lib/scanPoll.ts` supplies the scan backoff shared
by both clients and `toPolledTopicPage`, which keeps the related Topics, reactions, and comment thread that a poll
response leaves out. `lib/topicSchedule.ts` owns schedule options, daily-slot permission, and allowance copy shared by
both Topic forms. `lib/pageViews.ts` sends one view per Topic, profile, or team per web tab or native app runtime,
shared by both apps' Topic, profile, and team screens. `components/ViewerCountLine` reads a profile's or a team's viewer
count on the counts poll and shows it as Visitors through each app's line and count elements. `lib/cardSections.ts`
names the card and the key of a Topic, Podcast Episode, film, or Topic Post card section, the three Featured titles a
profile and a team share, and a team page's four card sections, Featured Films right before Featured Podcasts, and
`components/CardsSection` renders one section of cards, paged or whole, through each app's section, grid, and page
buttons. `lib/profileSections.ts` holds a profile's four Featured sections, Featured Films right before Featured
Podcasts and Featured Posts last with every post of the person, the rows of its rank dialogs for topics, films,
podcasts, and posts, whose pins have no limit, the send of their moves, and which of them the action menu offers.
`lib/rankDialog.ts` holds a rank dialog's rows, a Topic Post as a row, the moves, and the words for the home's pins and
a profile's, and `components/RankDialog` is the list that orders, adds, and removes pins through each app's frame, rows,
and picker. `lib/sourceResults.ts` shares Source footnote ordering, totals, detail labels, and the earlier-findings row.
`lib/topicSources.ts` shares default/custom Source ordering, off states, screening messages, and staged Source summaries
between both apps. `components/TopicSource` exports the shared `TopicSource` row and `TopicDefaultSource` enabled/add
composition. Web supplies its existing DOM badges and tooltips; mobile supplies native Nightshift badges and buttons.
`lib/topicScanRecap.ts` shares the diary fields, missing-entry copy, and copied note Markdown. Shared React components
compose the recap and chart from these rules; platform adapters draw the elements. Web supplies its browser origin when
building Markdown links. Pure tests live beside these modules. Live hook tests use web's React DOM harness in
`apps/web/src/hooks/useTopicFeedState.test.tsx`. Core imports no router, DOM, React Native, native storage, or device
API.

## Tasting Notes

`components/NoteEditor`, `NoteViewer`, `NoteToolbar`, `CreateNote`, `NoteConflictNotice`, `NoteComments`, and
`NoteUnreadBadge` own the composition used by both clients. Their typed platform elements stay at module scope.
The apps supply the enriched HTML library, routing, keyboard layout, native sharing, and their Nightshift controls.
`lib/noteFormats.ts` owns format order, labels, commands, selection ranges, and safe link operations.
`lib/noteLabels.ts` owns visibility descriptions and save/recovery messages. `lib/noteBadges.ts` owns count labels.

`useNoteBodySave` debounces for 1,000 ms, with one request in flight and one pending body. `getDraft` exposes the latest
HTML, original base version, local revision, conflict, and validation failure. `onDraftChange` runs after accepted edits
and save outcomes; native storage persists it immediately. An acknowledgement cannot discard newer text. A conflict
blocks transport but accepts more typing. Only an accepted deliberate Reload replaces that draft. Transport failure
waits for another edit or explicit retry. Size rejection blocks lifecycle retries until the body changes. Unavailable
access retires native content. `retire` fences every late callback and pending dispatch. `lib/noteDrafts.ts` owns pure
edit, acknowledgement, conflict, Reload, and retirement transitions, plus validation of account-owned versioned records.
Native storage and its controller registry stay in mobile.

`useCopyFeedback` owns the clipboard confirmation lifetime shared by copy controls and share dialogs.

`useNoteManagement` shares rename, visibility, and deletion permission gates, serialized writes, failure messages, and
accepted metadata. Apps own their confirmation controls and close behavior.

`useNoteComments` loads on open, retains failed-post text through the shared composition, and applies accepted writes in
place. Native comments open in a sheet from a visible button. Web keeps its wide-screen column and phone-browser sheet.
The editor and reader forward the optional comments-close callback to the platform layout without remounting the body.
`useNoteBadges` polls every 45 seconds while focused and online, and refreshes on foreground and reconnect.
`useNoteRead` runs only after a successful note load. Tentative clearing ends after acknowledgement and refresh; failed
requests retain confirmed counts. Account generations reject late responses from a replaced session.

`lib/safeNoteMarkdown.ts` parses recaps once through the non-UI Markdown entry point. It transforms the AST before
web's `astToJSX` or native's `astToNative` renders it. Never serialize and reparse the safe tree. Only exact stored
HTTP(S) Finding URLs remain links; images disappear, raw HTML stays inert text, and rejected destinations remain
visible. `SafeNoteLink` repeats the final URL guard. All six recap heading levels use the compact display role.
Finding explanations remain plain text. Tasting Note editor headings retain the editor's Karla typography.

## Shared menu pages and forms

`components/DataTable` owns table headings, rows, and totals. Pure domain columns live in
`lib/ownerTopicsTableColumns.ts`, `topicsTableColumns.ts`, `topicScansTableColumns.ts`,
`topicSubscriptionsTableColumns.ts`, `sentInvitesTableColumns.ts`, `teamMembersTableColumns.ts`, and
`teamsMembershipTableColumns.ts`. Each app supplies its link, switch, action, and table elements. Native horizontal
scrolling and a fixed first column belong to the mobile adapter. Web retains its expandable subtables and
server-rendered rows.

`components/AccountBudget`, `AccountFields`, `PlanCard`, `MonthlyBudgetCutoffTable`, `InviteFields`, and `TeamFields`
share page and form composition. `PlanCard` takes the store's price and billing note, a portal action with its label,
and a plan switch for a subscriber, and `AccountBudget`'s payment notice gets the billing provider. `AccountBudget` is a
coffee fund card and a brews card, each opening with its title beside its centered rings: the time left until the
monthly budget resets, or the day's Scans used and the time left until the daily Scan limit resets, and ending with the
plan line beside the plan action each app passes. Each app's `MeterRing` over `components/MeterRing` draws the rings,
whose elements each app supplies, from the UTC math in `lib/utcResets.ts`. `AccountFields` includes the shared
ProfileFields form, with platform identity, photo-toggle, and input elements, and the `Switch` element.
`NotificationsSection` is the account's Notifications section over those elements: `NotificationsCard` over
`toNotificationSwitchStates`, with `NotificationsSection` reading the session's push preferences. Only the app renders
it. `useAvatar` owns upload acknowledgement and session refresh for both File and FormData uploads. `Footer` owns all
footer copy, destinations, and row order for both apps. `lib/spendMeter`, `monthlyBudgetCutoffs`, and
`monthlyBudgetCutoffCopy` own budget labels and checkpoint calculations. `lib/spendMeterStoryFixtures` supplies the same
spend and cutoff examples to both component browsers. `lib/storyFixtures` holds `FIXTURE_DATE`, the date that the web
component browser's fixtures share.

`hooks/useTopicFields`, `useTopicSourceEditor`, `useTopicTeamChoice`, `useTeamFields`, and `useTopicEmails` own the
portable form state. `lib/saveTopic`, `saveTeam`, `teamFields`, `teamInvites`, `topicSourceEditor`, and
`topicTeamChoices` own payloads, validation helpers, retry bookkeeping, and invitation delivery.
The Topic Team selector remembers accepted writes and adds selected Teams before removing existing memberships.
Source recommendations merge into current selections and respect the remaining capacity when their response arrives.
Uploads, file pickers, router destinations, and visible mutation feedback remain app adapters.

`useTeamFields` shares advisory name checks with revision guards. A changed name clears stale errors, and failed
lookups leave authoritative validation to the save endpoint. Live hook tests cover delayed replies and owned names.

`components/TopicSkeleton` owns the shared Topic loading section order: the film's section above the podcast's, the
findings, the comment thread, the Topic Posts, then the info and settings beside the films' list, the podcast
episodes' list, and the history. A Topic known to have no podcast episode leaves out the film, the player, and the
films' list. App adapters supply the header, placeholder cards, columns, and motion/accessibility treatment. Web keeps
its desktop grid and mobile uses a vertical column.

`components/PageSkeleton` owns the Profile, Teams, Activity, Account, Team, and Topic Post loading layouts, including
shared identity, table, and budget placeholders. Browser and native adapters supply the elements each loaded page is
laid out in: the button row, a section with a placeholder title and count, the card, the news card, a row of cards,
and a header's image and title. A Topic Post's loading state takes the page's own `Header`, `BylineRow`, and
discussion card elements, and the Account's says whether its budget lists monthly budget cutoffs. A Team's holds one
section of cards for each of `TEAM_SECTION_VALUES`, then its three tables. Its classes are scanned explicitly by both
app stylesheets.

`components/PageActionMenu` shares page action ordering and global action visibility. `UserMenuItems` shares main
navigation destinations, grouping, selection, and the Admin permission gate, with optional platform badge slots.
`components/AddToAi` and `lib/installDeeplinks` share provider order, labels, instructions, commands, and copy feedback.
The adapters keep DOM/native icons, storage, clipboard, and desktop install URLs out of core.
`hooks/useAccount` loads billing and activity together in an account-scoped query and retains loaded data on refresh.

`stores/podcastEpisodePlayerStore`, `podcastEpisodePlayActions`, and `podcastEpisodeListenStore` own the loaded
Podcast Episode, chapter selection, seek/rate actions, deferred-request retirement, next-episode selection, and
personal listen save interval. `stores/podcastEpisodeSource` holds what the commands act on: which adapter owns each
format, which load and which request is current, and how a source is loaded, released, and reloaded after an audio
error. The player store re-exports its request and media-session functions, which both apps import from the player.
`lib/podcastEpisodeAudio` defines the small audio/status adapter each app supplies.
The player holds one Podcast Episode, one position, and one format. `playTopicPodcastEpisodeVideo` gives the source to
the film, `playPodcastEpisodeAudio` gives it to the audio, each from the same second, and `playPodcastEpisode` keeps
the loaded Podcast Episode's format and plays any other as audio.
`components/TopicPodcastEpisodeVideoPlayer` puts the play button over the film's frame and keeps the captions and
mute choices for the session. Its `isCard` draws each app's `Card` element around the film, the seek bar, the
controls, and its children, which Topic Cinema and the podcast episode page pass and the Video dialog leaves out. The
skips and the speed show before the film is loaded, and their presses go through `skipTopicPodcastEpisodeVideoBy` and
`cycleTopicPodcastEpisodeVideoPlaybackRate`, which start a film that is not loaded.
`stores/podcastEpisodePlayerState` keeps snapshots and subscriptions separate from playback commands. Progress ticks
notify position readers; chapter changes also notify controls. The player store re-exports them.
`hooks/useShownPodcastEpisode` selects the Topic's shown episode and polls a linked recording without autoplay.
Its lifecycle tests use the web's DOM hook harness; its selection rules and player state tests run in core.
`components/UnpublishedPodcastEpisodeCard` draws three states in one frame: a recording podcast episode, a failed one
with the permitted scan control, and, with `isVideoRendering`, a published podcast episode whose film is rendering.
Each app's `ProgressLine` element draws the shimmering line after its emoji, with the words from
`lib/podcastEpisodeCopy.ts`. `components/TopicPodcastEpisodeVideoSection` shows that card through its `RenderingCard`
element in the film player's place while the topic's only film renders, and
`hooks/useTopicPodcastEpisodeVideoRenderingPoll` reads the page again every 30 seconds while the app is focused and
online, for at most four hours, so the film player shows once the film is ready.


Podcast presentation is shared as actual React composition under `components/`: `PodcastEpisodePlayerCard`,
`UnpublishedPodcastEpisodeCard`, `PodcastEpisodeDetails`, `PodcastEpisodePlayButton`, `PodcastEpisodePill`,
`PlaybackControlButtons`, `PodcastEpisodeSeekBar`, `PodcastEpisodeChapters`, `PodcastEpisodeRow`, `PodcastPlayer`,
`PodcastEpisodeTranscript`, `PodcastThemeSongCredits`, `PodcastFeedDialog`, `RemovePodcastEpisodeDialog`,
`PodcastEpisodesCard`, and `PodcastEpisodeChapterTag`. `PodcastEpisodeVideoButton` is the button that opens the Video
dialog and reports its section: a film card's play button on `PodcastEpisodeCard`'s video variant, the card's last
child, which each app's `PodcastEpisodePlayButton` draws centered over the card's image under the label Play film, whose
dialog plays the film once it loads, and a Video pill beside the play pill on a `NewsList` row whose Podcast Episode has
a film, which `lib/newsEvents`' `toNewsEventVideoButton` decides. A film card shows the film's own image from the
summary's `videoPosterUrl`, and only the title in its title row. Its thumbnail size is a play button over the film's
poster, which `lib/podcastEpisodePlayback`'s `toPodcastEpisodePosterUrl` returns for it and for the film player.
`TopicPodcastEpisodeVideoInfoSection` is the film's section of a Topic's info, only for a latest Podcast Episode with a
ready film: a `PodcastEpisodeRow` with that thumbnail as its `playButton`, in its play button's place. Apps inject
controls, links, images, scroll containers, and confirmation renderers; core owns ordering, labels, formatting,
visibility, expansion, and action selection. `lib/podcastEpisodeStories.ts` supplies fictional shared fixtures and an
inert player for both component browsers, without account writes or audio downloads. The season card owns five-row
pagination, selection, season query preservation, and removal visibility. Web supplies its server-rendered overflow
rows; mobile supplies scrolling tabs. Chat chapter tags share their labels and playback action. The pills and the chat
chapter tag own their classes, which both app stylesheets scan explicitly. A pill is at least 24 pixels tall, so it
stays a large enough target with text right above it. Their accessible names start with their visible text.
`lib/podcastEpisodesTableColumns.ts` and `podcastEpisodeChaptersTableColumns.ts` share table values, formatting, and
totals. Web retains its DOM/SSR table renderers; mobile composes the existing shared DataTable.

`hooks/usePodcastEpisodeChapterRating` owns chapter-rating selection, duplicate prevention, and rollback.
`hooks/usePodcastFeed` scopes requests to account/Topic and requires confirmation before resetting a private feed.
`lib/podcastFeed.ts` owns supported app-link construction and reset copy; clipboard and Linking stay in the apps.
`lib/podcastThemeSongLyrics.ts` owns full lyrics and parsed blocks; the matching web module re-exports them.
`useTopicFindingActions` reconciles open episode-page Finding data after a rating or bookmark mutation.

The player accepts one audio adapter and rejects retired load/request events. A replay clears completed state;
seek and rate changes checkpoint immediately. Listens retain one actual-play start per load and the existing
30-second progress-save interval, with account-owned cancellation. Audio sources and persistent storage belong to each
app; core neither resolves signed URLs nor stores protected episode content. Lifecycle adapters pause/unload on
confirmed access loss and sign-out, and the mobile checkpoint saves only resume fields.

`components/TopicPersonalSourcesSection.tsx` uses sender-only confirmation counts to hide empty sections and gates full
item-text reads until expansion in Topic info and Artisanal Blend; `TopicPersonalSourcesContents.tsx` and
`hooks/useTopicPersonalSourcesContents.ts` share flat five-item numbered paging through the existing Pagination
adapters, confirmed deletion, and cache cleanup. `TopicPersonalSourcesSectionStory.tsx` provides both platforms’
fixtures. `ExpandableRow.tsx` owns each inline disclosure, and `PersonalSourceEntryList.tsx` keeps one item open at a
time. `TopicLinkedFinding.tsx` resolves links against the authorized Topic payload.

`PersonalSourceLink.tsx` shares authorized Finding resolution and local opening state through core. Web adapts it to the
existing `TopicResourceInfo` popover; mobile uses its existing sheet. External sources retain the browser icon and only
pending sources show Next brew. `core/lib/topicFindingCopy.ts` supplies the common tooltip and native accessibility
hint.

`TopicInfoSection.tsx` shares labeled information-section composition through core, with thin same-name platform
adapters and paired stories. Topic and Finding details reuse it without importing each other.

`personalSourcesCopy.ts` identifies AI conversation destinations by exact host and distinguishes Claude Code paths.
`personalSourcesConversationStories.ts` supplies fictional platform examples, including unknown destinations and local
agents without a conversation URL. Both component browsers use the same gallery and expanded-item examples.

`components/SearchResultRow.tsx` shares the rank/leading/title with the control beside it/metadata/action composition
used by both search lists and the MCP picker. `TopicSearchResultDetails.tsx` shares Topic count formatting and the
published podcast pill; apps supply controls and platform typography.

`PersonalSourceEntryList.tsx` shares date-only received metadata and sender identity. Platform adapters draw AI provider
marks or a mail icon with the sender address. The redundant transport suffix is omitted.

Personal sources items, private summaries, and annotations have no automatic expiry. Their content remains encrypted
until explicit deletion. Released read contracts retain nullable expiry fields as null. Optional conversation URLs
survive the MCP picker outside matching and open from the shared AI sender label; missing references remain plain
labels.

Personal sources conversation metadata links the complete date, platform icon, and name when a real reference is
supplied. Both apps consume the shared entry list and platform fixtures. A strict existing-chat Codex URI opens the
system app; web references use the existing browser adapter. No entry retention sentence is shown.

## Reactions and comment threads

`components/ReactionRow.tsx` shares one social target's reactions between the web, the mobile app, and the MCP view:
the six types with their counts through `ReactionPicker.tsx`, with the user's own marked. `components/CommentThread.tsx`
shares the thread between the web and the mobile app: the button that opens the composer, the comments newest first,
each a `components/CommentRow.tsx` with its author's controls, the share with the podcast, its body with each stored
mention linked, a Podcast Episode's chapter tag, its own reactions through `ReactionRow`, Reply, and its replies oldest
first. A memoized row with stable handlers from `hooks/useStableCallback.ts` renders only if its own comment changes.
`components/SocialSection.tsx` holds the thread in the collapsible card on a Topic, a Podcast Episode, and a Finding,
with the week's count beside its title, the reaction row left to each page's header, and the shared comment slots at the
card's top right for a user who may share. `components/TopicSharedCommentsSection.tsx` lists the comments a Topic shares
with the podcast in the Topic's sources list, under `TopicPersonalSourcesSection.tsx`. Both render through one
`SocialElements` set per app, typed in `lib/socialElements.ts`, and take their words from `lib/socialLabels.ts`.
`CommentElements` is the part of that set the note thread also renders, so each app has one composer.
`components/TextComposer.tsx` owns the draft for the thread and for the note thread: a failed submit keeps its text, a
second submit waits for the first, and a trailing `@` token suggests users. `lib/podcastEpisodeSocial.ts` builds a
Podcast Episode page's thread props and report subject. `hooks/useSubjectReport.ts`'s `useSubjectReportFlag` is a report
flag's state, label, and press, and `SocialReportControl.tsx` keeps its own read, since a row already lists its reported
state.

`hooks/useReactions.ts` holds the summary a page came with, reads it for a list that came without one, and replaces
it with the summary each save returns. A `ReactionClient` says how a platform reaches the routes: the api by
default, and a tool call in the MCP view. `ReactionRow` shows the pressed type until the save returns.
`hooks/useCommentThread.ts` starts from the page's first page or reads it through a query cached for 30 seconds,
pages older comments and a comment's later replies, and keeps only acknowledged posts, edits, deletes, reactions, and
shares, with the shared comment slots each write returns. A reload of the same target merges into the loaded comments
and keeps the shown count, and each write marks the cached page out of date. `hooks/useFindingLinkPreview.ts` caches a
Finding's link preview the same way for a minute. `hooks/useCommentThreadViewEvent.ts` sends one view event per showing
through the app's own visit analytics. Their tests render through plain elements in
`apps/web/src/components/social/socialTestHarness.tsx`.

## Topic images and the home

`components/TopicImage` shows a topic's image at a size through the Nightshift contract, picking the 1x or 2x file.
`components/TopicImageLink` wraps that image in each app's link to the page of what it shows, a topic's, a podcast
episode's, or a Topic Post's, and renders the plain image if that page is the one open. A link with no label is for a
pointer or a touch alone, beside a title that opens the same page. `lib/pagePaths` holds `isCurrentPagePath`, which
compares a link's path with the open page's path without the query, the hash, and the end slash.
`components/TopicCard` and `PodcastEpisodeCard` are the home's and the Topics page's cards, and `TopicImageEditor` is
the editor's image block for a topic or a podcast episode (Regenerate with an image prompt and an upload from the
image), each app supplying its elements and its file picker. `hooks/useTopicImageRender` polls a render until it
finishes. `lib/topicImageEditor` holds the block's labels, the image dialogs' titles, the count line, and the upload
check. `hooks/usePodcastEpisodeFields` is the Edit podcast form's title, description, and save, and
`lib/podcastEpisodeEditor` its labels and the podcast episode's image as the block edits it. `lib/homeFaces` holds the
home's sections in the order both homes show them, each week's new cards right after their Featured cards, the three
steps, and the empty payload. `lib/sectionOrder.test.ts` fails if a film section leaves its place right before the
podcast section it pairs with, on the home or either app's profile, team, or topic page, if `HOME_SECTIONS` or either
app's home leaves the home's order, if a profile page writes a second Topic Post section, or if a team page's card
sections leave a profile's titles and order.
`lib/podcastEpisodeHomeOrder` decides who sees the podcast episode page's Featured podcasts and Featured films.

Topic Posts: `components/TopicPostCard`, `TopicPostInfo`, `TopicPostsSection`, `TopicPostEditor`, and
`TopicPostPage` are the shared Topic Post components, each over its app's elements. `TopicPostPage` shows the editor
for a draft and for a published post its author edits inside its edit time, and the post otherwise. `TopicPostInfo`
is the post's info popup, which follows the Topic's: it takes the post's id and title, reads the post through
`fetchTopicPost` once it opens, under the mobile screen's `topic-post` cache key, unless its page passes the post, and
shows the author with the reactions and Share, the post's image, the discussion's play button with the line from
`toTopicPostDiscussionDateText`, the Topic, and the summary. A row opens it too, through `isOpen` and `onOpenChange`.
Its Share element takes the post, and `toTopicPostShare` in `lib/topicPosts` returns the topic and the post that each
app's `ShareTopic` shares. `toInviteDestination` in `lib/inviteRejections` opens the Topic Post an accepted topic
invite names.
`hooks/useRichTextEditor.ts` holds the editor state a note and a Topic Post share: the format state, the selection,
the link at the caret, and the baseline that tells the editor's first rendering of a stored body from an edit.
`hooks/useTopicPostSave.ts` saves a post's title and body together once typing stops, one save at a time at the
version the last save returned, and stops on a newer version or a post past its edit time. `lib/topicPosts.ts` holds
the Topic Post copy, the word count's label, and the post's editable image, and `lib/topicPostStories.ts` the
fixtures both apps' stories show. `components/ProfileHeader` is the profile page's shared header.
`components/cardElements` includes the reaction count, which the topic card shows at the right of its tags' row or,
with no tag, its byline's row, the podcast episode card at the right of its detail line, and the Topic Post card at
the right of its date row. `TopicImageEditor` edits a third kind of image, a Topic Post's, and a fourth, a film's own
image (`topicPodcastEpisodeVideo`), in the one layout: its `Image` element takes an `aspectRatio`, 16:9 for a film
and 3:2 for every other image. `lib/podcastEpisodeEditor` builds the film's editable image from the podcast episode's
page, and holds the Edit film label and who sees the option on a podcast episode page
(`isTopicPodcastEpisodeVideoEditShown`) and on a topic page, for the topic's latest film
(`toTopicPageEditedPodcastEpisode`). `hooks/useTopicPodcastEpisodeVideoEditableImage` reads the podcast episode's page
for the topic page's Edit film. `lib/podcastEpisodeHomeOrder` says who sees the podcast episode page's Home and
Featured rank options for podcasts and films.

Topic Post Discussions and the Topic Post chat: `components/TopicPostDiscussionCard` shows a post's discussion on its
page, with the shared podcast play button, the line from `lib/topicPostDiscussions.ts`, and Regenerate with a note
for whoever may record it. The card's name opens and closes the recording's transcript, which starts closed:
`toTopicPostDiscussionTranscript` returns the turns of a recording that plays, and
`components/PodcastEpisodeTranscriptTurns` lists them, each after its speaker's name, as it lists a podcast episode
transcript's. `hooks/useTopicPostDiscussion.ts` holds the form, starts a recording, and reads the post
again while one records. A discussion plays in the shared podcast player as a `PodcastEpisode` built by
`toTopicPostDiscussionPodcastEpisode` in contracts: `stores/podcastEpisodeListenStore.ts` saves no progress for it,
and `stores/podcastEpisodePlayerStore.ts` plays nothing after it. `TopicPostPage` places the card between the header
and the body, and passes its title the app's `MentionBadge` element while the reader has an unseen Comment Mention
in the post's thread. `stores/topicPostChatStore.ts` names the Topic Post whose
page is open, through `useRegisterChatTopicPost` while the page shows and `registerChatTopicPost` each time a mobile
screen takes focus, which `toPrivateChatPage` in `lib/chatConversations.ts` adds to the topic's chat page, so each
question sent there names the post. `toDefaultChatId` and `toPrivateChatId` open the topic's private chat for an open
post, `toPrivateChatPlaceholder` in `lib/chatCopy.ts` is the question box's line, the Topic Post chat's while a post
is named, and `toPrivateChatLabel` with `toPrivateChatIdLabel` names a private chat for what it is about: the open
post, else its Topic, else its team. `components/TopicPostTag` is the tag under such a question, linked to the post
while it exists. `lib/topicPosts.ts` also holds `isTopicPostUrlStale`, the rule that moves a post page's url to the
post's titled path, `toTopicPostImageReport`, what a report of a post's image names, and `isTopicPostPinnable`, the
rule that a published post of a public topic takes a pin, which both apps' post pages read for their rank options.
