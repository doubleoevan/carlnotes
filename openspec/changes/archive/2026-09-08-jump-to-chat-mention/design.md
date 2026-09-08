## Context

A chat room is a Postgres message log with ordered ids, streamed over SSE with a cursor. The cursor
runs forward: `loadChatRoomMessages(topicId, teamId, afterChatMessageId)` returns the latest 500 rows
past a cursor, reversed back into id order, and the SSE catch-up passes the last id it saw. The
initial load passes 0, so it returns the latest 500 of the whole room.

Nothing reads backward. There is no `before` cursor on the route, no `startReached` on the list, and
no request for a page above the one held. A room longer than 500 messages ends at 500 with nothing
saying so.

Mentions are already per message. `room_mentions` is keyed on `(message_id, user_id)` with a nullable
`seen_at`, and `message_id` references the message with `onDelete: "cascade"`. `saveSeenChatMentions`
sets `seen_at` for every unseen mention in the room when it is opened. The badge reads unseen rows
through `toChatMention`, which shapes `teamId`, `authorUsername`, `isReply`, and `excerpt` and drops
the message id.

The scroll itself is solved. `scrollToChatMessage` takes a message id, uses `scrollIntoView` on the
element while the list is a plain one under 30 messages, and `scrollToIndex` on the virtualized list
above that, because the target bubble may not be mounted. Its only caller today is a reply quote.

## Goals / Non-Goals

**Goals:**

- Opening a room from a mention badge loads the message that named the reader.
- With several unseen mentions, it loads the earliest, so reading forward passes the rest in order.
- A mention above the loaded page is reached by loading earlier pages, not by giving up.
- Scrolling to the top of a room loads the page above it, so a long room stops ending silently.
- The reader's scroll position does not jump when a page is prepended.

**Non-Goals:**

- An unread divider. Chat has none, and where "new" begins is a separate question from where a
  mention is.
- Marking each mention seen as it enters the viewport. Opening the room still clears them.
- Deep-linking a room from outside the app. The jump is a panel interaction, not a URL.
- Paging the solo topic chat transcript, which is a different component with its own compaction.

## Decisions

### The cursor reads backward with a separate parameter, not a signed one

`loadChatRoomMessages` grows a `beforeChatMessageId` beside its `afterChatMessageId` rather than
overloading one cursor with a direction. The forward path feeds the SSE catch-up on every reconnect,
and is the one place a mistake replays or drops live messages. Keeping it untouched and adding a
second parameter means the streaming path cannot regress from this change.

Both paths still order by `desc(id)` under the limit and reverse into id order, so a page reads the
same way whichever end it came from.

### The jump loads earlier pages until the target arrives, bounded by the room

The badge hands the panel a message id. If it is already loaded, `scrollToChatMessage` runs. If not,
the list asks for the page above the earliest message it holds and looks again, repeating until the
target is loaded or a page comes back short, which means the room has no more.

The loop is bounded by the room's own length, not by a fixed number of tries. A room that has grown
past what a reader will scroll is still finite, and every page is one indexed query on
`(topic_id, team_id, id)`. A fixed limit was rejected because it would reintroduce exactly the
failure this change exists to remove: a mention the badge points at and the jump cannot reach.

The cost is one round trip per page, so a mention five thousand messages back takes ten of them before
it loads. Loading a window around the target id instead would take one, and was rejected: the window
would not touch the latest page the room already holds, leaving two ranges with a gap between them, and
a gap is a data model the list has no way to draw. Paging back keeps one contiguous list, which is what
every other part of this design depends on.

### Prepending moves firstItemIndex so the reader stays where they are

react-virtuoso keeps a reader's position across a prepend only when `firstItemIndex` decreases by the
number of items added. The list holds it in state and lowers it by the count that actually arrived,
which is the page limit for a full page and fewer for the last one. Without it, prepending 500 rows
scrolls the reader up by 500 rows.

It starts at 1,000,000, which is 2,000 pages of headroom before it could reach zero. Reaching that in
one sitting means paging back through a million chat messages without the room reloading, so no rebase
is needed. Loading a room afresh starts the count over.

The plain list under 30 messages needs no equivalent. It is shorter than one page, so there is never
an earlier page for it to load.

### A mention whose chat message is gone is cleared, and the reader is told

Paging back ends at the room's first chat message, since a page shorter than the limit has nothing
above it. So running out of pages without finding the target does not mean the target is old. It means
the chat message is not in the room at all, which a mention can only outlive by being deleted between
the badge being read and the jump finishing, because `room_mentions.message_id` cascades. The reader
stays where the room opened, a plain line says the chat message is no longer in the room, and the
mention is marked seen.

Leaving it unseen was rejected: the badge would survive opening the room, and no action available to
the reader could ever clear it. A badge that cannot be discharged is worse than one that says its
target is gone and goes away.

### The target is chosen before the room clears its mentions

The badge picks the target when the menu row is clicked, from the mentions it already holds, and hands
it to the panel store. Opening the room then marks every mention seen. The order matters: the store
holds the target independently of the badge data, so clearing the badges cannot take the target with
them, and the jump still has somewhere to go.

### The earliest unseen mention is the target

Reading forward from the earliest unseen mention passes every later one in order, so one jump serves a
room holding several. The latest was rejected: it leaves the earlier ones above the one it loads,
which is the position they were already in when they went unnoticed.

## Risks / Trade-offs

- **A jump into a long room issues several queries before it loads.** Each is indexed and returns at
  most one page, and it happens only when a reader opens a badge whose mention is old. The
  alternative, one query with an offset computed from the mention, ties the load to a row count that
  changes under it.
- **Prepending is the part most likely to look wrong.** A wrong `firstItemIndex` does not error; it
  scrolls the reader somewhere unexpected. The scenarios cover position after a prepend directly,
  rather than only covering that the earlier page arrived.
- **A failed request for an earlier page is not told apart from a room that ran out.** Both leave the jump
  without its target. Exhaustion says so and clears the badge; a network failure says nothing, and the
  target stays pending until the next render retries it, which a live room reaches quickly through its
  own stream. The reader is left where the room opened either way, so nothing is lost, but a reader on
  a bad connection is told nothing. Distinguishing them needs a second piece of state and its own copy,
  which is more surface than this path has earned.
- **`seen_at` still clears per room, not per mention seen.** A reader who opens a room and closes it
  without reading loses every badge in it, exactly as today. The jump narrows this by putting the
  earliest unseen mention on screen, but does not close it. Per-mention seen tracking stays available
  later, since the column is already per pair.
- **Backward paging makes a room's whole history reachable.** That is the point, and it means an old
  message a member expected to have scrolled past is now findable. Nothing was ever deleted or
  hidden, so this exposes no message the reader could not already have loaded by other means.
