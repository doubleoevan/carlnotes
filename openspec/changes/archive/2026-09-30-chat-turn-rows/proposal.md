## Why

The specs call a `chat_turns` row a "ledger row" and the table "the chat spend ledger". Ledger is now a rejected
term: the code and the domain model say chat turn row, or spend row where the point is what it bills. Two small gaps
sit beside that wording. A private chat turn's row never records its token total, though a chat room turn's does. And
only the topic chat counts a turn a spent budget rejected, so the team chat and the new-topic chat lose that signal.

## What Changes

- The chat requirements name a `chat_turns` row a chat turn row, and its spend a spend row, instead of a ledger row.
- A private chat turn's row records its token total beside its cost, as a chat room turn's row already does.
- A turn a spent budget rejects is counted as `chat_budget_reached` on every private chat: a Topic's, a Team's, and
  the new-topic chat. Only the topic chat counted it before.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `team-chat`: the mention, billing, and team room requirements say chat turn row instead of ledger row, and the
  billing requirement is renamed to say rejected instead of refused.
- `topic-tools`: the chat adapter requirement meters a tool-firing turn as a chat turn row instead of through the chat
  ledger.
- `topic-chat`: clearing keeps the spend rows, a tool-firing turn is saved as a chat turn row, and metering records
  each turn's token total and counts every private chat's budget rejection.

## Impact

- `api/chat/chatTurns.ts`: one builder writes both spend columns, the token total and the cost, for a private chat
  turn's row and a chat room turn's row.
- `api/chat/privateChat.ts`: a spent budget's outcome names its user, and one rejection path counts the event for all
  three private chat routes.
- No migration. `chat_turns.total_tokens` already exists and nothing reads it yet.
