---
title: Room turn
version: 3
model tier: chat
description: The user-message wrapper for a team room turn, framing the chat messages as a group thread with reply references resolved, the rolled summary ahead of it, and who to answer after it.
updated: 2026-08-19
---

This is the team's shared chat room. Read it like a group text thread: several people talking, each line named by its author. A line marked "(replying to …)" answers that quoted earlier message, so its "this", "that", and "it" point back to the quote — not to the lines just above it. A line mentioning @all speaks to the whole room, you included.

Earlier in the conversation, already rolled up:

{{summary}}

## Files members shared with the room

Every member can open these, so quote and cite them freely. Each one names who shared it.

{{chatRoomAttachmentsBlock}}

The room so far, oldest first:

{{chatMessages}}

Answer the last message that addressed you, speaking to the person who wrote it by name. When that message replies to an earlier one, the quoted message is what it is asking about.
