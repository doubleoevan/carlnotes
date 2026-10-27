# packages/core/

`@carlnotes/core`, the DOM-free components, stores, hooks, and lib that web and mobile import as `@carlnotes/core/<folder>/<name>`.
It imports `@carlnotes/contracts`, `@carlnotes/client`, `react`, and `@tanstack/react-query`, and the non-UI `markdown-to-jsx/markdown` parser.

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

## Shared chat

`lib/chatTurns.ts` owns turn identities, attachments, and stopped/finished turn handling.
`lib/chatHistoryTurns.ts` selects the history sent with the next question, retaining tool-only turns.
Web keeps import-compatible re-exports; both apps use the same implementation and existing contracts/client compaction.
Core tests cover interrupted and rejected turns, alongside the unchanged web regression tests.

`components/ChatAuthor`, `ChatTurnBlock`, `ChatRoomMessageBubble`, `ChatRejectionNotice`, and `TopicDraftCard` own
shared author, message, rejection, and draft field composition. Apps supply stable element adapters, Markdown, links,
and action controls. `lib/chatStoryFixtures.ts` supplies fictional conversations to both component browsers.

`hooks/useChatConversationLoad` owns history/access gates and proposal restoration; `useTopicChat` owns send, stop,
retry, clear, and tool outcomes. Browser voice, attachments, new-topic creation, and podcast effects remain injected
web extensions. `useEditableTopicDraft` reads authoritative settings and overlays proposed changes.
`lib/topicToolCalls` interprets accepted/rejected tools with injected notice effects; `lib/chatRejectionCopy` keeps
both clients' wording together. `stores/chatConversationStore` scopes selection, proposals, and delayed callbacks by
account and conversation; `lib/chatConversations` holds selection rules, private conversation addressing, names,
alphabetical room ordering, and `toProfileChatContext` for both apps. Reset the account on sign-out.
`lib/chatCopy` holds shared composer, confirmation, empty-room, and completion wording. Account replacement also
clears `chatRoomStore` and its opened-room markers. Member reads can reuse the current account's loaded Team page.

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
`lib/activePoll.ts` serializes requests while an app-supplied activity predicate is true. `lib/scanPoll.ts` supplies the scan backoff shared by both clients.
`lib/topicSchedule.ts` owns schedule options, daily-slot permission, and allowance copy shared by both Topic forms.
`lib/topicViews.ts` sends one view per Topic per web tab or native app runtime, shared by both Topic screens.
`lib/sourceResults.ts` shares Source footnote ordering, totals, detail labels, and the earlier-findings row.
`lib/topicSources.ts` shares default/custom Source ordering, off states, and screening messages between both Topic info views and the web editor.
`lib/topicScanRecap.ts` shares the diary fields, missing-entry copy, and copied note Markdown. Shared React components
compose the recap and chart from these rules; platform adapters draw the elements. Web supplies its browser origin
when building Markdown links.
Pure tests live beside these modules. Live hook tests use web's React DOM harness in `apps/web/src/hooks/useTopicFeedState.test.tsx`.
Core imports no router, DOM, React Native, native storage, or device API.

## Tasting Notes

`components/NoteEditor`, `NoteStatic`, `NoteToolbar`, `CreateNote`, `NoteConflictNotice`, `NoteComments`, and
`NoteUnreadBadge` own the composition used by both clients. Their typed platform elements stay at module scope.
The apps supply the enriched HTML library, routing, keyboard layout, native sharing, and their Nightshift controls.
`lib/noteFormats.ts` owns format order, labels, commands, selection ranges, and safe link operations.
`lib/noteLabels.ts` owns visibility descriptions and save/recovery messages. `lib/noteBadges.ts` owns count labels.

`useNoteBodySave` debounces for 1,000 ms, with one request in flight and one pending body. `getDraft` exposes the
latest HTML, original base version, local revision, conflict, and validation failure. `onDraftChange` runs after
accepted edits and save outcomes; native storage persists it immediately. An acknowledgement cannot discard newer
text. A conflict blocks transport but accepts more typing. Only an accepted deliberate Reload replaces that draft.
Transport failure waits for another edit or explicit retry. Size rejection blocks lifecycle retries until the body
changes. Unavailable access retires native content. `retire` fences every late callback and pending dispatch.
`lib/noteDrafts.ts` owns pure edit, acknowledgement, conflict, Reload, and retirement transitions, plus validation of account-owned versioned records. Native storage and its controller registry stay in mobile.

`useCopyFeedback` owns the clipboard confirmation lifetime shared by copy controls and share dialogs.

`useNoteManagement` shares rename, visibility, and deletion permission gates, serialized writes, failure messages, and accepted metadata. Apps own their confirmation controls and close behavior.

`useNoteComments` loads on open, retains failed-post text through the shared composition, and applies accepted writes
in place. Native comments sit below the note. Web keeps its wide-screen column and phone-browser sheet.
`useNoteBadges` polls every 45 seconds while focused and online, and refreshes on foreground and reconnect.
`useNoteRead` runs only after a successful note load. Tentative clearing ends after acknowledgement and refresh;
failed requests retain confirmed counts. Account generations reject late responses from a replaced session.

`lib/safeNoteMarkdown.ts` parses recaps once through the non-UI Markdown entry point. It transforms the AST before
web's `astToJSX` or native's `astToNative` renders it. Never serialize and reparse the safe tree. Only exact stored
HTTP(S) Finding URLs remain links; images disappear, raw HTML stays inert text, and rejected destinations remain
visible. `SafeNoteLink` repeats the final URL guard. All six recap heading levels use the compact display role.
Finding explanations remain plain text. Tasting Note editor headings retain the editor's Karla typography.

## Shared menu pages and forms

`components/DataTable` owns table headings, rows, and totals. Pure domain columns live in `lib/ownerTopicsTableColumns.ts`,
`topicsTableColumns.ts`, `topicScansTableColumns.ts`, `topicSubscriptionsTableColumns.ts`,
`sentInvitesTableColumns.ts`, `teamMembersTableColumns.ts`, and `teamsMembershipTableColumns.ts`. Each app supplies its link, switch, action, and table elements. Native horizontal scrolling
and a fixed first column belong to the mobile adapter. Web retains its expandable subtables and server-rendered rows.

`components/AccountBudget`, `AccountFields`, `PlanCard`, `MonthlyBudgetCutoffTable`, `InviteFields`, and `TeamFields`
share page and form composition. `AccountFields` includes the shared ProfileFields form, with platform identity,
photo-toggle, and input elements. `useAvatar` owns upload acknowledgement and session refresh for both File and
FormData uploads. `Footer` owns all footer copy, destinations, and row order for both apps.
`lib/spendMeter`, `monthlyBudgetCutoffs`, and `monthlyBudgetCutoffCopy` own budget labels and checkpoint calculations.

`hooks/useTopicFields`, `useTopicSourceEditor`, `useTopicTeamChoice`, `useTeamFields`, and `useTopicEmails` own the
portable form state. `lib/saveTopic`, `saveTeam`, `teamFields`, `teamInvites`, `topicSourceEditor`, and
`topicTeamChoices` own payloads, validation helpers, retry bookkeeping, and invitation delivery.
The Topic Team selector remembers accepted writes and adds selected Teams before removing existing memberships.
Source recommendations merge into current selections and respect the remaining capacity when their response arrives.
Uploads, file pickers, router destinations, and visible mutation feedback remain app adapters.

`useTeamFields` shares advisory name checks with revision guards. A changed name clears stale errors, and failed
lookups leave authoritative validation to the save endpoint. Live hook tests cover delayed replies and owned names.

`components/TopicSkeleton` owns the shared Topic loading section order. App adapters supply the header, placeholder
cards, columns, and motion/accessibility treatment. Web keeps its desktop grid and mobile uses a vertical column.

`components/PageSkeleton` owns the Profile, Teams, Activity, Account, and Team loading layouts, including shared
identity, table, and budget placeholders. Browser and native adapters supply only elements, animation, and
accessibility. Its classes are scanned explicitly by both app stylesheets.

`components/PageActionMenu` shares page action ordering and global action visibility. `UserMenuItems` shares main
navigation destinations, grouping, selection, and the Admin permission gate, with optional platform badge slots.
`components/AddToAi` and `lib/installDeeplinks` share provider order, labels, instructions, commands, and copy feedback.
The adapters keep DOM/native icons, storage, clipboard, and desktop install URLs out of core.
`hooks/useAccount` loads billing and activity together in an account-scoped query and retains loaded data on refresh.
