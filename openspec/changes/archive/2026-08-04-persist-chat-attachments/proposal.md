## Why

Chat attachments are ephemeral by design: an image or PDF rides to the model for one turn and is discarded. What survives is only what Carl happened to write about it. A live test on a real manuscript exposed the gap directly: after several turns, asking "how does it end?" got a confident, specific answer built entirely from Carl's first-pass summary — accurate to what he'd said, but a detail he never mentioned in that summary would have no way back into the conversation, even though the reader's intent was plainly for Carl to keep it.

Readers want the option to make an attachment stick: not just live in Carl's memory of *saying* something about it, but be re-delivered to every future turn on that topic, the same way an owner's topic attachment already works.

## What Changes

- A signed-in reader can mark a chat attachment "keep" at send time. After the turn completes, it is durably stored — the original bytes for an image or PDF, the raw text for a paste or text file — and a compact summary is generated once.
- That summary rides into every future turn *that reader* takes on *that topic*, independent of conversation length or compaction — a new per-(reader, topic) channel, parallel to but distinct from the existing owner-only topic attachment context.
- A hard cap (20 kept items per reader per topic) bounds the per-turn cost this channel can add.
- Kept text is encrypted at rest, matching the existing chat-turn text.
- Deleting a topic or an account cascades its kept attachments.

## Impact

- Affected specs: `topic-chat` (new requirement: durable per-reader chat attachment memory)
- Affected code: `db/schema.ts` (new table), `shared/contracts.ts`, `shared/enums.ts`, `worker/attach.ts`, `worker/store.ts`, `worker/chat/retrieve.ts`, `worker/chat/index.ts`, `worker/prompts/chat-topic.md`, `api/topic/chat.ts`, `api/index.ts`, `api/admin.ts`, `ui/src/components/chat/*`
- Out of scope: a management UI to browse or bulk-delete kept attachments (a single kept item can still be deleted via its own row); raising the per-item size ceiling above what live chat attachments already allow; sharing a kept attachment's context with other readers of the same topic.
