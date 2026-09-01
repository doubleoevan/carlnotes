## Why

The private topic chat sends a question's image attachments to the model and then loses them. The question bubble renders the typed words and nothing else, so a reader who attaches three screenshots and asks about them sees only their own sentence in the transcript — on a reload, and on every other device they sign in from. There is no data to render even if the bubble wanted to: `chat_turns` holds no attachment link, and `chat_attachments` is keyed by reader and topic, which makes it the files kept for a topic instead of the files sent with one question.

The team room already reads correctly. A shared image shows in place in the message that shared it. The private chat is the surface that does not.

## What Changes

- A chat attachment records the chat turn it was sent with, and whether the reader kept it.
- An image the reader did not keep is stored for the transcript. It stays out of the model's context, so no turn costs more than it does today.
- The chat conversation endpoint returns each turn's attachments as id, kind, and name — the shape a room message already has.
- The question bubble shows its images in place, each linking to the full file.
- The download route serves an attachment to the reader who sent it whether or not they kept it.

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `topic-chat`: a question's images now persist and replay in its own bubble. Before, an attachment persisted only when the reader kept it, and nothing tied a stored attachment to the turn that sent it.

## Impact

- `db/schema.ts` — `chat_attachments` gains `chat_turn_id` and `is_kept`. One migration, no backfill.
- `api/chat/attachments.ts` — storing every attachment a turn sent, grouping them by turn, and the download route.
- `api/chat/turns.ts` — the recorded turn answers its id, and the conversation load returns each turn's attachments.
- `worker/chat/retrieve.ts` — the model's context reads kept attachments only.
- `shared/contracts.ts` — `ChatMessageAttachment`, shared by `ChatTurnRow` and `ChatRoomMessage`.
- `ui/src/components/chat/ChatMessages.tsx`, `useTopicChat.ts`, `ui/src/clients/chatClient.ts` — the bubble render and its download url.
