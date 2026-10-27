# Design

## Context

See [proposal.md](proposal.md) for the scope and motivation. The web's chat panel already uses `packages/client/chatClient.ts` and `chatRoomClient.ts`. Most conversation behavior is portable, but its hooks currently import browser UI, panel state, attachment types, and voice helpers. Copying those hooks into mobile would create two implementations of the same conversation.

The repository uses Expo 58, React Native 0.88, and shared Nightshift contracts, tokens, and portable React components. Mobile configures the existing API client with its session cookie header and device headers. Core can depend on contracts, client, and portable React; it cannot import either app, browser globals, native globals, routing, or toast implementations.

Existing API authorization, conversational confirmation, history compaction, and room event formats remain authoritative. Room events deliver stored messages and Topic tool outcomes; they do not provide the private answer's token stream. Native room behavior follows that existing distinction.

## Goals / Non-Goals

**Goals:** Move portable behavior before adding native consumers; preserve existing web tests and behavior; share actual presentation composition where element adapters suffice; keep transport, keyboard, routing, and Markdown rendering in the appropriate app.

**Non-goals:** No new API, database migration, model prompt, automatic request replay, conversation cache in AsyncStorage, or universal networking framework. No new voice, attachment management, podcast chat, pricing UI, global badge subscription, or native new-topic chat. Existing web features stay in place.

## Decisions

### 1. Extract the existing modules into core, retaining their names

Use the same filenames for the same responsibility. Retain thin web wrappers or re-exports where existing imports and tests need them; they must not retain duplicate business logic. Put effects behind narrow callbacks or existing platform elements, instead of introducing a second state architecture.

| Current web module | Shared destination and responsibility | App responsibility retained |
| --- | --- | --- |
| `chatTurns.ts` | `packages/core/lib/chatTurns.ts`: turn identities, stopped/finished turns, retained tool-only answers | No platform dependency |
| `chatHistoryTurns.ts` | `packages/core/lib/chatHistoryTurns.ts`: history construction and rejection filtering | Existing compaction functions stay in contracts/client |
| `topicToolCalls.ts` | `packages/core/lib/topicToolCalls.ts`: parse tool outcomes, proposal/cancel/save transitions, outcome notices | Toast delivery and navigation callbacks |
| `chatRejectionCopy.ts`, text in `ChatTopicLimitNotice.tsx` | `packages/core/lib/chatRejectionCopy.ts`: rejection and quota wording | Web plans link, voice notices, and native notification presentation |
| `useChatConversationLoad.ts` | `packages/core/hooks/useChatConversationLoad.ts`: loading, permission gates, history and proposal restoration, stale-request protection | Effects provided by the app; browser `File` types stay out |
| `useTopicChat.ts` | `packages/core/hooks/useTopicChat.ts`: supported send, stop, retry, clear, turn updates, and tool handling | Web voice, attachment preparation, new-topic/podcast extensions, and navigation; native lifecycle cancellation |
| `useEditableTopicDraft.ts` | `packages/core/hooks/useEditableTopicDraft.ts`: authoritative Topic loading and proposed overlay | Route links and UI rendering |
| Portable parts of `chatPanelStore.ts` | `packages/core/stores/chatConversationStore.ts`: selected conversation identity and edit state; shared selection rules | Web panel width/open state, `window`, and router integration |
| `useChatRoom.ts` | `packages/core/hooks/useChatRoom.ts`: page loading, posting, reconciliation, message state, permissions, tool results | Transport attachment, native/web list mechanics, web voice |
| State/recovery in `useChatRoomStream.ts` | `packages/core/lib/chatRoomStream.ts`: highest cursor, deduplication, connection-generation guards; use existing `streamReconnect.ts` | Each app keeps `useChatRoomStream.ts` for EventSource and lifecycle effects |
| `useRoomReply.ts` | `packages/core/hooks/useRoomReply.ts`: selected/default reply target and deleted-target cleanup | DOM/native composer focus |
| Portable logic in `MentionSuggestionList.tsx` and `ReplyToDropdown.tsx` | `packages/core/lib/chatMentions.ts` and `chatRoomReplies.ts`: matching, insertion, target choices, quoted context | Caret events, keyboard commands, anchored selection UI |
| `useLinkPreviewRefresh.ts`, `useChatRoomLinkPreviews.ts` | Same names in `packages/core/hooks/`: bounded preview refresh; portable link detection in `lib/` | Rendering existing preview cards and safe navigation |
| `ChatMarkdown.tsx` safety helpers | `packages/core/lib/safeChatMarkdown.ts`: `isSafeHref`, invitation phrase, special-link rule | Streamdown on web; enriched Markdown on native |

Reuse `packages/core/stores/chatRoomStore.ts` for room summaries and mention acknowledgement. Do not build a parallel room list. Do not move `compactChatAnswer`, `toSentToolCalls`, or the client's existing history-boundary logic out of their current shared packages.

Conversation identity is scoped by authenticated account plus private Topic or Team/optional-Topic room identity. Edit state belongs to that identity; switching rooms must never display another room's proposal. Late loads, credentials, events, and mutation completions are ignored after their generation is retired. Account reset clears this state along with the existing room store.

**Alternative considered:** copying web hooks into mobile would be initially shorter but violate the parity requirement and duplicate permission, history, and tool handling. A large new chat controller would add unnecessary abstraction. Extract the existing hooks and small pure helpers instead.

### 2. Share presentation composition and keep native rendering explicit

Extract the field order, conditional sections, labels, and proposal presentation of `TopicDraftCard.tsx` into `packages/core/components/TopicDraftCard.tsx`. Both apps supply links, text, stack, scroll, and action elements. Use stable module-scope element adapters, following the existing core component pattern.

Apply the same approach to portable author/message composition in `ChatAuthor`, `ChatTurnBlock`, `ChatRoomMessageBubble`, and rejection notices. Keep actual shared pieces wherever their children and data decisions are identical; native text, virtual lists, composer selection events, and Markdown remain app adapters. Share action descriptors, permissions, labels, and Lucide icon names even where an anchored native menu needs different markup. Record the final extraction boundaries in the guides and completion report.

This is actual component reuse in addition to shared state. Do not rebuild the draft fields or message action logic in an independent mobile component. Do not import from `apps/web` into mobile or core.

**Alternative considered:** a WebView around the web panel would reuse DOM but complicate authenticated streaming, keyboard behavior, and native navigation. The requested native renderer and existing universal component architecture make small element adapters the better fit.

### 3. Reuse private streaming through the configured Expo fetch

Keep `sendChatTurn` and its NDJSON body reader in `@carlnotes/client`. It already merges configured headers, reads `response.body.getReader()`, incrementally decodes text, dispatches answer/tool callbacks, and accepts an AbortSignal. Mobile supplies text turns with no new attachments and `isSpoken: false`.

The installed Expo 58 matches the current Expo documentation: its global fetch on iOS and Android is `expo/fetch`, which supports streaming response bodies. The repository has no `EXPO_PUBLIC_USE_RN_FETCH` opt-out. This design relies on that default, not a buffered React Native fetch or a second private-chat transport. Keep the native setup free of that opt-out; test the actual development build before accepting streaming. [Expo fetch documentation](https://docs.expo.dev/versions/latest/sdk/expo/)

Add a transport regression for split UTF-8/NDJSON chunks, tool callbacks, a missing response body, errors, and abort before/after text. Verify native abort errors reach the client's existing stopped result; broaden only its abort classification if the native runtime requires it. Test that the first visible text arrives before completion, instead of merely asserting a final answer exists.

Native screen close, backgrounding, and account changes abort its active private request. Returning reloads persisted server history before sending again. A partial response follows `toFinishedChatTurns`; a tool-only accepted save remains visible. This native lifecycle adapter must not change the web's existing behavior when its panel is closed. Never retry a POST automatically after a network interruption.

### 4. Use react-native-sse only for the room transport

Add `react-native-sse` to mobile. It provides an XMLHttpRequest-based EventSource implementation, custom event names and headers, explicit close/listener cleanup, and optional built-in retry. It needs no additional native networking module. Use `pollingInterval: 0` so the existing shared backoff policy owns reconnection. AppState handling must be explicit. [Library documentation](https://github.com/binaryminds/react-native-sse)

Pin version 1.2.1 and apply `patches/react-native-sse@1.2.1.patch`: export the EventSource constructor from its
CommonJS entry point and emit `done` when XHR reaches DONE. The upstream implementation otherwise emits no clean-EOF
notification when polling is disabled. A fake-XHR test exercises the installed library, headers, EOF, teardown, and
retired 401 callbacks. This is a JavaScript patch; enriched Markdown is the dependency that requires the native rebuild.

Build the endpoint with `toApiUrl(toChatRoomEventsUrl(topicId, teamId, afterChatMessageId))`; the room helper alone returns a relative URL. Obtain headers from the same mobile request settings used by `configureApiClient`, resolving the current session for every connection. Do not put a session token in the URL or bypass device headers. Expose/reuse the current unauthorized handler for this transport, since SSE does not pass through `fetchApi`.

The native `useChatRoomStream.ts` adapter follows this lifecycle:

1. Load `fetchChatRoomMessages` for the selected room. Distinguish no access from a transient failed read. Seed the shared cursor from the greatest message ID, not the last rendered row.
2. Open one SSE connection with the current headers and cursor. Register the existing `message`, `topicToolCalls`, and `ping` events plus open/error/completion handling.
3. Merge messages by ID and advance the cursor monotonically. Keep tool events distinct from messages. Earlier-page loading never lowers the live cursor.
4. On transient error, server completion, or a stale heartbeat, close and remove listeners, then reconnect using `toReconnectStreamDelayMs` and the existing stale-stream interval. No browser/library retry loop runs alongside it.
5. On background, screen close, room switch, or logout, cancel timers and close listeners/connection. Reject any delayed credential lookup or callback for the retired generation.
6. On foreground, reconcile current history and reopen only the selected room. Treat confirmed 401/access denial through the existing account/access flow, without an infinite reconnect loop.

The shared hook must preserve the web's initial load, virtual-list indexing, and reconnect behavior. The server currently does not broadcast delete/clear as dedicated SSE events. Accepted local operations reload history; foreground reconciliation handles changes while inactive. Do not promise immediate cross-client deletion synchronization without an API change.

**Alternatives considered:** relying on a global EventSource is not available in native; polling loses the existing live room behavior; adding another parser over a fetch stream duplicates a library's transport work. `react-native-sse` with app-owned recovery fits the current protocol and headers.

### 5. Use enriched Markdown with a deliberate chat safety adapter

Add `react-native-enriched-markdown` in a version compatible with React Native 0.88. Its current compatibility table includes that runtime; it uses native rendering and requires a new development build. Use `EnrichedMarkdownText` in GitHub flavor, streaming mode while an answer is active, with progressive code/table handling and Nightshift `markdownStyle`. Respect text scaling and reduced motion. The library documents `streamingAnimation` and `streamingConfig`; do not invent a Streamdown-compatible `isAnimating` prop. [Renderer README](https://raw.githubusercontent.com/software-mansion/enriched-markdown/main/packages/react-native-enriched-markdown/README.md), [streaming API](https://raw.githubusercontent.com/software-mansion/enriched-markdown/main/docs-md/MARKDOWN_STREAMING.md)

Keep safety separate from visual parsing:

- Move the existing `isSafeHref` and new-topic phrase/link policy into `safeChatMarkdown.ts`, beside `safeNoteMarkdown.ts`. Web imports/re-exports the helpers so its existing tests and behavior stay intact.
- Chat permits HTTP(S) links; scan recaps permit only exact stored Finding links. Do not broaden the recap policy or serialize/reparse its safe AST.
- Before native rendering, use a parse-aware chat transformation based on the already shared Markdown parser to keep raw HTML literal, reduce images to safe link text, and remove link actions from rejected destinations. Preserve code spans/fences and readable labels. Do not use a global regular-expression replacement that damages code or autolinks.
- The native adapter emits safe Markdown text segments and structured table rows. Serialize only the supported parsed Markdown nodes with literal text escaped; unknown or incomplete nodes become literal text. Native reparsing of these chat segments gets adversarial tests, including entity-encoded and split destinations. This is a new chat adapter, not a replacement for the recap AST renderer.
- Intercept both link press and long-press using the shared predicate; disable automatic link previews and editable task-list behavior. Reject unsafe URLs before calling the system opener. Do not let renderer defaults open URLs or render raw HTML/video.
- Web still turns “Give Carl a topic. You know the one.” into its special action. Mobile leaves both the phrase and explicit `#new-topic-chat` destination as plain text.

The library's default HTML/media behavior is not the safety boundary. Check the above behavior in stories and on a rebuilt native client before connecting production history. The API exposes link callbacks and preview controls; those alone do not replace input transformation. [Renderer API](https://raw.githubusercontent.com/software-mansion/enriched-markdown/main/docs-md/API_REFERENCE.md)

**Alternative considered:** rendering unmodified answer text through native Markdown would depend on defaults that differ from the web's HTML and image rules. Reusing the recap renderer would apply the wrong link policy and would not satisfy the requested streaming renderer.

### 6. Transform generated tables without changing domain tables

The [Mobile page](https://app.notion.com/p/3c462400378d81a4b82efc175f03c807), read October 27, 2026, says wide generated tables become row cards, with column labels retained. Its content rule applies to Carl's answer content. The existing mobile fixed-first-column tables remain appropriate for structured app pages and are outside this change.

Use the parsed table blocks from the safe chat adapter to render cards per row on mobile. Choosing this for all chat tables avoids a layout flip halfway through streaming or at larger text sizes. Preserve column order, empty cells, inline formatting, safe links, and repeated row values. Incomplete rows remain buffered or literal pending content; they must not appear as complete records. The native library's built-in horizontal table scrolling is not used for these blocks.

The Mobile page's upstream cap on generated Finding columns does not authorize changing model prompts for chat. Keep the web table structure and actions. The user-approved styling refinement applies Nightshift card/header/border/hover colors to web Markdown tables and the matching card fill to native row cards, in light and dark.

### 7. Keep Topic edits on the server's confirmation path

`useEditableTopicDraft` reads the current Topic and overlays a validated proposal. Preserve the web card's order: Name, Carl's Prompt, Tags, Frequency, Max findings, optional Podcast, Visibility, optional Team, Invites, and Sources. Use existing labels, schedule conversion, default Source names, links, and empty values. A proposal to change one field must not hide the others or fill unspecified settings with defaults.

The card is a preview, not a form or save button. The person replies in chat; Carl's server-side tool performs an authorized save. A successful outcome clears the overlay, signals Topic changes, and reloads the authoritative Topic. Cancellation and local preview dismissal follow the web transitions. Denied/failed reads never manufacture an editable draft.

In a room, proposal/cancel events apply to the intended `proposedToUserId`; save outcomes refresh the relevant Topic for everyone. Another member saying yes must not satisfy the proposer's confirmation. Retain the API's gates even when the UI has already hidden an action.

The current tool/result inventory is:

| Tool or outcome | Web behavior today | Mobile behavior |
| --- | --- | --- |
| `proposeTopicEdit` / `proposedTopicEdit` | Opens editing and overlays a validated proposal | Same shared draft card and state; no local mutation |
| `cancelTopicEdit` / cancellation outcome | Clears the proposed overlay while retaining the editing context | Same transition and conversation text |
| `updateTopicPrompt`, `updateTopicFields` | Save result/rejection notice; clear proposal and refresh on acceptance | Shared tool handling, native notice, authoritative refresh |
| `addSource`, `removeSource` | Save result/rejection notice and refreshed Sources | Same outcome text and Sources list; preserve server-provided cost context |
| `topicSaves` | One success notice per accepted operation | Same notices and Topic-change signal |
| `topicSaveRejections` | Error notice per rejected operation | Same notices, without claiming a save |
| `chatToolCalls` | Retained in history/compaction, including tool-only answers | Same history and retention; no invented extra card |
| `searchWeb` | Result informs Carl's answer; no separate tool card | Same answer behavior and normal safe link previews |
| `openNewTopicChat` / `isNewTopicChatOpened` | Opens the new-topic flow | Explain that new-topic chat is available on web; stay in the current conversation |
| `draftTopic`, `suggestSources`, `proposeNewTopic`, `createTopic`; `topicDraft`, `createdTopicId` | New-topic preview/creation and subsequent navigation | New-topic flow remains web-only; shared extraction preserves it, and native does not offer it or synthesize a new Topic |

Link preview cards are content metadata, not tool calls. Reuse their existing card contract and bounded refresh behavior; represent attachment metadata as named chips only. Neither exception should drop the surrounding message text.

### 8. Wire one native conversation screen with web-equivalent actions

Use `apps/mobile/src/components/chat/ChatScreen.tsx` alongside its native adapters, following the existing `components/note/NoteScreen.tsx` structure and retaining web component filenames for the same roles. Topic and Team route entries under `app/topics/[topicId]/chat.tsx` and `app/teams/[teamId]/chat.tsx` identify the conversation; they do not contain message bodies or credentials. Reuse the app's existing navigation and safe-area layout, with a top-right Close action and native back behavior.

The user-approved global launcher replaces separate Topic/Team buttons. Core's `ChatPill` owns icon/label/action composition for both clients; `ChatPanelWidget` adapts the button, and Nightshift's `coffeeCup.ts` supplies the shared cup/saucer paths. Native `AppChatPanel` places it 12 points inside the right and bottom safe-area edges on every signed-in screen. It hides while chat or the keyboard is open. Sheets appear above it. Footers and note controls reserve clearance. `app/chat.tsx` opens the shared default room on pages without context; with no available room, it offers private Topics from the existing Feed, or a Browse topics action when empty. New-topic chat stays deferred. Topic and Team note routes retain their parent conversation. The launcher uses the web's icon and default-room selection rule. A Team page opens its own room (`topicId: null`). The selector offers private Topic chat and available rooms with the same labels, avatars, and checked state. It does not add a native new-topic option. Choose only rooms returned for the current account; do not guess membership from a Topic's public visibility.

The user chose a full-width native sheet for the conversation selector. Reuse `ChoiceSelect` with its sheet presentation and the existing `Sheet` focus/dismissal behavior. Its orange `ScrollIndicator` exposes overflow. Put **Private chat** first with Carl's shared portrait, then rooms in the same alphabetical order as web. Core's `toChatRoomMenuOrder` owns ordering and `toProfileChatContext` owns Profile-page room preferences. Native `branding/HostAvatar` supplies the shared portraits to both author composition and menu choices. Compact reply and form choices remain dropdowns.

Use the existing native virtualized list infrastructure. Keep the composer above the keyboard with a multiline input, Send, and Stop only during private generation. Preserve scroll position during earlier-page insertion and while reading above the end; an accessible latest-message action resumes following. Reuse existing copy, safe link/preview, retry, reply, and action primitives. Do not add microphone, speaker, attachment, or podcast controls.

Room mention suggestions share matching/insertion logic, include Carl and eligible members, and preserve text around the native caret. Keep the web's @all/Carl/member reply-target semantics, quoted parent context, cancellation, and deleted-target cleanup. Posting uses `sendChatRoomMessage`; it does not create a second private turn or fabricate a persisted message while waiting for SSE. Failure retains the unsent text and reply target.

Delete-own and leader/admin moderation use current API gates. Preserve the web's immediate individual-message deletion and confirmed room clearing; private clear also requires confirmation. The older Team chat specification emphasizes leaders; the current web/API also expose administrators. This proposal preserves that implemented permission instead of changing authorization. Opening a room calls `sendChatMentionsViewed` and `markChatRoomOpened`; broader live badges remain separate.

Use shared rejection text: budget (“Carl is staring at an empty mug.”), rate limit (“Carl needs a minute to catch up. Ask again shortly.”), forbidden, failed, and Topic-limit notices. The web owns its plans link. Native omits that link and dependent upsell text, keeping useful quota guidance grammatical. Topic quota remains a creation gate, not a new block on existing Topic chat.

### 9. Verify both clients and document the actual boundaries

Keep existing web chat test assertions and public imports unchanged. Add core tests for extracted history/tool transitions, draft overlays, loading races, room cursors/reconciliation, mentions/replies, and shared safety/copy. If a web wrapper is needed to preserve its public imports, it delegates instead of duplicates.

Test native transport through injected transport/lifecycle doubles without importing the React Native runtime into Bun tests. Cover changing headers, split chunks, backoff, server completion, heartbeat timeout, out-of-order events, background cleanup, 401/403, rapid room/account switches, and accepted/rejected mutations. Test core hooks with the repository's existing React test harness.

Native Storybook must show streaming text; a finished answer with table cards and allowed/rejected links; raw HTML as text; each rejection including Topic quota; a room mention and reply; attachment chips; and a proposed Topic draft showing unchanged fields. Add light/dark, larger-text, loading, empty, failure, and tool-only variants. Stories must use static fixtures and the real shared components, not request private conversation data.

Rebuild the iPhone development app for the Markdown module, then verify live same-account web↔iPhone history, private incremental output/Stop, room arrival/reconnect/background, mentions, replies, deletion, clear confirmation, and a confirmed Topic edit. Check the same workflows on Android where a device is available; report missing device evidence explicitly. The prior session's Android deferral does not count as a passed Android test. Verify keyboard layout, hit targets, VoiceOver/TalkBack, reduced motion, and text scaling through the mobile guide's acceptance bar.

Run `bun run check`, the unchanged web chat tests, component/package boundary checks, and affected Storybook/build checks. Update core/mobile/web guides for the actual moves, the client guide if its transport contract changes, and `apps/docs/src/content/docs/feed/chat.md` for native text support and web-only media. Align the Topic-edit and Team-room docs where they describe the same workflows. Report actual component reuse, native adapters, and any remaining acceptance gaps separately.

Monitoring uses existing native PostHog/Sentry configuration and redaction. Keep message content, proposed prompts, tool payloads, attachment contents, session headers, and authenticated URLs out of diagnostics. Avoid duplicating server-recorded chat events or adding full response bodies to test failure logs.

## Risks / Trade-offs

- **Native streaming can appear to work while buffering the full answer.** Verify incremental delivery and cancellation on a rebuilt client with the configured authenticated fetch.
- **Native Markdown has different parser and HTML defaults.** Make the shared policy explicit, transform parsed content before rendering, and exercise incomplete/hostile input on device. Keep recap safety untouched.
- **A large room or answer can churn rendering.** Reuse virtualized lists, stable message identities and adapters, bounded preview retries, and incremental streaming updates; measure before adding a new cache or scheduler.
- **Extraction can disturb web voice, attachments, or new-topic state.** Keep app extensions behind adapters and run the existing suites unchanged while moving one responsibility at a time.
- **Credentials or proposals can outlive their room/account.** Key state by conversation and account, retire generations, close streams, and test delayed completion after switching.
- **Room deletion is not an SSE event today.** Reload after local mutations and reconcile on return; do not invent unsupported server synchronization.
- **Native table cards differ from the web's table layout.** This follows the explicit Mobile content rule while preserving all data and inline link safety.

## Migration Plan

1. Extract pure logic and shared component composition behind existing web imports, with unchanged web tests green.
2. Add native dependencies and adapters, rebuild development clients, and prove incremental fetch, SSE headers/lifecycle, and safe Markdown behavior in focused fixtures.
3. Wire native routes, private/room flows, Topic edits, and action parity through those shared modules.
4. Complete regression, device evidence, documentation, and `bun run check` before handing off implementation.

No data migration or server rollout order is needed. The native Markdown dependency requires a binary build; do not distribute it only as an OTA update to a binary missing the module. Rollback can restore chat handoffs at the native entry points while keeping the shared web-compatible extraction, or revert the change without modifying stored conversations.
