# Proposal

## Why

A Topic Post's body holds text only. Its one picture is the cover, and its code blocks read as plain monospace text
with no language. Authors writing a how-to or a technical post cannot show a screenshot beside the step it explains, and
readers get code without color. The editor already supports images on both platforms. It has no highlighting and no
language on a code block, and the server strips every `img` on save.

## What Changes

- An author adds a picture at the cursor from an Image button in the Topic Post editor's toolbar, or by pasting one.
  The file uploads first through a new Topic Post body image route. The editor inserts the stored image's url with its
  width and height, never the pasted `blob:` url. It shows the image loading until the upload finishes, or drops it
  with an error.
- The body image upload accepts JPEG, PNG, WebP, and GIF, judged by the file's bytes alone. It refuses SVG and
  everything else. It refuses an image that would decode past a fixed pixel count, re-encodes every upload without its
  metadata (a phone photo's GPS location included), and stores one copy sized for the column.
- The upload passes the image moderation the cover upload uses, but fails closed. A check that fails refuses the upload
  with a retry message instead of letting it through.
- The number of body images a post holds and each file's size are limited by plan, counted at upload and at save. The
  upload route is rate limited per user.
- An uploaded image that the post never saves is deleted after a short grace period. An image removed from the body is
  queued for deletion when the post saves without it, and deleting the post deletes them all.
- Body images show wherever the post is read: its page, the MCP view, and the mobile app. Each image is no wider than
  the column and keeps its shape. Its alt text is the author's or the post's title. The card, the summary, the home
  order, the discussion script, and Carl's retrieval read the text and skip the images.
- The sanitizer admits `img` on a Topic Post's body only, only for a url on our own site that names that post's own body
  images, and only with whole-number width and height in a fixed range. A Tasting Note keeps today's tag set.
- A body image is a report subject. An admin removes a reported body image, which takes it out of the body and deletes
  its files.
- An author chooses a code block's language from a toolbar menu while the cursor is in one. The list holds a short set
  of common languages plus Auto, the default, which guesses the language from the code, and Plain text. The language
  is stored as `data-language` on the code block. The
  sanitizer keeps it only on a Topic Post's body and only for a value on the list.
- The post page and the MCP view color each code block that has a language when the post is read, never while it is
  edited. The colors come from Nightshift tokens in light and dark mode, and coloring never changes a block's layout.
  The mobile app keeps plain code blocks, and a mobile edit keeps each block's language.
- An author drops an image file on the web editor's body, and it goes in at the drop point.
- Every body image sits on its own line, with the text around it above and below, in the editors and every reader.
- An author resizes a body image on the web by dragging the handle at its corner or with the arrow keys on it. The
  image keeps its shape and stays inside the column, and the save stores its new width and height.
- A published Topic Post stays editable by its author at any time, instead of for 15 minutes. The first discussion
  still records 15 minutes after the publish, and a later edit keeps that recording until an editor regenerates it.
- Out of scope: Carl generating an image for the body.

## Capabilities

### New Capabilities

<!-- none -->

### Modified Capabilities

- `topic-posts`: the body admits images and a code block's language. It adds the body image upload and its checks,
  per-plan limits, cleanup of unsaved and removed images, readers showing images and coloring code, and deletion with
  the post.
- `topic-posts`: a published post is editable by its author at any time, and a web author resizes a body image.
- `topic-post-discussions`: the first discussion records 15 minutes after the publish, with no edit time.
- `content-reporting`: a Topic Post's body image is a report subject, and an admin removes it.

## Impact

- **API:** a new body image upload route and file route beside `apps/api/topicPost/topicPostImagesRoute.ts`. The Topic
  Post save in `topicPostsRoute.ts` passes a post-aware sanitizer and diffs the body's images. The delete path and
  `topicPostObjectKeys.ts` include body images. The admin's `removeReportedSubject` in
  `apps/api/report/adminReports.ts` handles the new subject. `apps/api/noteHtml.ts` gains the Topic Post body's tag
  set.
- **Data:** a new table of a post's body images, and a migration. `pending_object_deletions` covers unsaved and removed
  images. A new report subject kind. New per-plan limits in `packages/contracts/plans.ts`.
- **Pipeline:** the body image's decode, re-encode, and sizes beside `packages/pipeline/topicImages/topicImageFiles.ts`.
- **Web and core:** the Topic Post editor's toolbar adds Image and a language menu. The reader colors code blocks
  through one new, lazily loaded highlighter, because streamdown 2 ships none. This adds a dependency.
- **Editor package:** `react-native-enriched-html` 1.1.1 drops unknown attributes on a code block, so the web editor
  needs a patch in `patches/`, and the mobile app keeps languages across an edit.
- **Mobile:** an Image button and pasting in the editor, images in the reader, and a `apps/mobile/parity.md` row for
  plain code blocks.
- **Docs:** the topic posts spec, the content reporting spec, the AGENTS.md files the change touches, and the
  domain-model skill for the new noun "body image".
