## Why

The new-topic chat creates every topic shared by invite and tells the user to change the visibility on the topic page afterwards, so a public or a private topic takes a second trip. And the app has two ways to make or edit a topic, the form and the chat, but the New Topic button and the Edit topic option only open the form, so the chat is found only by those who already know the panel's switcher.

## What Changes

- The new-topic chat asks who should see the topic and writes the answer into the draft: public, by invite, or private. The draft card shows it, the create saves it, and the prompt no longer says visibility is the editor's default.
- `create_topic` on the MCP server takes the same optional `visibility`.
- The New Topic button on the home, activity, and profile pages opens a small dialog first: make the topic yourself in the form, or make it with Carl in the new-topic chat.
- The Edit topic option on a topic page opens the same dialog: edit it yourself in the form, or edit it with Carl in the topic's private chat.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `topic-creation-chat`: the wizard gains a visibility step and the draft a visibility field; the New Topic button offers the chat.
- `topic-editing`: creation and editing each start with a choice between the form and Carl.
- `mcp-server`: `create_topic` takes a visibility.

## Impact

- `shared/contracts.ts` (`topicDraftPayload`), `api/tool/chatTools.ts`, `api/tool/topicTools.ts`, `api/mcp/tools.ts`, `worker/chat/index.ts`, `worker/prompts/chat-new-topic.md` (v2).
- `ui/src/components/topic/TopicEditorChoiceDialog.tsx` (new), `TopicDraftCard.tsx`, `useTopicChat.ts`, `HomePage.tsx`, `ActivityPage.tsx`, `ProfilePage.tsx`, `TopicPage.tsx`.
- The docs pages for making and editing a topic in chat.
