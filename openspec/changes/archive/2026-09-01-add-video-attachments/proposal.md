# Add video attachments to chat

## Why

A clip from a phone is refused at both chat composers today. The picker does not offer video, `toAttachment` toasts it away, and the contract has no payload for it — so the one artifact people most often want to hand a room or a question, a short screen recording or camera clip, cannot enter the conversation at all. Everything the feature needs already exists in pieces: attachments travel as data urls under a request body limit, image and PDF bytes already store by object key, and the room already serves stored files back to members.

## What Changes

A video file attached to a private chat question or a team room message uploads, stores, and plays inline in the bubble, on both surfaces.

- A `video` kind joins `chatAttachmentKinds` with a payload variant mirroring the image one: a `data:video/` data url under its own limit of 25,000,000 characters — about 18 MB of file under base64, inside the 26 MB request body limit. Bigger files would need a multipart upload path like avatars use, deliberately out of scope.
- Both composers accept `video/mp4`, `video/quicktime`, and `video/webm` through one chat accept list, and the shared `toAttachment` classifies them. A too-large clip rejects client-side with a toast before any of it uploads. The topic prompt's picker is unchanged.
- Video bytes take the same store-by-object-key path images take: no extractor and no text screening, because there is no text. The room post routes gain the same 26 MB body limit the private turn already had, which they were missing.
- The room serves a video inline instead of as a download, through a video allowlist in `toStoredFileHeaders` exactly as strict as the image one — svg stays excluded — and honors byte ranges, which Safari's player requires. Every other stored kind still downloads.
- A shared `SentVideo` player — `<video controls preload="metadata">` — renders in the room bubble above the existing name-row and delete control, and in the private question bubble from the sent data url. A private turn stores only text, so after a reload the question keeps its attachment note alone, the same as every other private attachment kind.
- Carl can't watch video. The model, the room attachments block, and a kept video's stored context all read a fixed "A video Carl can't watch yet" line instead of a failed description job. No transcoding anywhere: the player renders where the codec is supported — an iPhone HEVC `.mov` plays in Safari but not Chrome — and the named download row is the fallback everywhere else.

## Capabilities

### Modified Capabilities

- `topic-chat`: the attachment-bearing requirement gains the video kind, its own size limit, the fixed stand-in line the model reads, and in-place playback on the sent bubble; the kept-attachment requirement stores video bytes with a fixed context instead of a generated summary.
- `team-chat`: the shared-files requirement gains the video kind, inline ranged serving so the bubble's player can stream it, and the fixed context line Carl reads in place of an image-style description.
