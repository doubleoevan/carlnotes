# Mobile chat parity report

Mobile chat uses the web's conversation APIs, shared state, and portable React composition. The iPhone checks cover private text, shared rooms, Topic edits, and the global launcher. All 47 implementation tasks are checked; assistive-technology limitations are recorded below.

## Actual component reuse

Both apps render the same core `ChatAuthor`, `ChatTurnBlock`, `ChatRoomMessageBubble`, `ChatRejectionNotice`, `TopicDraftCard`, `ChatPill`, and `ScrollDownButton` composition. Native elements supply text, buttons, links, avatars, and layout; they do not repeat the composition's field order or visibility decisions.

Both apps draw the cup from Nightshift's `coffeeCup.ts` and read the same Carl/Vienna portrait assets. Native `HostAvatar` serves authors and the private-chat choice. Existing native Nightshift controls, `ChoiceSelect`, `Sheet`, and `ScrollIndicator` provide the conversation picker. The user requested a full-width sheet, with private chat first and rooms alphabetized as on web.

## Shared behavior

Core owns history building/compaction selection, send/stop/retry/clear state, account and conversation generations, proposal restoration, Topic edit outcomes, and authoritative draft reloads. The moved modules retain their web names and import-compatible wrappers.

Core also owns room loading/paging, replay deduplication, cursor advancement, reconnect timing, pending-answer reconciliation, mentions, reply targets, member matching, and bounded link-preview refresh. `chatConversations.ts` supplies default selection, Profile context, private addressing, and menu ordering. Existing client methods and server permissions remain authoritative.

Existing web test assertions were retained. New tests exercise late callbacks, rejected clears/posts, tool-only turns, native streaming chunks/abort, unauthorized streams, duplicate events, pending-answer recovery, Markdown safety, and monitoring redaction.

Shipping review added permission checks before room event delivery, including session and membership revocation during initial catch-up. Account changes clear cached room names, excerpts, opened-room markers, and late badge requests. The shared hooks avoid duplicate initial history and Team reads; reply quotes use one indexed lookup. Native Markdown retains escaped URLs, ordered-list numbers, nested block indentation, unsupported text, and complete streamed table rows containing emoji. Multiple footnote definitions appear once.

## Necessary native adaptations

| Area | Adaptation and reason |
| --- | --- |
| Navigation | Expo routes open full-screen chat. Close returns to the original mounted page. The global pill respects safe areas and hides during chat and typing. |
| Streaming | Expo 58's configured fetch provides private response-body streaming. Patched `react-native-sse@1.2.1` supplies authenticated room events because React Native has no browser EventSource. Core owns reconnect/cursor behavior. |
| Lifecycle | AppState and route focus close inactive streams, abort private generation, and reload history on return. Sends are never replayed automatically. |
| Markdown | `react-native-enriched-markdown@1.1.1` requires the rebuilt native binary. The parsed adapter keeps raw HTML literal, restricts links to HTTP(S), and renders generated tables as labeled row cards. |
| Message list | A native virtualized list anchors the newest messages at the bottom and preserves older-message positions. Quoted-message navigation uses native list scrolling. |
| Controls | Native keyboard avoidance, touch targets, confirmation alerts, clipboard, and the full-width conversation sheet replace DOM controls. The reply selector remains compact. |
| Notifications | Topic saves and rejections use native notices with shared wording. Draft cards use shared composition and state. |

## Tool outcome coverage

| Outcome | Mobile result | Evidence |
| --- | --- | --- |
| Propose/cancel Topic edit | Complete shared draft card; overlay added/removed without saving | Core tests, native stories, live proposal |
| Update prompt/settings; add/remove Source | Accepted notice and authoritative refresh; rejected notice leaves state unchanged | Existing web tests, core outcome tests, live Max findings edit |
| Tool-only turn | Preserved in visible history and the next request | Core history tests, native story |
| Web search | Answer and safe link previews | Shared rendering/preview tests and live answer |
| Open new-topic chat | Native notice explains availability on web | Injected native effect and shared tool tests |
| New-topic creation tools | Remain in the web adapter; no native creation flow | Web tests and native control inspection |

## Verified on iPhone and web

Device: iPhone 18 Pro simulator, iOS 27, signed development build, same account as the local web app.

- Private history matched web. Answers appeared incrementally; Stop interrupted generation. A subsequent private test returned “Private chat ready.”
- Private clear cancellation retained history; acceptance cleared only the temporary QA conversation. Shared-room clear cancellation and acceptance also passed.
- Room posts appeared on web; web replies arrived on iPhone. Mention insertion, quoted replies, own-message deletion, and moderator controls worked in the QA fixture.
- Backgrounded the iPhone while Carl answered in the QA room. Web received the answer, and iPhone recovered it on return with no stuck waiting bubble.
- A real Topic proposal changed Max findings from 20 to 15 after confirmation. Both clients showed the accepted edit. The setting was restored to 20.
- Home and Topic launchers opened the expected conversation. Close returned to the prior page. The full-width selector scrolled to all rooms and switched between room and private chat.
- Long private history opened at the newest reply. Scrolling back preserved position, and the latest-message action returned to the end.
- A private QA room with 511 generated messages exercised the 500-message page boundary. Quoted navigation reached row 20, earlier rows loaded in order, and live web posts left the iPhone's older reading position unchanged. The centered latest-message action reached the new arrival. Native jumps now retry after row measurement, and the shared action preserves web placement, styling, and wording.
- The final note check exposed launcher overlap with the Comment button. Moving reserved space inside the keyboard-adjusted viewport fixed it; Comment, Saved, and footer links remained clear.
- Light/dark rendering, the shared pill, Carl's reply bubbles, safe Markdown, generated table cards, draft fields, and rejection stories were inspected. Reply-control padding is equal above and below.
- The software keyboard left the room composer and Send visible. Hardware-keyboard text entry worked. Earlier Storybook checks exercised larger text; system text size was restored afterward.
- The additional 375-by-667 iPhone SE passed long-draft hardware and software typing, mention insertion, light/dark rendering, and five increased text-size steps. The check found and fixed a composer overflow: its input and header now shrink within the keyboard-safe space, and mention choices temporarily replace the reply selector. Send remains visible. The unsent draft was cleared, and the original text size, appearance, and motion settings were restored.
- Server and UI rules agree: a person clears only their own private conversation; leaders/admins clear shared rooms; members delete their own messages. Opening a room acknowledges only its mentions.

The QA Team remains available for review. It contains generated chat checks; no invitations were sent. Existing user chat history was preserved.

## Device limitations

These are verification gaps, not claims of a successful device test:

1. VoiceOver traversal could not be verified: Device Hub exposes only its own controls for the iPhone SE, and its VoiceOver toggle and swipe attempt produced no observable focus indication. Accessible labels, roles, touch targets, and native controls were inspected in code; that does not establish spoken navigation. Android TalkBack remains unverified because Android is deferred at the user's request. Task 8.4 permits explicitly recording unverified device checks.
2. The additional proposed-Topic-edit card check with the small-phone keyboard open remains unverified. Device Hub lost typed and pasted input even in Safari. The card can shrink and scroll, and rejection text has bounded scrolling, but code inspection does not establish rendered device acceptance. The earlier SE composer, mention, large-text, and keyboard checks passed.

Additional regression checks for review: Profile-specific default room selection is covered by shared tests but has not been demonstrated with a second account. Member/leader/admin visibility combinations are covered by server rules and fixtures; live device checks used the owner/admin account.

The server currently emits no room deletion event. Accepted local deletes/clears reload the local room; other clients reconcile on reopening or foregrounding. This preserves the existing server behavior.

Voice, new-topic chat, attachment management, podcast chat, pricing links, and broad live badge counts remain deliberately outside this change.

## Checks and evidence

- `bun run check`: 2,478 tests passed, zero failures; lint, types, package/component boundaries, and workflow bundles passed.
- Web, web Storybook, and docs builds passed. The iOS export passed with the Markdown native dependency included in the installed development binary.
- `openspec validate mobile-chat --strict` passed. Documentation search refreshed 112 sections, with one updated embedding.

The local ship report links the following screenshots retained with the review. They are local review artifacts, not repository files:

- `mobile-chat-conversation-sheet.png`: full-width selector, avatars, ordering, orange indicator.
- `mobile-chat-background-recovered.png`: recovered room answer and no pending bubble.
- `mobile-chat-software-keyboard.png`: composer above the software keyboard.
- `mobile-coffee-talk-pill.png` and `mobile-coffee-talk-pill-light.png`: shared floating launcher.
- `mobile-chat-reply-spacing.png`: balanced reply-control padding.
- `chat-table-light.png` and `chat-table-dark.png`: Nightshift web Markdown tables.
- `mobile-chat-topic-restored.png`: restored Topic setting after the live edit check.
- `mobile-chat-latest-history.png`: long history opened at the latest reply.
- `mobile-chat-centered-latest.png`, `mobile-chat-earlier-page.png`, and `mobile-chat-live-reading-position.png`: quoted navigation, earlier-page continuity, and preserved reading position during a live arrival.
- `mobile-chat-note-clearance.png` and `mobile-chat-footer-clearance.png`: reachable bottom controls above the floating launcher.
- `mobile-chat-small-keyboard-light.png`, `mobile-chat-small-keyboard-large-text.png`, and `mobile-chat-small-large-text-dark.png`: small-phone keyboard, long draft, enlarged text, and light/dark acceptance.
