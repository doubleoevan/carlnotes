# Proposal

## Why

An empty chat box makes the user think of the next thing to say. Carl usually just asked a question, and the answer
is often short and predictable ("Weekly is fine", "Skip invites for now", "Yes, create it"). If the box shows one
likely reply as its placeholder, the user can take it with one key, tap, or swipe and edit it before sending. The
new-topic chat gains the most, since making a topic takes several short answers. The topic, team, and Topic Post
private chats get the same suggestion from the first release, and the counts show which ones people use.

## What Changes

- After Carl's reply ends on an allowed private chat turn, one cheap-model call writes a **Suggested Reply**. It is
  one short line in the user's voice that answers what Carl just asked, or nothing. The call returns a schema output,
  times out after about 2 seconds, and returns no suggestion on any failure. Its prompt is a new versioned file,
  `packages/models/prompts/suggest-reply.md`, with a thin builder. It fences the last few chat turns and the topic
  draft as data. Carl's prompts, tools, and text do not change.
- The suggestion never decides anything for the user. It may suggest "Yes, create it" after a proposal, because
  accepting it does not send. It never agrees to make a topic public, to invite anyone, or to add a source nobody
  discussed. When Carl asks about invites, it suggests skipping them. The code drops any suggestion that holds an
  email, a url, or an account handle. The code also writes none after a proposal for a public topic or one with
  invites. The check-agreement prompt and the rule that only the user's own message agrees stay as they are.
- The reply stream gains two line kinds after Carl's last text. the `saved` line marks that the turn's row, its proposal,
  and its draft are saved, and current clients free the composer when it arrives. `suggestedReply` carries the
  suggestion. A released build's reader drops both, so it only waits for the suggestion call, at most about 2
  seconds. A test proves that. The `failed` line keeps its meaning.
- The contract freeze check and its in-process tests learn one exception. A stream route may add a line kind that its
  frozen reader skips, as long as the reader is proven to skip unknown kinds. Every other frozen rule still holds.
- The call bills the user's LiteLLM key. Its tokens are added to the turn's saved row, so the daily spend cutoffs and
  the monthly budget count them. `maxChatTurnDollars` reserves for it. It runs only on a turn the gate allowed, never
  after a spent budget, a failed, stopped, or rejected turn, a spoken turn, or a turn that created the topic. Its input
  is the last few chat turns, and its output is one short line.
- An empty new-topic chat suggests one example topic from a short list in `packages/core/lib/chatCopy.ts`, with no
  model call. `toPrivateChatPlaceholder` stays the line for every empty box that has no suggestion.
- One hook in `packages/core` decides when a suggestion shows, on both apps. It shows only in an empty question box
  with no attachments, nothing streaming, and no recording. Typing hides it and clearing the box shows it again.
  Sending, clearing the chat, or changing the page drops it, and a suggestion for an earlier turn or another account
  never shows.
- Web: Right Arrow in an empty box accepts it, and Tab keeps moving focus. A small Nightshift button in the composer
  fills it by pointer, touch, and keyboard. Screen readers hear the suggestion once, politely.
- Mobile: the same button, plus a swipe right across the empty input through the existing gesture handler. The swipe
  loses to scrolling, the text cursor, and Android's back gesture. The voice composer and a visitor's composer show
  none. Reduced motion gets no animation, and both composers keep their height at the largest text size.
- Both apps count suggestions shown and accepted through the analytics they already have, never with the text.
- A rollout setting, `SUGGESTED_REPLY_CHATS`, turns suggestions on for every private chat by default. It can narrow
  them to the new-topic chat, or turn them off. Team rooms and questions from the podcast player never get one.
- Nothing is stored and nothing is migrated: a suggestion ends on reload. No new native dependency, so the mobile
  change ships as an EAS Update.

## Capabilities

### New Capabilities

None. The suggestion belongs to the chats that show it.

### Modified Capabilities

- `topic-chat`: a private chat turn may end with a Suggested Reply. This covers its stream lines, its metering, its
  bounded and fenced input, the code's safety filter, when a composer shows it, the web composer's accept, the rollout
  setting, and the analytics.
- `topic-creation-chat`: the new-topic chat's suggestions follow the agreement rules. The empty chat suggests an
  example topic, and its counts are readable apart from the other chats'.
- `topic-post-chat`: a question asked from a Topic Post's page gets a Suggested Reply on the shared path.
- `mobile-chat`: the native private composer shows the suggestion and accepts it by button and swipe, and reads the new
  lines through the shared client. "Badge polling runs only in the foreground and online" is left alone for
  `launch-hardening-browser-load`.
- `api-contract-freeze`: a stream may add a line kind that every live snapshot's reader is proven to skip.

## Impact

- **API**: `apps/api/chat/chatTurnStream.ts` (the order of save, the `saved` line, the call, and release),
  `apps/api/chat/chatTurns.ts` (adding the suggestion's spend to the saved row), `apps/api/chat/chatTurnAnswer.ts`.
- **Pipeline and models**: `packages/pipeline/chat/suggestedReply.ts` (new),
  `packages/pipeline/chat/chatTurnCost.ts`, `packages/models/prompts/suggest-reply.md` (new) registered in
  `packages/models/prompts/fetch.ts`, and `apps/worker/scan.smoke.ts`.
- **Contracts and client**: `packages/contracts/routeShapes.ts`, `chatTurns.ts`, `chatRouteContracts.ts`,
  `apiRouteContracts.ts`, `analyticsEvents.ts`, `packages/client/chatClient.ts`, and
  `scripts/contractCompatibility.ts`, `contractFreeze.ts`, plus the in-process compatibility tests.
- **Core**: `packages/core/hooks/useSuggestedReply.ts` (new), `useTopicChat.ts`, `packages/core/lib/chatCopy.ts`.
- **Web**: `apps/web/src/components/chat/ChatComposer.tsx`, `PrivateChatPanel.tsx`, a new `ChatComposer.stories.tsx`,
  and `apps/web/src/lib/visitAnalytics.ts`.
- **Mobile**: `apps/mobile/src/components/chat/ChatComposer.tsx`, `PrivateChatPanel.tsx`,
  `ChatComposer.stories.tsx`, `apps/mobile/src/visitAnalytics.ts`, and `apps/mobile/parity.md`.
- **Server settings**: `packages/server/suggestedReplySettings.ts` (new), documented in the deployment guide.
- **Evals**: `evals/suggested-replies/` (new), `bun run eval:suggested-replies`, `.github/workflows/evals.yml`, and
  `evals/README.md`.
- **Docs**: `apps/docs/src/content/docs/feed/making-a-topic-in-chat.md`, the AGENTS.md files, the root routing
  table, the README's Development section, the domain-model skill, and a release note.
- **Compatibility**: no migration and no native dependency. Released builds ignore the new lines and wait at most
  about 2 seconds longer before Send comes back.
