## 1. Tools and vocabulary

- [x] 1.1 Move `savePromptVersion` and `PromptVersionOrigin` from `api/tool/topicTools.ts` to `api/topic/promptVersions.ts`, and point `api/topic/topics.ts` and `topicTools.ts` at it, so `topicTools.ts` may import the create path without a cycle.
- [x] 1.2 Give `createTopic` in `api/topic/topics.ts` an `origin` parameter for the first Prompt Version, defaulting to `editor`, and add `origin` to the `topic_created` event's properties.
- [x] 1.3 Add `topicDraftPayload` and `TopicDraft` to `shared/contracts.ts`: `name`, `prompt`, `sources` as `{ sourceOption, value }` pairs limited to `MAX_TOPIC_SOURCES`, and `inviteEmails`, every field defaulting to empty, plus `createTopicPayload` requiring the name and prompt for the MCP tool. Add `topicDraft` to `chatTurnPayload` as the optional draft a new-topic turn is sent with.
- [x] 1.4 Write `createTopicFromDraft` in `api/tool/topicTools.ts`: reject a null user and an empty name or prompt, build the editor's payload with the editor's defaults, weekly on Wednesday at 09:00, invite visibility, ten results, and the default Sources beside the draft's through `toNewTopicSource`, call the create path with the adapter's origin and analytics properties, and return created with the id and name or the create path's own rejection in words.
- [x] 1.5 Write `suggestTopicDraftSources` in `topicTools.ts`: reject a null user, draw on `incrementDaySuggestionCount`, read the user's key, call `suggestSources` from the worker with no exclusions and the topic source limit, and return the suggestions or the limit failure.
- [x] 1.6 Extend `api/tool/topicTools.test.ts` with the payload the tool builds from the defaults, and `topicTools.smoke.ts` with a create through the tool that leaves the editor's rows, a quota rejection, and a suggestion call under the limit.
- [x] 1.7 Update the Topic Tool row and add the new-topic chat to `.claude/skills/domain-model/SKILL.md`, mirrored through `.agents/skills/domain-model/SKILL.md`.

## 2. The new-topic conversation

- [x] 2.1 Add the `{ newTopic: true }` page kind to `ChatPage` in `api/chat/turns.ts` and `ui/src/clients/chatClient.ts`, with `toPageFilter` matching a null Topic and a null Team, and `recordChatTurn` writing both null.
- [x] 2.2 Add `authorizeNewTopicChatTurn` in `turns.ts`: sign-up for a visitor, budget, `chat:persist`, the user's key, and `canEditTopic: false`, plus the `isFirstTopic` count of the user's own Topics for the payload. Add `isFirstTopic` to `ChatConversation`.
- [x] 2.3 Add `GET`, `DELETE`, and `POST /chat/new-topic` to `chatRoute`, the post under `callerRateLimiter`, building the tools with `toNewTopicChatTools({ userId, calls, draft, analyticsProperties })` from the turn's draft and answering through `answerChatTurn`, whose attachments reach Carl for the turn and are stored nowhere.
- [x] 2.4 Write `toNewTopicChatTools` in `api/tool/chatTools.ts`: the `draftTopic`, `suggestSources`, and `createTopic` AI SDK tools, `draftTopic` merging its fields into the turn's draft and noting it on the calls, `createTopic` taking no input and saving the draft as it stands, noting the save and `calls.createdTopicId`. Extend `chatTools.test.ts`.
- [x] 2.5 Grow `TurnToolCalls` with `topicDraft` and `createdTopicId` and the tool calls the stream ends with to `{ topicSaves, topicDraft, createdTopicId }` in `turns.ts` and `chatClient.ts`, keeping the room's `topicSaved` event a list. Extend `chatClient.test.ts`.
- [x] 2.6 Add `worker/prompts/chat-new-topic.md` with the five frontmatter keys: Carl the guide, the glossary, the docs block fenced as untrusted, the draft fenced as untrusted, the wizard order with the draft written as each answer settles, the propose-then-confirm rule, the honesty rule, and the note that the schedule lives on the topic page. Register it in `worker/prompts/fetch.ts`.
- [x] 2.7 Add the third branch to `streamChatReply` in `worker/chat/index.ts`: `input.newTopic` reads the docs block alone through `retrieve.ts` and builds `buildNewTopicChatPrompt` with the turn's draft. Extend `worker/chat/index.test.ts` and `worker/prompts/write.test.ts`.
- [x] 2.8 Push the prompt with `bun run prompts:sync`.

## 3. The panel, the homepage, and the new Topic's page

- [x] 3.1 Add the new-topic private chat to `ChatId` in `ui/src/stores/chatPanelStore.ts`, `isUserTopicFeedEmpty` to `ChatPageContext`, and the two new defaults to `toDefaultChatId`: an empty feed, and a signed-in user with no chat room and no page Topic or Team.
- [x] 3.2 Register the homepage's page context in `HomePage.tsx` once the feed has loaded for a signed-in user, with `isUserTopicFeedEmpty` from the "yours" and "subscribed" sections both being empty.
- [x] 3.3 Open the panel once per page load from `AppChatPanel.tsx` when the page context says the feed is empty, wide or over the page the way the pill opens it, and leave the "start a topic" call to action to visitors.
- [x] 3.4 Add a "Give Carl a topic. You know the one." row for a signed-in user to `ChatOptionsMenu.tsx` and pass it through both panels' menus. Name the private panel's header "Give Carl a topic. You know the one." for that page.
- [x] 3.5 Give `ChatComposer` a `placeholder` prop, and pass the first-topic and later placeholders from `PrivateChatPanel` for the new-topic page, from the conversation's `isFirstTopic`.
- [x] 3.6 In `useTopicChat.ts`, hold the Topic Draft and its files for the new-topic page: `addFiles` keeps each accepted file, the draft goes out with every turn, and the draft the reply ends with replaces it. On `createdTopicId`: toast the saves, navigate to `/topics/<id>` with the panel left on the new-topic chat, upload each file through `uploadTopicAttachment`, and publish the Topic changed once they land. Reload the homepage feed behind the navigation the way the modal's save does.
- [x] 3.6b Add `TopicDraftCard.tsx` in `ui/src/components/chat/`: the name, prompt, sources, invites, and files with a remove control, shown above the composer in the new-topic chat.
- [x] 3.7 Verify in the browser: a signed-up user with no Topics lands on the homepage with the panel open and the first-topic placeholder; Carl proposes a title, a prompt, and Sources and the card fills in; an attached PDF waits in the card; a yes creates the Topic, lands on its page, and uploads the file; the menu's "New topic" row on a Topic page.
- [x] 3.8 Open "Your subscribed topics" first on the homepage for a user who owns no Topic but follows some.
- [x] 3.9 Put `topicsRemaining` and `topicLimit` on the new-topic conversation and each turn's prompt, show `ChatTopicLimitNotice` in place of the draft card at the limit, and have Carl say it first.

## 4. MCP

- [x] 4.1 Register `create_topic` and `suggest_sources` in `api/mcp/tools.ts` with the annotations the spec names, account-only through the connect-an-account result.
- [x] 4.2 Extend `api/mcp/mcp.smoke.ts`: a visitor's `create_topic` returns the connect text, a user's `suggest_sources` returns a list, and a user's `create_topic` leaves a Topic with a Prompt Version of origin `mcp`.

## 5. Docs, structure, and the gate

- [x] 5.1 Update `api/AGENTS.md` for `promptVersions.ts` and the new-topic chat, and the README's chat lines.
- [x] 5.2 Run `bun run check`, `bun run smoke:tools`, and `bun run smoke:mcp` green.
