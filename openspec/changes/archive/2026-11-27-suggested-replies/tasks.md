# Tasks

## 1. Stream lines and the freeze exception

- [x] 1.1 Add the `saved` line and `suggestedReply` to `chatReplyLine` in `packages/contracts/routeShapes.ts`, and add `SUGGESTED_REPLY_CHARS = 100` to `packages/contracts/chat.ts`; verify `bunx tsc -b` passes
- [x] 1.2 Add `lineKindField?: "type"` to `ApiRouteContract` in `packages/contracts/apiRouteContracts.ts`, set it on the three `sendChatTurn` contracts in `chatRouteContracts.ts`, and write it into new snapshots in `scripts/contractFreeze.ts`; verify `bun test scripts` passes
- [x] 1.3 Teach `compareSnapshotRoute` in `scripts/contractCompatibility.ts` to pass a new top-level line kind on a route that declares `lineKindField`, still comparing every frozen kind; add tests for a new kind passing, a changed `text` line failing, and an undeclared route failing; verify `bun scripts/check-contract-freeze.ts` passes against `contracts/0.1.0.json`
- [x] 1.4 Make the in-process compatibility test skip a streamed line whose `type` no frozen option names, on declared routes only; verify the test still fails on a malformed `text` line
- [x] 1.5 Add `packages/client/chatClient.test.ts` cases proving the reader drops an unknown kind between two text lines (both texts shown, no tool calls, same result) and still reads a later `failed` line as failed; confirm with `git log -L` that `isChatReplyLine`'s drop branch is unchanged since the 0.1.0 freeze, and record the commit in the test's comment; verify `bun test packages/client` passes
- [x] 1.6 Update the `api-contract-freeze` notes in `packages/contracts/AGENTS.md` and `scripts/` docs to describe `lineKindField`; verify the docs name the reader test

## 2. The suggestion call, its prompt, and its filter

- [x] 2.1 Write `packages/models/prompts/suggest-reply.md` (cheap tier, version 1) with the rules in design decision 3, fenced untrusted variables below the instructions, and a closing restatement; register it in `FALLBACK_PROMPT_TEMPLATES`; verify `packages/models/prompts/write.test.ts` passes
- [x] 2.2 Add `packages/pipeline/chat/suggestedReply.ts` with `buildSuggestReplyPrompt` (the last three turns, a 500-character cut per question, a 1,500-character tail cut per answer, a 2,000-character draft cut) and `writeSuggestedReply` (schema output, about 40 output tokens, a 2-second timeout, null and zero tokens on any failure, budget rejections unreported); verify unit tests cover a written prompt with no leftover `{{`, the input cuts, a timeout, a schema failure, and a budget rejection
- [x] 2.3 Add `toSafeSuggestedReply`, which trims the text and drops an empty or over-limit line and any email, url, bare domain, or `@handle`; verify table tests for each drop and for plain replies kept
- [x] 2.4 Give the suggestion call its own reservation of its largest cost (`MAX_SUGGESTED_REPLY_DOLLARS`, the `suggestedReply` reservation kind), taken after the turn's reservation is released, leaving `maxChatTurnDollars` unchanged; verify the stream tests show the turn released before the `saved` line, the call reserved, a rejected reservation making no call, and the call's reservation released after its spend is added
- [x] 2.5 Add the builder to `apps/worker/scan.smoke.ts`; verify the smoke's prompt check lists `suggest-reply`
- [x] 2.6 Add `packages/server/suggestedReplySettings.ts` (`SUGGESTED_REPLY_CHATS`: `all` default, `new-topic`, `off`, anything else throws) with `isSuggestedReplyOn(page)`; verify tests for unset, each value, and a typo; document the setting in the deployment guide and `packages/server/AGENTS.md`
- [x] 2.7 Document the new module and prompt in `packages/pipeline/AGENTS.md` and `packages/models/AGENTS.md`, (the prompt-authoring skill lists prompt fragments only, and this prompt is no fragment, so it stays out of that list); verify `bun run check:components` and Biome pass on the docs' code references

## 3. The stream order on the server

- [x] 3.1 Make `saveFinishedChatTurn` in `apps/api/chat/chatTurnStream.ts` return the saved row's id whether or not text is persisted, and move `saveTopicDraft` before the release; verify the existing `chatTurnStream` tests pass
- [x] 3.2 Add `addChatTurnSpend(chatTurnId, totalTokens)` in `apps/api/chat/chatTurns.ts`, which adds tokens and their chat-rate cost to the row; verify a test that a 4,000-token reply plus a 300-token suggestion saves 4,300 tokens and the summed cost
- [x] 3.3 In `streamChatTurn`, write the `saved` line after the save, the proposal, and the draft, then run the call when the turn is eligible (finished, saved, not aborted, not spoken, not podcast, no created topic, rollout on, no public or invite proposal standing), write a guarded `suggestedReply` line, add its spend, and release the reservation in a `finally`; verify `chatTurnStream` tests for each ineligible case writing no line and making no call
- [x] 3.4 Add tests that the reservation is released only after the suggestion's spend is added, that a write failure after the `saved` line still adds spend and releases, that a spent budget writes no line and reports nothing, and that the proposal row exists before the `saved` line is written; verify `bun test apps/api/chat` passes
- [x] 3.5 Add a test that a team room turn in `apps/api/chat/room.ts` never calls `writeSuggestedReply`, and a podcast player question never does either; verify both pass
- [x] 3.6 Add the optional `isSuggestedReplyOn` flag to `chatConversationResponse` and set it from `isSuggestedReplyOn(page)` in the conversation load; verify the freeze check passes and a test reads it as off when absent
- [x] 3.7 Document the new stream order and the two lines in `apps/api/AGENTS.md`; verify it names the `saved` line and `suggestedReply`

## 4. The client reader and the shared chat hook

- [x] 4.1 Add `onSaved` and `onSuggestedReply` handlers to `sendChatTurn` in `packages/client/chatClient.ts`, validating the suggestion line's payload in `isChatReplyLine`; verify reader tests for both lines, a malformed suggestion line dropped, and a stream with neither
- [x] 4.2 In `packages/core/hooks/useTopicChat.ts`, run `finishSend` on the `saved` line and at most once per turn, keep reading in the background without exposing it to Stop, and pass `{ chatTurnKey, suggestedReply }` to the suggestion state behind `isCurrentChat()`; verify `useTopicChat` tests: Send is free while the call runs, a second send during the call works, the created-topic clear runs once, and a stream with no the `saved` line frees at close
- [x] 4.3 Add `NEW_TOPIC_EXAMPLE_TOPICS` to `packages/core/lib/chatCopy.ts`, keeping `toPrivateChatPlaceholder` unchanged; verify a test that every example passes `toSafeSuggestedReply`'s rules and fits `SUGGESTED_REPLY_CHARS`
- [x] 4.4 Add `packages/core/hooks/useSuggestedReply.ts` (design decision 7), with shown and accepted events through an adapter that never receives the text; verify hook tests for typing hiding and clearing showing it, send, clear, page change, and account change dropping it, an earlier turn's late suggestion never showing, attachments, streaming, recording, voice, and visitor hiding it, the example topic only in an empty new-topic chat with topics left and the rollout on, one shown event per held suggestion, and no text in any event
- [x] 4.5 Add `chat_suggested_reply_shown` and `chat_suggested_reply_accepted` to `VisitAnalyticsEvent` in `packages/contracts/analyticsEvents.ts`; verify `bunx tsc -b` passes
- [x] 4.6 Document the hook and the copy list in `packages/core/AGENTS.md` and `packages/client/AGENTS.md`; verify they name the visibility rule's single owner

## 5. The private chat composer on the web

- [x] 5.1 Wire `useSuggestedReply` into `apps/web/src/components/chat/PrivateChatPanel.tsx`, passing `suggestedReply ?? toPrivateChatPlaceholder(...)` as the placeholder and `captureVisitEvent` as the analytics adapter; verify a panel test that the new-topic chat shows an example topic and a Topic's chat shows its usual placeholder until a suggestion arrives
- [x] 5.2 In `apps/web/src/components/chat/ChatComposer.tsx`, accept on Right Arrow in an empty box (no modifier, no IME composition, caret to the end), leave Tab alone, and add the ghost `icon-sm` accept Button with its `aria-label`, tooltip, focus keeping, and `motion-safe:` fade; verify tests for Right Arrow filling, Right Arrow in text moving the caret, Tab moving focus, an IME composition left alone, a click, Enter, and Space on the button filling without sending, and touch web filling only through the button
- [x] 5.3 Keep the empty box one line tall with the placeholder truncated (the `placeholder:` truncate classes, or the overlay fallback), and add the polite live region that announces once per suggestion; verify a test that the live region updates once across type-and-clear, and a Playwright check at 200 percent text and 390 px width that the composer's height is the same with and without a 100-character suggestion
- [x] 5.4 Add `apps/web/src/components/chat/ChatComposer.stories.tsx` with a reply suggestion, an example topic, and no suggestion, each in light and dark; verify they render in Storybook and pass its accessibility checks
- [x] 5.5 Update `apps/web/AGENTS.md` for the composer's accept and the new stories; verify the docs name the keyboard behavior

## 6. The suggestion eval

- [ ] 6.1 Add `evals/suggested-replies/` beside `evals/new-topic-chat/`, with cases for each step of making a topic (name, what to watch, sources, schedule, visibility, invites suggesting a skip, a proposal allowing "Yes, create it"), a reply with no question getting a follow-up, consent the suggestion must not give (public, invites, an undiscussed source), and instructions planted in a finding, a docs section, an attachment, and the draft; grade with deterministic checks (length, no email, url, or handle) and rubrics on a different model; verify `bun run eval:suggested-replies` runs and meets its gate pass rate
- [x] 6.2 Add the `eval:suggested-replies` script, a row in `evals/README.md`, the README's Development section, and the job in `.github/workflows/evals.yml`; verify `bunx knip` passes and the workflow lists the eval

## 7. The private chat composer on mobile

- [x] 7.1 Wire `useSuggestedReply` into `apps/mobile/src/components/chat/PrivateChatPanel.tsx` with the mobile `captureVisitEvent` adapter, and hide it while the mic is recording or transcribing; verify a test that the new-topic chat shows an example topic and the voice composer shows none
- [x] 7.2 In `apps/mobile/src/components/chat/ChatComposer.tsx`, add the accept Button (label holding the suggestion, hit slop to 44 pt and 48 dp), the one-line overlay placeholder hidden from accessibility, and the queued accessibility announcement; verify tests for the button filling without sending, its label and role, and one announcement per suggestion
- [x] 7.3 Add the swipe with the existing `react-native-gesture-handler` (Pan attached only while empty and showing, horizontal activation, vertical failure, simultaneous with the list's scroll, Android edge exclusion) and skip the fade under reduced motion; verify gesture tests for a swipe filling, a vertical drag scrolling, an edge start on Android ignored, text in the input disabling it, and reduced motion
- [ ] 7.4 Add the suggestion states to `apps/mobile/src/components/chat/ChatComposer.stories.tsx` in light and dark, and compare them with the web stories at phone width and at the largest system text size; verify the composer's height matches with and without a suggestion and record the comparison in `apps/mobile/parity.md`
- [x] 7.5 Update `apps/mobile/parity.md` (the `ChatComposer` row's accept button and swipe adaptation, shared logic in `useSuggestedReply`) and `apps/mobile/AGENTS.md`; verify `bun scripts/check-component-parity.ts` and `bun scripts/check-client-parity.ts` pass
- [x] 7.6 Confirm the change adds no native dependency (`apps/mobile/package.json` and the lockfile's native modules unchanged); verify an EAS Update fingerprint matches the installed build's runtime version

## 8. The topic, team, and Topic Post private chats

- [x] 8.1 Add api tests that, with the setting unset, a Topic's, a team's, and a Topic Post's private chat turn each make one call and write one line, and that `new-topic` leaves all three off; verify `bun test apps/api/chat` passes
- [x] 8.2 Add web and mobile panel tests that a Topic Post page's composer shows a received suggestion with the flag on and none with it off; verify both pass
- [ ] 8.3 Add Topic Post cases to the eval (a Comment planting an instruction or asking for an email) and topic chat cases (a follow-up with no question); verify the eval's gate pass rate holds

## 9. Vocabulary and user docs

- [x] 9.1 Add **Suggested Reply** to `.agents/skills/domain-model/SKILL.md` (identifiers `suggestedReply`, copy "suggested reply"; rejected: quick reply, smart reply, autocomplete, chip) and to the root `AGENTS.md` routing table with its files; verify every new identifier uses the canonical noun
- [x] 9.2 Update `apps/docs/src/content/docs/feed/making-a-topic-in-chat.md` and `apps/docs/src/content/docs/feed/chat.md` with the suggestion, how to take it on the web and the phone, and that filling never sends; verify `bun run build:docs` builds

## 10. Integration

- [ ] 10.1 Run the full gate (`bunx biome check .`, `bun run check:components`, `bun scripts/check-package-boundaries.ts`, `bun scripts/check-dependency-pins.ts`, `bunx knip`, `bun scripts/check-component-parity.ts`, `bun scripts/check-client-parity.ts`, `bun scripts/check-purchase-paths.ts`, `bun scripts/check-contract-freeze.ts`, `bunx tsc -b`, `bun scripts/check-workflow-bundles.ts`, `bun test`, `bun run smoke:mcp-views`); verify every step is green
- [ ] 10.2 Run the dev stack and make a topic end to end on the web and in the mobile development build: accept each step's suggestion by key, button, and swipe, check that Send frees before the suggestion arrives, and confirm in the turn's row that the tokens include the suggestion; record the result
- [x] 10.3 Validate this change and `launch-hardening-browser-load` with `openspec validate --strict`; verify both are valid and this change's `mobile-chat` delta leaves "Badge polling runs only in the foreground and online" untouched

## Workflow follow-up

- Run `bun run docs:embed` once the docs deploy, so the docs search Carl reads holds the new section. It needs Doppler.
- Run `bun run prompts:sync` so the registry serves `suggest-reply.md`. It needs the Langfuse keys.
- Write the release note on GitHub at release time, following `apps/docs/release-notes.md`. A summary to start from:
  "Coffee Talk now suggests your next reply. When Carl asks how often to brew or whether to create the topic, the empty
  message box shows a short answer you can take with one key, tap, or swipe, then edit or send. It never sends on its
  own, and it never agrees to make a topic public, to invite anyone, or to add a source you didn't mention."

- After the first release, read `chat_suggested_reply_shown` and `chat_suggested_reply_accepted` by chat kind. Narrowing with `SUGGESTED_REPLY_CHATS=new-topic` is the user's decision.
- Archive with `openspec archive suggested-replies --yes` through `/ship`, then run `openspec validate launch-hardening-browser-load --strict` again.
