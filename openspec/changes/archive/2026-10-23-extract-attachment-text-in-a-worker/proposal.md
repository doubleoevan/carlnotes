## Why

A chat attachment's text is extracted on the api's event loop, the loop that serves every request and holds every SSE
chat and note stream. A 913 KB PDF stalls that loop for 3.5 s, past the minute line's 2 s stall warning, and a 9.2 MB
PDF, inside the 14 million data url characters `CHAT_PDF_DATA_CHARS` allows, stalls it for 231 s. Every user on the
replica waits that long, and the platform's health check fails during it. Page renders do not do this: a render burst
at the render limit measured an event loop p99 of 10 ms at most. This change moves the extraction off the loop. The
web service split it was planned beside moved to the unapplied `split-web-from-api` change.

## What Changes

- The api extracts a PDF's, a Word file's, or a workbook's text in one persistent Bun `Worker` thread per process, for a
  chat turn and a chat room post. The bytes are transferred to the thread, and the thread returns the text or the error.
- Each file is extracted once. A kept chat attachment stores the text its chat turn extracted instead of extracting the
  file again, and the chat turn and the chat room post read a file through one shared helper.
- The worker thread reads one file at a time, and a request's files share one 90 s deadline, under the server's 120 s
  idle timeout. A file past its deadline stops only its own read, and the files waiting behind it go to a new worker
  thread. A file whose read ran past its deadline reads as too large, and a file that waited behind other files reads as
  busy and is sent again: a 413 or a 503 on a chat turn, and `attachment too large` or `attachment busy` on a chat room
  post. A file that cannot be read says so on a chat turn, where every one read as a generic failure before.
- Decoding a file's data url copies the decoded buffer whole, 4 ms for a 9.2 MB PDF instead of 204 ms.
- A PDF reads its pages in order and stops once its text passes the 50,000 characters a chat keeps, so a 9.2 MB PDF
  reads in under half a second instead of growing the process to 3.5 GB. The worker thread clips the text before
  posting it, and the marker names a cut PDF's pages.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `topic-chat`: attachment text is extracted once, off the event loop, within a deadline that tells the user whether the
  file was too large or waited behind other files.

## Impact

- Adds `apps/api/chat/attachmentExtraction.ts` and `apps/api/chat/attachmentExtractionWorker.ts`.
- `chatAttachmentScreening.ts` holds `readChatAttachmentText`, which the chat turn and `roomAttachments.ts` share,
  and `attachments.ts` stores the text the chat turn read. `room.ts` and `roomRoute.ts` return the new rejection.
- `packages/client/chatClient.ts` and `chatRoomClient.ts` read the new rejections, and the chat panel and the chat
  room show them.
- No Northflank, Doppler, or schema change.
