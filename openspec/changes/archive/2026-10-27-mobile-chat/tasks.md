# Tasks

## 1. Extract shared conversation behavior

- [x] 1.1 Move `chatTurns.ts` and `chatHistoryTurns.ts` into core without duplicating the contracts/client compaction helpers. Verify new core cases for stopped, rejected, empty, and tool-only turns and run the existing web tests unchanged.
- [x] 1.2 Move portable `topicToolCalls.ts` and `chatRejectionCopy.ts` behavior into core, including Topic-limit wording and injected notice effects. Verify proposal/cancel/save/rejection transitions and unchanged web copy/tests.
- [x] 1.3 Extract account/conversation identity, default-room selection, and edit state from the web panel store into the shared conversation store while leaving window/panel/router effects on web. Verify room/account switches and delayed callbacks cannot leak messages or proposals.
- [x] 1.4 Move `useChatConversationLoad.ts` and `useEditableTopicDraft.ts` into core with platform effects supplied by the app. Verify load failure, access/sign-in gates, stale loads, restored proposals, and authoritative Topic reloads in hook tests.
- [x] 1.5 Extract supported send/stop/retry/clear state from `useTopicChat.ts` into the shared hook while preserving web voice, attachments, new-topic, and podcast adapters. Verify existing web chat tests unchanged plus accepted/rejected clear and tool-only stop cases.
- [x] 1.6 Update core/web `AGENTS.md` for these exact module moves and public wrapper responsibilities. Verify documented paths exist and `bun scripts/check-package-boundaries.ts` passes.

## 2. Extract shared room behavior

- [x] 2.1 Move room loading, paging, posting, deduplication, cursor, and tool-event state from `useChatRoom.ts` and `useChatRoomStream.ts` into core. Verify first/earlier pages, duplicate/out-of-order events, failed reads, and web virtual-list indices through tests.
- [x] 2.2 Share `useRoomReply.ts`, mention matching/insertion, and reply-target logic while retaining app caret/focus handling. Verify @ word boundaries, preserved surrounding text, default/manual targets, deleted parents, and room switches.
- [x] 2.3 Share bounded link-preview refresh behavior and reuse existing room summaries/mention acknowledgement. Verify retry limits, failed previews, and acknowledgement of only the opened room.
- [x] 2.4 Wire web room adapters back to the shared modules without changing its EventSource or voice behavior; run existing room, mention, reply, and preview tests unchanged.
- [x] 2.5 Update core/web guides with the room state/transport boundary and shared helper paths. Verify no duplicated cursor, mention, or reply implementation remains in an app.

## 3. Add and verify native transports

- [x] 3.1 Add `react-native-sse` and a React Native 0.88-compatible `react-native-enriched-markdown` version to mobile, using the existing dependency workflow. Verify installation/type resolution and rebuild the iPhone development client with the Markdown native module.
- [x] 3.2 Connect the shared private hook to existing `sendChatTurn` and the configured Expo 58 fetch. Add split UTF-8/NDJSON, tool callback, error/body, and abort tests, then demonstrate visible native output before the response finishes.
- [x] 3.3 Implement the native `useChatRoomStream.ts` adapter with an absolute room URL, current session/device headers, disabled library retry, shared backoff/cursor, and stale-stream recovery. Verify headers, completion/error recovery, replay deduplication, and monotonic cursors with a transport double.
- [x] 3.4 Connect AppState, screen disposal, account changes, and unauthorized handling to both transports. Verify one foreground room connection, complete background cleanup, retired-callback rejection, history reconciliation, and no automatic private POST replay.
- [x] 3.5 Update mobile `AGENTS.md` for native dependencies, binary rebuild requirements, Expo fetch reliance, and SSE session/lifecycle wiring. Update the client guide if its abort or transport contract changes, and verify the documented setup against the rebuilt client.

## 4. Render safe native answers

- [x] 4.1 Extract `isSafeHref` and the invitation/special-link rule into `packages/core/lib/safeChatMarkdown.ts`, retaining web exports and behavior. Verify unchanged `ChatMarkdown` tests and separate recap/chat link-policy tests.
- [x] 4.2 Implement the parse-aware native chat safety transformation, preserving literal raw HTML, code, readable rejected labels, and image-as-link behavior. Verify hostile schemes, entities, reference links, HTML/media, and chunk boundaries cannot produce unsafe native actions or embeds.
- [x] 4.3 Build native `ChatMarkdown.tsx` with enriched Markdown streaming, Nightshift type/color roles, safe press/long-press handling, disabled automatic previews/task editing, and reduced-motion support. Verify streaming and finished-answer stories on the rebuilt iPhone.
- [x] 4.4 Render parsed chat tables as labeled row cards and keep incomplete rows out of completed records. Verify empty cells, escaped delimiters, inline formatting/links, long values, and larger text without horizontal scrolling or changes to domain tables.
- [x] 4.5 Add light/dark native stories for streaming content, a finished table/link answer, literal HTML, rejected destinations, the plain new-topic invitation, and attachment-name chips. Verify actual rendered output and document the native safety/table boundary in mobile/core guides.

## 5. Share chat presentation and wire private conversations

- [x] 5.1 Extract `TopicDraftCard` field composition into core and supply web/native elements with stable identities. Verify the existing web card tests unchanged and a native proposed-change story showing all applicable unchanged settings.
- [x] 5.2 Extract reusable author, turn/message, rejection, and action composition from the existing web components. Verify web snapshots/assertions remain unchanged and native stories use those shared components with matching icons and spacing.
- [x] 5.3 Add the native `ChatScreen`, Topic/Team chat routes, chat entry actions, and room/private selector using shared selection rules. Verify default Team-room selection, private fallback, a Team's own room, and Close/back returning to the originating position.
- [x] 5.4 Wire private history, text send, Stop, copy, supported retry, confirmed clear, and loading/empty/access/error states. Verify on iPhone that failed clear preserves messages, interrupted sends recover correctly, and reopened history matches web.
- [x] 5.5 Implement keyboard-safe composer/list layout with preserved older-message position and an accessible latest-message action. Verify small-phone layout, physical/software keyboards, long input, text scaling, and light/dark styling.
- [x] 5.6 Add stories for each shared rejection, including Topic quota, without mobile pricing links. Verify creation quota does not block permitted existing-Topic chat and deferred voice/new-topic/attachment/podcast controls are absent.
- [x] 5.7 Update mobile/core/web guides for actual shared presentation and native adapters, and update the chat docs page with private native text behavior and explicit web-only media. Verify paths, terminology, and screenshots/copy against both clients.

## 6. Wire native rooms and moderation

- [x] 6.1 Connect the native room list to shared loading, earlier paging, live events, authors/avatars/timestamps, preview cards, and copy actions. Verify no duplicate rows or scroll jumps during paging and live arrival.
- [x] 6.2 Connect native caret-aware member suggestions, @all/Carl/member reply targets, quoted replies, reply-to-message navigation, and cancellation. Verify a room story with mentions/replies and live posting that preserves text/target after rejection.
- [x] 6.3 Wire own-message deletion, current leader/admin moderation, confirmed clear, and accepted-operation reloads through existing clients. Verify permission combinations and rejected mutations without inventing server deletion events.
- [x] 6.4 Acknowledge mentions when a room opens through the existing API/store. Verify only that room changes and no broader live badge subscription is introduced.
- [x] 6.5 Add room stories for loading, no access, empty history, waiting for Carl, rejection, attachment chips, and reply/deletion states. Verify component parity, native light/dark appearance, and useful accessibility labels.
- [x] 6.6 Update Team-room/chat docs and mobile/core guides with native room actions, permissions, lifecycle recovery, and current deletion synchronization limits. Verify the documented actions on web and iPhone.

## 7. Complete Topic edits and feedback

- [x] 7.1 Connect shared proposal/cancellation/save handling to native private chat and intended-recipient room events. Verify preview/dismiss/cancel transitions and that another room member's assent cannot confirm a proposal.
- [x] 7.2 Refresh the authoritative Topic and draft card after accepted edits, including Sources, schedule, visibility, Team, Invites, and Podcast settings when applicable. Verify server rejection/permission failure never appears as a successful edit.
- [x] 7.3 Implement every supported tool/result presentation in the design inventory, including success/error notices, retained tool-only turns, and deferred new-topic feedback. Verify an outcome matrix with fixtures and preserve all web-only creation behavior.
- [x] 7.4 Add draft loading, proposed-change, cancelled, saved, and rejected stories. Update the Topic-edit and chat docs to describe native confirmation, then verify one real proposed-and-confirmed edit is visible on both clients.
- [x] 7.5 Verify monitoring still redacts message text, prompts, tool/attachment content, credentials, and authenticated URLs while retaining platform/device metadata. Add focused redaction regressions only where the new error paths require them and document the boundary in the mobile guide.

## 8. Complete integration acceptance

- [x] 8.1 Run `bun run check` and the unchanged web chat tests on the completed extraction; record green lint, types, package/component boundaries, workflow bundles, and test results without editing existing assertions to accept regressions.
- [x] 8.2 Run affected web/Storybook and native bundle/build checks. Verify the new Markdown dependency is delivered by a compatible native binary rather than an OTA-only update.
- [x] 8.3 Verify same-account web↔iPhone private history, incremental answers/Stop, room arrival/reconnect/background, mentions/replies, delete/clear, and Topic edit confirmation; record device evidence and verify excluded controls remain excluded.
- [x] 8.4 Complete the mobile guide's accessibility checks for composer/keyboard, focus, hit targets, text scaling, reduced motion, and light/dark contrasts; exercise Android where available and explicitly record any device checks left unverified.
- [x] 8.5 Produce a parity report identifying actual shared components, shared hooks/helpers, necessary native adapters, and remaining acceptance limitations; reconcile the implementation with both delta specs and validate the completed change before handoff.

## 9. Match the global web launcher

- [x] 9.1 Share the chat pill composition and cup artwork with web, replace separate mobile page buttons with the safe-area global launcher, and verify light/dark appearance, context, Close, and footer/note clearance.
- [x] 9.2 Keep global room selection and private Topic fallback on existing APIs, without enabling deferred new-topic chat. Add navigation coverage and update app/core/Nightshift guides and chat docs.
- [x] 9.3 Present conversation choices in the user-requested full-width sheet, with shared alphabetical ordering, Carl/Team avatars, selection, and orange overflow. Verify scrolling and private/room switching on iPhone.
