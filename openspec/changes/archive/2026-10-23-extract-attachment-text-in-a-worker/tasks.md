## 1. The extraction worker thread

- [x] 1.1 `apps/api/chat/attachmentExtraction.ts` and `attachmentExtractionWorker.ts`: one persistent Bun `Worker`
      reading one file at a time from a queue, bytes transferred, the text or the error returned, a 90 s deadline per
      request that rejects with `AttachmentTimeLimitError` and stops only the late file's read
- [x] 1.2 `readChatAttachmentText` in `chatAttachmentScreening.ts`, the one helper the chat turn and the chat room post
      read a file through; `decodeDataUrl` copies the decoded buffer whole
- [x] 1.3 A kept chat attachment stores the text its chat turn extracted: `StorableChatAttachment` includes
      `extractedText`, and `attachments.ts` no longer extracts
- [x] 1.4 A file too large to read: a 413 on a chat turn and `attachment too large` on a chat room post, read by the
      client as their own rejections and shown by the chat panel and the chat room; a 422 shows its own sentence
- [x] 1.5 Tests: the worker thread's text path, a view's own bytes, an unreadable file, a type with no extractor that
      keeps the worker thread serving, a late file that never fails the file queued behind it, a waiting file past its
      deadline as busy, bytes the worker thread cannot take; one extraction for a kept PDF and its stored text; the
      too-large, busy, and unreadable rejections on the api, the client, and the chat room notice; the marker's
      characters and pages
- [x] 1.6 `extractText` reads a PDF one page at a time and `extractTextUpTo` stops past `maxChars` with the page count;
      the worker thread reads to the attachment text limit and clips before posting; the clip marker names a cut PDF's
      pages; a worker thread that exits rejects its file
- [x] 1.7 Docs: `apps/api/AGENTS.md` names the two files and the helper, `packages/pipeline/AGENTS.md` the page read