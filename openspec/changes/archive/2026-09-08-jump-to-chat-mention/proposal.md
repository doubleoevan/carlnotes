## Why

A chat mention badge opens the room and drops the reader at the latest message, then clears itself.
Nothing marks where they were named. In a busy room the mention can sit hundreds of messages back,
and the badge that was the only pointer to it is gone. The excerpt on the badge tells them whether to
go looking; it cannot tell them where.

The pieces are already here. `room_mentions` records the message and the member it named, with a
`seen_at` per pair. `scrollToChatMessage` already jumps to a message in both list modes, and handles
the virtualized case where the target is not mounted. It has one caller: clicking a reply quote. The
mention badge cannot use it, because `ChatMention` drops the message id when it shapes the row.

Reaching an earlier mention exposes a second gap. A room load returns the latest 500 messages and there
is no way to ask for more: no `before` cursor on the route, and no `startReached` in the list. A room
past 500 messages silently ends there. Scrolling up stops at a wall with nothing to say it is a wall,
which is a defect in its own right and the reason a mention can be unreachable at all.

## What Changes

A mention becomes a place, not just a count.

- `ChatMention` carries the message id it already has in the database, so the badge can name a target.
- Opening a room from a mention badge loads the earliest mention the reader has not seen, instead of
  the latest message. Reading forward from there passes every later mention in order.
- A room load takes a `before` cursor naming a chat message id, so the list can load the page above
  the one it holds. The cursor is exclusive: a page holds only chat messages below it, never the one
  named, so an earlier page never repeats what the list already has. The jump loads earlier pages until the
  target is loaded, and stops when the room has no more.
- Scrolling to the top of a room loads the page above it, so a room over 500 messages stops ending
  without saying so.
- A mention that no jump could reach is still cleared on open. A badge nothing can act on is worse
  than one that goes away.

The mention stays cleared by opening the room, as it is today. Marking each mention seen only as it
enters the viewport was considered and rejected: it needs viewport tracking per bubble, and the jump
already puts the earliest unseen one on screen, which is the case that mattered.

A deleted message needs no rule. `room_mentions.message_id` cascades, so a mention never outlives the
message that made it.

## Capabilities

### New Capabilities

None. Both changes extend how a room already loads and how its panel already opens.

### Modified Capabilities

- `team-chat`: a room load SHALL take a cursor for the page above the one loaded, and reaching the top
  of the list SHALL load it. Opening a room from a mention badge SHALL load the earliest unseen
  mention, loading earlier pages until it is reachable, and SHALL say so when the room runs out first.

## Impact

- `shared/contracts.ts`: `ChatMention` gains the message id. `toChatMention` in `api/chat/mentions.ts`
  stops dropping it.
- `api/chat/roomMessages.ts`: `loadChatRoomMessages` grows a `before` cursor beside its `after` one.
  The `after` path feeds the SSE catch-up and does not change.
- `api/chat/room.ts`: the room message routes pass the cursor through.
- `ui/src/clients/chatRoomClient.ts`: a call for the page above a known message id.
- `ui/src/components/chat/ChatRoomMessages.tsx`: `startReached` loads the earlier page, and prepending
  moves `firstItemIndex` so the reader's position does not jump. The plain list under 30 messages
  needs neither, since it is shorter than one page.
- `ui/src/components/chat/AppChatPanel.tsx`: opening from a badge passes the target message id.
- No migration. `room_mentions` already holds the message id and a per-mention `seen_at`.
- Cost: one extra query per page a reader scrolls back through, bounded by the room's own length.
