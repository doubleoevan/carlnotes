## Why

A topic made or edited with Carl takes the editor's defaults for its tags, how often it brews, and how many findings a brew keeps, and the only way to change them is the form. A reader who says "daily" or "keep twenty" to Carl is sent to the topic page.

## What Changes

- The Topic Draft gains `tags`, `frequency`, and `maxTopicFindings`, each optional with the editor's default: no tags, weekly, ten. `draftTopic` writes them, the card shows them, and the create saves them.
- The edit chat gains `updateTopicFields`, which changes any of the three on the topic through the same gate as the prompt tool, and the MCP server gains `update_topic_fields`.
- Both prompts name the settings as optional: the wizard offers them once before the read-back, and the edit prompt lists the new tool.

## Capabilities

### Modified Capabilities

- `topic-creation-chat`: three more draft fields and an optional settings step.
- `topic-tools`: the `updateTopicFields` Topic Tool.
- `topic-chat`: the edit chat offers the settings tool.
- `mcp-server`: `update_topic_fields`, and `create_topic` takes the three fields.

## Impact

- `shared/contracts.ts`, `api/tool/chatTools.ts`, `api/tool/topicTools.ts`, `api/mcp/tools.ts`, `worker/chat/index.ts`, `worker/prompts/chat-new-topic.md` (v4), `worker/prompts/chat-edit-topic.md` (v3), `ui/src/components/chat/TopicDraftCard.tsx`, the two chat docs pages.
