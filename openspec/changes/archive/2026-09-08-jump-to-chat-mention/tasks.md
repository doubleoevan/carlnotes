## 1. Carry the message id to the badge

- [x] 1.1 Add the message id to `chatMention` in `shared/contracts.ts`, beside the excerpt that
      already stands in for it
- [x] 1.2 Stop dropping it in `toChatMention` in `api/chat/mentions.ts`. `UnseenChatMentionRow`
      already selects the row the id is on
- [x] 1.3 No migration. `room_mentions` is keyed on `(message_id, user_id)` and `message_id`
      cascades from the message, so a mention never outlives what made it

## 2. Read a room backward

- [x] 2.1 Add a `beforeChatMessageId` parameter to `loadChatRoomMessages` in
      `api/chat/roomMessages.ts`, beside the existing `afterChatMessageId`. Leave the forward path
      alone, since the SSE catch-up is the one caller that must not regress
- [x] 2.2 Pass the cursor through the room message routes in `api/chat/room.ts`
- [x] 2.3 Add the client call for the page above a known message id in
      `ui/src/clients/chatRoomClient.ts`
- [x] 2.4 Return whether a page was short, so the caller can tell "no more" from "not yet"

## 3. Load the page above on reaching the top

- [x] 3.1 Wire `startReached` on the virtualized list in
      `ui/src/components/chat/ChatRoomMessages.tsx` to request the page above the earliest message held
- [x] 3.2 Hold `firstItemIndex` in state and lower it by the number of rows prepended, so the reader
      stays on the message they were reading. Start it high enough that it never passes zero
- [x] 3.3 Leave the plain list under 30 messages alone. It is shorter than one page, so it has no
      earlier page to load
- [x] 3.4 Stop asking once a page comes back short, so a room whose first message is loaded makes no
      further request

## 4. Load the mention

- [x] 4.1 Pass the target message id from the badge through `AppChatPanel.tsx` when a menu row
      carrying a mention is picked
- [x] 4.2 On open with a target, jump when it is already loaded, otherwise load earlier pages until it
      is, then call the existing `scrollToChatMessage`
- [x] 4.3 Load the earliest unseen mention when the room holds several
- [x] 4.4 When pages run out before the target is found, leave the reader where the room opened and
      say the chat message is no longer in the room
- [x] 4.5 Mark the room's mentions seen on open either way, so a badge always discharges

## 5. Prove it

- [x] 5.1 Unit test the backward cursor in `api/chat/roomMessages.test.ts`: a page above a known id
      returns the rows before it in id order, and a short page reports itself
- [x] 5.2 Unit test choosing the earliest unseen mention as the target
- [x] 5.3 Extend `api/chat/room.smoke.ts` to prove the backward cursor against the real database: the
      page above a cursor holds only what is below it, comes back earliest first, and is empty above the
      room's first message. Crossing the real 500-message boundary would write 501 rows on every run,
      so the query is what the smoke proves and the paging loop is covered by its own unit tests
- [x] 5.4 Run `bun run check`, then `bun run smoke:room`

## 6. Documentation

- [x] 6.1 No structural change: no new folder, entry point, or script, so the module AGENTS.md files
      and the root routing table stay as they are
- [x] 6.2 Note the backward cursor beside the SSE cursor in the team-chat spec, which the delta
      already carries
