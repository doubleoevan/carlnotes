## Context

`chat_attachments` today holds only what a reader chose to keep for a topic, keyed by `(user_id, topic_id)` with an index on that pair. That one query drives both the composer's manage list and the keep limit. An attachment the reader did not keep is sent to the model and discarded, so its bytes exist nowhere after the turn ends.

The team room solves the same problem one table over: `room_attachments` records a `message_id`, and the room's message list renders each image through `SharedImage`. That is the shape to match.

## Goals / Non-Goals

**Goals:**

- A question's images reappear in its own bubble on a reload and on another device.
- The per-turn attachment payload the api returns matches `ChatRoomMessage`'s.
- The keep limit query stays exactly as cheap as it is now.
- No turn spends more tokens than it does today.

**Non-Goals:**

- Showing the image the instant the question is sent, before a reload. A fresh turn has no attachment ids yet, and the question's `[attached: …]` note already names what went with it.
- Rendering pdf or text attachments in the bubble.
- Sharing a reader's attachment with any other reader.
- Changing which media types are served in place. That allowlist is the one place disposition is decided and it deliberately leaves out SVG.

## Decisions

**One column on `chat_attachments`, not a join table.** A join table would keep the kept-for-this-topic query untouched, but it duplicates the whole storage, download, and delete path for a second table. Resending a file already writes its own row today — nothing deduplicates by content — so many-turns-to-one-attachment is a case the code cannot currently produce. A nullable `chat_turn_id` is the smaller change.

**The keep limit query stays on its existing index.** Both reads still filter `(user_id, topic_id)` and now add `is_kept`, which the index still serves. Grouping a conversation's attachments by turn happens in memory off that same single read, so no index on `chat_turn_id` is needed.

**Retention: an unkept image is stored, an unkept pdf or paste is not.** The two options were storing everything and letting `keep` control only re-reading, or storing for the transcript while excluding from the model context. The second is chosen. Storing everything means a `generateImageContext` or `generateContext` call per attachment and a larger prompt on every later turn, which would raise the cost of a feature that is only meant to draw a picture. An unkept attachment therefore stores an empty `context` and never reaches the model. A pdf or a paste is left unstored entirely: its words are already folded into the turn, the bubble cannot render it, and its name is already in the question's note — bytes for it would buy nothing.

**`is_kept` defaults to true, so there is no backfill.** Every row that exists today is a kept row, so the column default makes them all correct as the migration adds it. Both insert paths pass the value explicitly.

**A turn that stores no text stores no unkept image.** When the gate denies `chat:persist`, the turn writes a meter row with null text and is never replayed, so there is no bubble for an image to appear in. The store call receives a null chat turn id in that case and skips unkept images, while a kept attachment still stores because it belongs to the topic instead of to the turn.

**The bubble renders images only.** The room shows a name row beside each shared file because a room message has no other record of what came with it. A private question already ends in `[attached: …]`, so a name row would repeat what the reader can read one line above.

## Risks / Trade-offs

- **Storage grows with images sent, not only images kept.** Every image a reader sends now holds bytes for as long as the conversation does. Clearing a conversation, deleting the topic, and closing the account each already delete every `chat_attachments` row for that scope, so the new rows are collected on the same paths. The admin console's per-user storage sum counts them, which is correct — they are real stored bytes.
- **Deleting a kept attachment also removes it from its question's bubble.** One row is one file, so freeing a keep slot takes the picture out of the transcript. The alternative is storing the same bytes twice.
- **An SVG sent as an image shows as a broken image.** The disposition allowlist deliberately excludes SVG, so the file downloads instead of rendering and the `img` fails. The room behaves identically for the same reason, and widening the allowlist would let a document that can hold script run in this origin.
- **Two attachments on one turn can tie on `created_at`.** Their order within the bubble is then unspecified. The room orders shared files the same way.
