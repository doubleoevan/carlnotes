# Tasks

## 1. The contract

- [x] 1.1 Add `video` to `chatAttachmentKinds` in `shared/enums.ts`, appended last so the db enum gains it additively
- [x] 1.2 Add `CHAT_VIDEO_DATA_CHARS` (25,000,000 — about 18 MB of file under base64) and a `video` payload variant to `chatAttachmentPayload` in `shared/contracts.ts`, a `data:video/` data url under that limit
- [x] 1.3 Generate the migration with `bun run db:generate`: one additive `ALTER TYPE … ADD VALUE 'video'`

## 2. The composers

- [x] 2.1 Add `CHAT_FILE_PICKER_ACCEPT` to `ui/src/lib/utils.ts` — the topic prompt's list plus `video/mp4`, `video/quicktime`, `video/webm` — used by both chat composers while the topic pickers keep the old list
- [x] 2.2 Classify the three video types in `toAttachment`, so the picker, the drop zone, and the paste path on both surfaces all take clips through the one shared function
- [x] 2.3 Reject a too-large clip client-side with a toast naming 18 MB, before any of it uploads, the way an oversized image already rejects
- [x] 2.4 Show a film icon on a pending video chip and on a kept video in the chat files list

## 3. Store and serve

- [x] 3.1 Pass video bytes through the store-by-object-key path images take, in both the room prepare path and the private keep path — no extractor, no screening
- [x] 3.2 Add `INLINE_VIDEO_TYPES` (mp4, quicktime, webm) beside the image allowlist in `toStoredFileHeaders`, leaving the svg exclusion standing
- [x] 3.3 Serve a room video inline through those headers, honoring one byte range against the row's stored size with Bun's `S3File.slice`, so Safari's range-requiring player can stream it. Every other stored kind stays a download
- [x] 3.4 Add the private turn's 26 MB `bodyLimit` to both room post routes, which had none
- [x] 3.5 Keep the range arithmetic in a pure `toVideoRange` (`api/chat/videoRange.ts`) with a unit test over its edges: bounded, open-ended, clamped, unsatisfiable, malformed, and sizeless asks

## 4. The player

- [x] 4.1 Add a shared `SentVideo` component — `<video controls preload="metadata">` with the bubble width and a max height — exported from `ChatMessages.tsx` the way the room already borrows `CarlThinkingBubble`
- [x] 4.2 Render it in the room bubble above each video's existing name-row and delete control, streaming the gated download url
- [x] 4.3 Render it under the private question bubble from the sent data url, carried on the local turn. A reload keeps the attachment note alone, matching every other private kind
- [x] 4.4 Cover the room render with a test: a video attachment draws a player at the gated url and keeps its named download row

## 5. Carl

- [x] 5.1 Resolve a private video into a fixed text part — "A video Carl can't watch yet." — so the model knows a clip was attached without a failed read
- [x] 5.2 Store a room video's row with that line as its context and status `ready` at post time, so the image description job never runs for it and no failed status appears
- [x] 5.3 Store a kept video's context as a fixed line naming the file, in place of the LLM-generated image summary
