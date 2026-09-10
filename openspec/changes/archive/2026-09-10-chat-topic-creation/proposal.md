## Why

A new account lands on an empty homepage with a "+ New Topic" button and a modal form. The form asks for everything at once, and the user has to know what a good prompt and good sources look like before Carl has read a word. Carl already edits a Topic in the chat, but he cannot make one, so the moment a guide matters most, time zero, has no Carl in it.

## What Changes

- **A new-topic chat.** A private chat conversation bound to no Topic and no Team, at `/api/chat/new-topic`, where Carl walks a signed-in user through a Topic as a question-and-answer wizard: what to follow, then a title and a prompt he proposes in the user's words, then Sources he recommends through the existing suggestion flow, then invite emails as an optional step, then a yes, then the save. The conversation persists, is metered, and clears like the other private chats.
- **A Topic Draft, the form Carl fills.** The chat holds one draft, the title, the prompt, the Sources, the invite emails, and the files the user attached, and shows it as a card beside the conversation. Carl writes each answer into it with a `draftTopic` tool as soon as he has it, so the user watches the form fill in, and the save takes the draft as it stands. The files stay in the browser until the Topic exists, then upload as its attachments through the topic page's own upload path.
- **Two more Topic Tools** in `api/tool/`. `createTopicFromDraft` takes the draft, fills the editor's defaults for everything else, weekly on Wednesday at 09:00 so brews spread across the week, and runs the same create path the editor runs: the topic limit, the daily-frequency check, the invitee check, the first Prompt Version, and the first Scan. `suggestTopicDraftSources` returns the same verified suggestions the editor's Recommend button gets, under the same daily suggestion limit. Each tool checks its own gate. Both reach the MCP server as `create_topic` and `suggest_sources`.
- **Opening the new Topic.** When the draft saves, the chat toasts it and the app navigates to the new Topic's page. The panel stays open on the same conversation, so Carl can keep going.
- **Time zero.** A signed-in user whose feed holds nothing, no Topic of their own and none followed, who lands on the homepage, where a fresh signup is sent, gets the panel opened on the new-topic chat with the composer placeholder "Let's make your first topic. You know the one." Once per page load, so a closed panel stays closed until the next load.
- **Reachable everywhere.** The chat menu offers "New topic" on every page for a signed-in user, and a page with no chat room of its own opens on the new-topic chat instead of the "start a topic" call to action it shows today.

Not in this change: a Topic made for a Team from the chat. The team page keeps the team chat as its default and reaches the new-topic chat through the menu. Also left out: any change to what the editor modal does.

## Capabilities

### New Capabilities
- `topic-creation-chat`: the new-topic conversation, its route and persistence, the wizard Carl runs, the move to the new Topic's page, the first-topic welcome on the homepage, and where the chat is reachable.

### Modified Capabilities
- `topic-tools`: two more tools, `createTopicFromDraft` and `suggestTopicDraftSources`, with their gates inside and the create path shared with the editor.
- `mcp-server`: the same two tools on the server, account-only.
- `feed-homepage`: topic creation beside Refresh gains the first-topic welcome, a create from the chat lands on the new page the way the modal's does, and a user who owns nothing but follows some lands on their subscribed topics.
- `source-suggestion`: a second caller, the chat tool, under the same rules and the same daily limit.

## Impact

- **api:** `api/chat/turns.ts` gains the new-topic page kind, its three routes, and its authorization; `api/tool/topicTools.ts` gains the two tools; `api/tool/chatTools.ts` gains the new-topic adapter; `api/mcp/tools.ts` registers the two tools; `api/topic/topics.ts`'s `createTopic` takes the Prompt Version origin. `savePromptVersion` moves to `api/topic/promptVersions.ts`, so the tools may call the create path without an import cycle.
- **worker:** `streamChatReply` gains a third branch with no retrieval beyond the docs, and a new `chat-new-topic.md` prompt.
- **ui:** the chat page and chat id gain the new-topic kind; the panel's default choice, its auto-open at time zero, the menu row, the composer placeholder, the draft card, the files held for the new Topic and uploaded once it exists, the homepage's page context, and the navigation on creation.
- **shared:** the Topic Draft contract, sent with every new-topic chat turn, the conversation's `isFirstTopic`, the tool calls the stream ends with, as an object with the draft and the created Topic, and the `topic_created` event's origin.
- **Schema:** none. `chat_turns` already allows a row with no Topic and no Team.
- **Skills:** the `domain-model` Topic Tool row and the new-topic chat.
