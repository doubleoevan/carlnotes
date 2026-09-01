# Design

## Transport stays the JSON data url, sized to fit under the existing limit

Attachments already travel as base64 data urls in the chat turn and room message bodies, and the private turn's `bodyLimit` is 26 MB. A video variant on the same union reuses every hop — validation, prepare, store — for the cost of one zod member. The limit constant is 25,000,000 data url characters, which is about 18 MB of file after base64's 4/3 growth and leaves room for the question and history beside it. The toast names 18 MB. Anything bigger needs the multipart path avatars use; that is a different change.

The room post routes had no body limit at all — the per-item zod limits were the only bound, which the larger video limit would have stretched to 100 MB across four attachments. They get the private turn's exact `bodyLimit` middleware. Four maximum-size clips on one message can still trip it server-side after each clip passed alone; the client-side check stays per-file, matching how every other kind rejects.

## Serving: inline through the existing header helper, plus byte ranges

`toStoredFileHeaders` gains an `INLINE_VIDEO_TYPES` allowlist — mp4, quicktime, webm — beside the image one, and the svg exclusion stands. Only the room's download route routes video through it; images and PDFs keep their download disposition, so nothing already shipped changes behavior.

Safari's player reads nothing from a server that ignores `Range` headers, so the video branch honors one `bytes=start-end` range: the stored row's `byteSize` answers the total, Bun's `S3File.slice` reads the piece, and an out-of-bounds ask answers 416 naming the size. Chrome plays a plain 200 stream; Safari needs the 206s. No transcoding: a codec the browser cannot decode shows the player's own notice, and the name row beside it still downloads.

## The private bubble plays from memory, not from storage

A private chat turn persists question and answer text only — no attachment rows ride the turn, and images sent today vanish from the transcript on reload, leaving the `[attached: …]` note. Video keeps that exact contract: the sent clip stays on the local turn as its data url so the just-sent bubble plays it, and a reload keeps the note alone. Making private clips replay from storage would mean linking turns to attachment rows, a schema change the keep flow deliberately avoided.

A kept video does store — bytes by object key under the existing keep path — with a fixed context line in place of the LLM-generated summary an image gets, since there is nothing to describe.

## Carl reads one fixed line everywhere

`VIDEO_ATTACHMENT_CONTEXT` — "A video Carl can't watch yet." — stands in wherever attachment content reaches the model: the private turn's text part, the room attachments block, and a kept video's stored context. The room row stores it at post time with status `ready`, so the image description job never runs for video and no `failed` status appears for a file that was never going to be described.
