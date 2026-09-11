## Why

A topic made with Carl lands on no team. The team page's Add Topic picker ends in a New topic option that opens the create form with the team preset, so the chat has no equivalent, and a user who asks Carl to add a topic to their team is told to do it afterward on the topic page.

## What Changes

- The Topic Draft gains a `team`, the id and name of one team the user leads, or none.
- The new-topic chat's prompt names the teams the user leads and asks which one the topic should join, after the visibility step. A draft that already names a team is kept, not asked again.
- `createTopicFromDraft` adds the created topic to the draft's team through the same leader-only path the picker uses, and reports a rejected add beside the created topic.
- The team page's New topic option opens the chooser, and its Build with Carl choice opens the new-topic chat with the team already on the draft.
- `create_topic` on the MCP server takes the same optional `team`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `topic-creation-chat`: a team step in the wizard, a team on the draft and the card, and the team page's New topic option.
- `mcp-server`: `create_topic` takes a team.

## Impact

- `shared/contracts.ts`, `api/tool/chatTools.ts`, `api/tool/topicTools.ts`, `api/chat/turns.ts`, `api/mcp/tools.ts`, `worker/chat/index.ts`, `worker/prompts/chat-new-topic.md` (v3).
- `ui/src/stores/chatPanelStore.ts`, `ui/src/clients/chatClient.ts`, `ui/src/components/chat/{AppChatPanel,useTopicChat,TopicDraftCard}`, `ui/src/components/topic/TopicEditorChoiceDialog.tsx`, `ui/src/pages/TeamPage.tsx`, the making-a-topic docs page.
