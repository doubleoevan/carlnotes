## Context

`extractText` in `packages/pipeline/attachText.ts` parses a PDF with unpdf, a Word file with mammoth, and a workbook
with exceljs, all synchronous work on the calling thread. Three api paths call it on the event loop: a chat turn's
attachments in `chat/chatAttachmentScreening.ts`, a kept chat attachment in `chat/attachments.ts`, and a chat room
post's file in `chat/roomAttachments.ts`. The Temporal worker's own extraction in
`apps/worker/workflows/processAttachmentActivities.ts` runs on no request path and stays as it is. It and the api's
worker thread both call the one `extractText`.

Measured on 2026-10-22, with the minute gauge line's histogram settings (20 ms resolution) on a MacBook, Bun 1.4.3,
over text PDFs printed by `cupsfilter`:

| PDF | Text | Extraction | Event loop delay, largest | p99 |
|---|---|---|---|---|
| 137 KB | 546 thousand characters | 588 ms | 567 ms | 4 ms |
| 913 KB | 4.0 million characters | 3,479 ms | 3,459 ms | 39 ms |
| 9.2 MB | 41 million characters | 231,604 ms | 231,591 ms | 414 ms |

The 9.2 MB file is a 12.3 million character data url, inside `CHAT_PDF_DATA_CHARS` (14 million). It was not sent to
production, since it would stall a replica for minutes and fail its health check. Production's render numbers, which
show the render path does not stall the loop, are in the `split-web-from-api` design.

## Goals / Non-Goals

**Goals:**

- No extraction blocks the api's event loop, and a chat turn, a kept attachment, and a room post read the same text
  they read today.
- Each file is extracted once, through one helper that the chat turn and the chat room post share.
- A file past its deadline tells the user whether it is too large to read or waited behind other files, apart from a
  file that cannot be read, and never fails another user's file.

**Non-Goals:**

- A pool of worker threads. Production runs each api replica on one vCPU, so a second thread adds memory for a second 10
  MB parse without reading files faster. One thread reads one file at a time, which the 90 s deadline bounds.
- Fairness between users. A user who sends one slow file after another holds the worker thread for 90 s each, and the
  files behind it wait. Before this change, the same file stalled every request on the replica for as long.

## Decisions

### 1. One persistent worker thread per process

`attachmentExtraction.ts` creates one Bun `Worker` from `attachmentExtractionWorker.ts` on the first extraction and
keeps it. The worker thread is unreferenced, so it never keeps a process alive. Each request carries an id, the content
type, and the bytes. The bytes' `ArrayBuffer` is transferred, not copied, so the caller must not read them afterwards. A
view into a larger buffer is copied first, so only its own bytes cross. The worker thread posts the text or the error's
message. Its caller reads any failure but the deadline as an unreadable file, so no error type crosses the thread.

The transfer and the message round trip add under a few milliseconds to the turn's wait. With the worker thread, the 913
KB PDF measured 3,062 ms of extraction and a largest event loop delay of 20 ms, against 3,459 ms on the loop.

A Temporal activity was rejected. It adds a workflow start and a queue poll, hundreds of milliseconds to seconds, puts a
chat turn behind the worker service's health, and Temporal's 2 MB payload limit would route a 10 MB file through R2
first.

### 2. One queue, and a 90 s deadline per request

The worker thread reads one file at a time, from a queue on the main thread in arrival order, so a 231 s PDF would hold
every later file behind it. Each request's files share one deadline, 90 s after its first file, from
`toExtractionDeadline`. The deadline includes waiting, since the client waits for it either way, and it sits under the
server's 120 s idle timeout, so a chat turn of four files still gets its 413 instead of a closed connection. A file past
its deadline stops only its own read. A waiting file leaves the queue. The file being read stops the worker thread, and
the next file starts on a new one, so no file fails for another file's deadline. A request the worker thread cannot
take, such as one whose bytes were already transferred, rejects and frees the queue. The 9.2 MB PDF is rejected at 90 s,
and decision 4 says what the user reads.

An apply that posted every file to the worker thread at once, each with its own 60 s timer from the post, was replaced:
one user's slow file stopped the worker thread and failed every file another user had waiting, and four slow files ran
240 s, past the idle timeout.

### 3. Each file is extracted once, and the text is stored with the attachment

Before this change, a kept PDF, Word file, or workbook on a chat turn was extracted twice. `resolveChatAttachments`
extracted it for the model, and after the reply `storeTopicChatAttachment` in `chat/attachments.ts` decoded the same
data url and extracted it again to store its text. Nothing else extracts a file twice. A chat turn's history sends
each earlier turn's question, answer, and tool calls, never its files. A kept attachment's later turns read the row's
stored `context`. A chat room post extracts its file once, and its row stores the screened text.

The fix stores the text with the attachment. `resolveChatAttachments` returns each storable PDF, Word file, or workbook
as a `StorableChatAttachment` that includes `extractedText`, the text held to the attachment text limit, and the store
screens and summarizes that text. The type requires the text on those kinds, so the store has no extraction left to
call. The stored text is unchanged: the store held the text to the same limit before screening it.

A cache keyed by the file's content hash was rejected. No path re-extracts a file across requests, so the cache would
serve only a user who attaches the same file again. It would also put a private document's text in Redis
unencrypted, where Postgres stores chat text encrypted.

`readChatAttachmentText` in `chat/chatAttachmentScreening.ts` is the one helper both paths read a file through: it
decodes the data url, resolves the content type, extracts in the worker thread, holds the text to the limit, and logs
and reports a failure. A chat room post passes the bytes it already decoded, since it stores them after the post.
`decodeDataUrl` now copies the decoded buffer whole: `Uint8Array.from` copied it one byte at a time, 204 ms of the event
loop for the 9.2 MB PDF, against 4 ms.

### 4. A file past its deadline says whether it was too large or waited

A file whose read runs past its deadline, or whose request is out of time before it is posted, rejects with an
`AttachmentTimeLimitError`, and the helper returns `attachmentTooLarge`. A file that waits behind other files until its
deadline rejects with an `AttachmentBusyError`, and the helper returns `attachmentBusy`: the file was fine, so the user
is asked to send it again instead of to send a smaller one. Any other failure returns `attachmentUnreadable`.

A chat turn responds 413 for a file too large to read, the status the body limit already returns for an oversized file,
503 with a 30 s `Retry-After` for a busy one, as the voice route's busy transcription does, and 422 for a file that
cannot be read. Each names its rejection in `error`, from `CHAT_ATTACHMENT_ERRORS`. The client reads a 413 and a 422 as
their own chat rejections only for a chat turn, so a voice route's 413 or 422 still reads as failed, and reads a 503 as
busy only if its error names a busy file, since a proxy in front of the api answers 503 too.

The chat panel says "That file is too large for Carl to read. Try a smaller one.", "Carl is busy reading other files.
Send that file again in a moment.", and "Carl couldn't read that file." Before this change, every one read as "Carl lost
his train of thought. Try again?", and trying again could not help. The busy sentence shows no retry button, since the
button resends the question without its files. A chat room post responds 400 with `attachment too large` or `attachment
busy`, and the room tells its poster "Those files didn't post. One of them is too large to read. Share a smaller one."
or "Those files didn't post. Carl is busy reading other files, so share them again in a moment." The rejection names and
the error strings live in `packages/contracts/chat.ts`, which the api and the client both read.

### 5. A PDF reads only the pages its text limit keeps

unpdf's `extractText` reads every page at once. The 9.2 MB PDF grew the process to 3.5 GB of memory by 90 s, past the 2
GB a production replica has, so the replica would be stopped before any deadline. A chat keeps only the first
`CHAT_ATTACHMENT_TEXT_CHARS`, 50,000 characters, of a file. `extractText` in `packages/pipeline/attachText.ts` now reads
a PDF's pages in order, freeing each page, and `extractTextUpTo` stops once its text passes `maxChars`, merging the
pages as unpdf's own
`mergePages` does. The worker thread passes the attachment text limit and clips the text before posting it, so only the
clipped text crosses back, and the main thread never holds the whole text. Measured through the worker thread:

| PDF | Before: extraction, peak memory | After: extraction, peak memory | Event loop delay, largest |
|---|---|---|---|
| 137 KB | 588 ms on the loop | 146 ms, 56 MB | 1 ms |
| 913 KB | 3,479 ms on the loop, 0.8 GB | 133 ms, 60 MB | 1 ms |
| 9.2 MB | 231,604 ms on the loop, 3.5 GB at 90 s | 182 ms, 78 MB | 1 ms |

The topic attachments the Temporal worker reads still read every page, now one at a time, since their row records the
whole document's character count. A Word file and a workbook are read whole by mammoth and exceljs, as before.

The chat clip's marker names the attachment's whole length, as before: "[The attachment is cut here. It runs 4,019,109
characters and only the first 50,000 are included.]" A PDF that stops reading pages early does not know its character
count, so `extractTextUpTo` returns its page count, which pdf.js reads before any page, and the marker names the pages
instead: "[The attachment is cut here. It runs 9,073 pages and only the first 50,000 characters are included.]" The
9.2 MB PDF reads that way in 367 ms, peaking at 87 MB.

A worker thread that exits on its own rejects the file it was reading, as a worker thread that fails does, and the next
file starts on a new one.

## Risks / Trade-offs

- [The worker thread loads its own copy of unpdf, mammoth, and exceljs] → about one more module graph of memory per
  process, paid on the first extraction. An idle worker thread's heap falls back to 60 to 90 MB.
- [A large Word file or workbook is still read whole] → mammoth and exceljs have no page-by-page read. A file past its
  deadline still stops only its own read.
- [A read is not stopped when its client disconnects] → it runs until it finishes or reaches its deadline, at most
  90 s, and a PDF now reads in under a second.
- [A rejected file that once read in 90 to 120 s] → no such file was measured. The 913 KB PDF, 4 million characters,
  reads in 3 s.
- [Room posts have no per-user rate limit] → a team member can post slow files back to back. Adding one changes how
  often anyone may post in a team chat, so it waits for that decision.

## Migration Plan

Ship it. No setting, routing, or schema changes. Rollback is reverting the commit.
