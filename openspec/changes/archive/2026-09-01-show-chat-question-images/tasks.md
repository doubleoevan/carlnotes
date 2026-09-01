## 1. Link an attachment to its turn

- [x] 1.1 Add `chat_turn_id` to `chat_attachments`, referencing `chat_turns` and clearing to null if that turn is ever deleted, so a kept attachment outlives it.
- [x] 1.2 Add `is_kept`, defaulting true so every row that exists today stays kept with no backfill.
- [x] 1.3 Generate the migration with `bun run db:generate`.

## 2. Store what a turn sent

- [x] 2.1 Rename `keepChatAttachments` to `storeTopicChatAttachments` and give it the turn id, so it stores every attachment instead of only the kept ones.
- [x] 2.2 Store an unkept image with an empty summary, and skip an unkept pdf or paste entirely.
- [x] 2.3 Skip an unkept image when the turn stored no text, since there is no bubble to show it in.
- [x] 2.4 Count only kept attachments against the keep limit, and let a keep past the limit store unkept.
- [x] 2.5 Return the recorded turn's id from `recordChatTurn` and pass it to the store call.

## 3. Keep the model's context unchanged

- [x] 3.1 Filter the worker's chat attachment context read to kept attachments.
- [x] 3.2 Filter the composer's kept attachment list and the keep-limit count to kept attachments.

## 4. Return a turn's attachments

- [x] 4.1 Add `ChatMessageAttachment` to the contracts and use it for both `ChatTurnRow` and `ChatRoomMessage`.
- [x] 4.2 Load a conversation's attachments off the existing reader-and-topic index and group them by turn in memory.
- [x] 4.3 Return each stored turn's attachments from the conversation endpoint.

## 5. Show them in the bubble

- [x] 5.1 Add `toChatAttachmentUrl` to the chat client.
- [x] 5.2 Render a question's images in `QuestionBubble` through a plain anchor, since the router would claim the api path.
- [x] 5.3 Include attachments on the UI's `ChatTurn` and map them from the loaded conversation.

## 6. Serve and verify

- [x] 6.1 Confirm the download route serves an unkept turn attachment to its sender and refuses every other reader, and rename it off "kept" now that it serves both.
- [x] 6.2 Scope the kept attachment delete to kept rows, so the composer cannot reach a transcript-only image.
- [x] 6.3 Cover the grouping and the four bubble render cases with tests.
- [x] 6.4 `bun run check` green.
- [x] 6.5 Apply the migration and confirm an image reappears after a reload in the running app.
