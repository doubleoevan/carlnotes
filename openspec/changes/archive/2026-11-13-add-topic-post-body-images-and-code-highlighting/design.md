# Design

## Context

See proposal.md for the why. What the code holds today, confirmed before designing:

- The body editor is `react-native-enriched-html` 1.1.1 on both platforms (TipTap on the web, native views on iOS and
  Android), with a local patch in `patches/react-native-enriched-html@1.1.1.patch`. It has `setImage(src, width,
  height)`, `onPasteImages` (a `blob:` uri on the web), and an `image` entry in its state event. Its web image node
  renders only `src`, `width`, and `height`. Its code block node (`EnrichedCodeBlock`, a Blockquote extension holding
  paragraphs) has no attributes, so loading html into the editor drops `data-language`, on the web and natively.
- `sanitizeNoteHtml` in `apps/api/noteHtml.ts` strips every `img` and allows `codeblock` with no attributes. Both the
  note save and the Topic Post save (`apps/api/topicPost/topicPostsRoute.ts`) call it.
- Stored images are not served from a public storage origin. Every image file streams through our own api, at a
  relative `/api/...` url, by `apps/api/topic/serveImageFile.ts`, gated by the Topic's visibility on the session cookie.
  The MCP view's content security policy (`toMcpViewContentSecurityPolicy`) already lists the site's origin in
  `resourceDomains`.
- The mobile app sends its session as a Cookie header it adds itself. The native editor loads an image with
  `dataWithContentsOfURL` on iOS, which sends no such header, and the MCP view is a cross-site iframe. Neither can load
  a cookie-gated image.
- The cover upload (`readUploadedImageOriginal` in `apps/api/topic/imageEdits.ts`) checks magic bytes for JPEG, PNG,
  and WebP, decodes with sharp under `MAX_IMAGE_INPUT_PIXELS` (40 megapixels), strips metadata, and lets an image
  through when `toObjectionableImageCategory` fails.
- `pending_object_deletions` with `recordPendingObjectDeletionBeforeUpload` (a one-hour grace) and
  `clearPendingObjectDeletion` already implement "delete an upload nothing named". The worker's
  `retryPendingObjectDeletions` sweep deletes the files.
- Every text reader of a post (word count, summary, discussion script, retrieval, card) goes through `toHtmlText`,
  which already yields no text for an `img`.
- streamdown 2, which the chat's markdown uses, ships no code highlighter. The MCP views build with
  `codeSplitting: false`.

## Goals / Non-Goals

**Goals:**

- One upload path for body images with checks at least as strict as the cover's, failing closed on moderation.
- A sanitizer that is the only trust boundary for what an `img` may name.
- No new table: an image's state lives in the post's html and in `pending_object_deletions`.
- One highlighter, loaded only where a colored code block is read.

**Non-Goals:**

- Generated body images, image captions, image resizing in the mobile editor, and text wrapping around images.
- Coloring code in the editor or in the mobile app.
- Body images in a Tasting Note.

## Decisions

### Urls, keys, and files

- An image is `/api/topic-post-body-images/<topicPostId>/<imageId>/<file>`, with a random uuid `imageId` and `<file>`
  being `column.webp`, the one file stored. The object key mirrors it under `topic-post-body-images/`. The stored body
  holds the path alone. Because the path names the file, a later size adds a file without changing a saved body.
- Alternative: also store the re-encoded original. Rejected because no reader loads it, and it was the costliest
  encode and the larger file.
- Every upload is re-encoded to WebP, animated if the source is, so one content type serves every file. sharp drops
  metadata unless asked to keep it, and the re-encode never asks.
- Alternative: keep each source's format. Rejected because four encoders and four content types buy nothing a reader
  sees.

### No body image table

- The saved images are the `img` paths in `topic_posts.html`. An unsaved upload is a `pending_object_deletions` row
  whose `next_try_at` is still in the future. The upload records each key with `recordPendingObjectDeletionBeforeUpload`
  before it stores the file. A save clears the pending rows of every image its sanitized body names, and records the
  images the old body named and the new one does not with `next_try_at` set to now.
- The per-post count at upload is the saved images plus the post's pending keys still in grace (a prefix match on the
  post's key prefix, counted per image id). The count at save is the sanitized body's `img` count.
- Alternative: a `topic_post_body_images` table. Rejected because it duplicates the html, and the reconciliation it
  would need between the two is a new failure mode. A report names an image as `<topicPostId>/<imageId>`.

### The sanitizer

- `sanitizeTopicPostHtml(html, topicPostId)` sits beside `sanitizeNoteHtml` in `apps/api/noteHtml.ts`, sharing its
  options and adding `img` and `codeblock[data-language]` through `transformTags`. `sanitizeNoteHtml` is unchanged, so
  a note keeps today's tag set.
- An `img` src is parsed with `new URL(src, siteUrl)`. It is kept only if the origin equals the site's origin and the
  parsed pathname matches `^/api/topic-post-body-images/<topicPostId>/<uuid>/column\.webp$` exactly. The parser resolves
  `..` segments, an encoded slash stays encoded and fails the uuid match, and the search and hash (a read signature) are
  dropped by writing back the pathname alone.
- `width` and `height` must be whole numbers from 1 to 4096. `alt` is kept as text, at most 200 characters. Every other
  attribute is dropped by the allowlist.
- `data-language` is kept if its value is on `CODE_BLOCK_LANGUAGES` in `packages/contracts/`, which the toolbar menu
  reads too.

### The upload route

- `POST /api/topic-posts/:id/body-images`, beside the cover routes in `topicPostImagesRoute.ts`, with its body image
  pieces in a new `apps/api/topicPost/topicPostBodyImages.ts`. Only the author uploads, to a draft or a published post
  they may still edit. A body limit is set at the largest plan's file size plus the multipart envelope, and the plan's
  own size is checked after. A per-user limiter allows 10 uploads a minute.
- Checks in order: magic bytes for JPEG, PNG, WebP, or GIF (`GIF87a`/`GIF89a`), never the name or the declared type.
  Then sharp `metadata()`, which decodes no pixels: reject if `width × pageHeight × pages` passes 40 megapixels. Then
  decode under `limitInputPixels`, re-encode, and moderate.
- Moderation screens the first frame of a still, and the first, middle, and last frames of an animation. Any
  objectionable frame rejects the upload. A `failed` or `skipped` outcome rejects it with `moderation-unavailable`
  (503) and a retry message. This uses a new fail-closed helper beside `toObjectionableImageCategory`, which keeps its
  fail-open behavior for avatars and covers.
- The column copy's width is `min(own width, 2 × the reading column's widest width)`. The column's width is a constant
  in `packages/contracts/topicPosts.ts` that the web reader's column class uses too.
- The response returns the image's url (signed if the Topic is not public), width, and height for `setImage`.

### Serving and visibility

- `GET /api/topic-post-body-images/:topicPostId/:imageId/:file` loads the post. It serves to whoever may read the post
  (its author for a draft), which follows the Topic's visibility, or to a request whose `expires` and `signature` query
  parameters verify. Headers are `Content-Type: image/webp`, `X-Content-Type-Options: nosniff`, an immutable year at
  the edge for a public Topic's published post, and browser-only caching otherwise.
- Signing is `toAuthSecretSignature` in `packages/server/hmac.ts` over `topic-post-body-image|<path>|<expires>`. The
  purpose in the value keeps the signature from matching any other use of the auth secret, so no new secret is needed.
  `expires` is rounded up to the next hour plus a day, so a url stays stable for an hour of caching.
- `toTopicPostHtmlForReader(html, { topic, siteUrl, isAbsolute })` in `apps/api/topicPost/` rewrites each `img` src in a
  read response: signed for a non-public Topic, and absolute for the MCP tool's read and the mobile app's. It runs on
  the post read, the editor's load, the page's server data, and the MCP tool. The save path strips what it added.
- Alternative: unguessable urls with no gate. Rejected because a copied url would leak a private Topic's image.

### Deletion and reports

- Deleting a post: `loadTopicPostObjectKeys` adds the keys of every image path in each post's html. Unsaved uploads are
  already pending.
- `topicPostBodyImage` joins `reportSubjectKinds`. `removeReportedSubject` loads the post, drops that `img` through the
  sanitizer's walk, saves at a raised version, and queues the image's files. A missing post or image only resolves.

### Editor changes

- Web: the existing patch grows. The image node renders and parses `alt`. The code block node gains a `language`
  attribute parsed from and rendered to `data-language`. The ref gains `setCodeBlockLanguage(language | null)`, and the
  state event includes the active code block's language. The toolbar shows the language menu while `codeBlock.isActive`.
- Pasting and the Image button run one shared upload hook in `packages/core/hooks/`. It remembers the cursor, shows the
  upload in the toolbar with a thumbnail and a spinner, then calls `setImage` with the stored url, or shows the error.
  A pasted `blob:` url is never inserted. If the editor inserts it by default, the paste handler stops it, and the
  sanitizer drops it in any case.
- Mobile: the Image button uses the photo library picker, and a paste uploads the pasted file uri. The native editor
  cannot hold `data-language` or `alt`, so `toHtmlWithKeptAttributes(previousHtml, editedHtml)` in
  `packages/core/lib/` puts them back before each save. A code block is matched by its text, then by its order. An
  image is matched by its src. The mobile app reads plain code blocks, which is recorded in `apps/mobile/parity.md`.

### Highlighting

- highlight.js core with only the listed languages registered, in a web hook `useCodeBlockColors(containerRef, html)`.
  The hook dynamically imports the highlighter only if the rendered body holds a `codeblock[data-language]`. It joins
  each block's paragraphs with newlines, highlights the whole block so multi-line comments and strings color right,
  splits the result back into lines (closing and reopening the open spans at each newline), and sets each paragraph's
  html to its line. The text is unchanged, so nothing moves.
- highlight.js escapes the code it returns. The reader's colored DOM lives only in the reader.
- The web editor colors its code blocks with ProseMirror decorations from `CodeBlockHighlightPlugin` in the editor
  package's patch. The app registers `toCodeBlockClassRanges` through the package's `setCodeBlockHighlighter` once a
  body opens with a block in a language or the caret enters a code block, and the open editors redraw. A decoration is
  a view of the document and never part of it, so colored markup cannot reach a save. The editor's body takes the same
  color classes as the reader.
- The colors are syntax roles added to `packages/nightshift/colors.ts` for light and dark mode, written by
  `bun run nightshift:write`, and mapped from the `hljs-*` classes in one stylesheet beside `NOTE_BODY_CLASS`.
- The MCP view bundle inlines the import because it does no code splitting. The bundle grows by the core and about a
  dozen grammars.
- A block with no language is Auto: its language is guessed with highlight.js's `highlightAuto` over the listed
  languages, the more common in posts first, because a tie goes to the earlier one. A guess colors only at a relevance
  of 3 or more, which a line of SQL reaches and a sentence of prose does not. Each code's guess is kept, so typing in
  one block does not guess the others again. Plain text stores `data-language="plaintext"` and is never colored.
- Alternative: shiki. Rejected because its WASM engine and themes cost far more than a dozen grammars need.

### Plans

- `topicPostBodyImageLimit` and `topicPostBodyImageBytes` per plan in `packages/contracts/plans.ts`: free 5 images and
  5 MB, plus 20 and 10 MB, premium 40 and 10 MB. An admin is unlimited, as with the other quotas.

### Images on their own line

- The editor package's image node is inline, so a stored paragraph may read text, an image, then text. Readers split
  each image into a paragraph of its own in core's `toBlockImageHtml`, which `toTopicPostReaderHtml` calls, so the web,
  the MCP view, and the native reader all show it on its own line. The editors open on the same split body. The web
  editor's image wrapper is a block as wide as its image, so an image added while typing also takes its own line. A
  paragraph whose image sits inside bold or a link stays whole, because splitting it would break the tags.
- Images sit at the column's left edge. A centered image would grow from both sides, so the resize handle would move
  half as far as the pointer.

### Moving an image on the web

- TipTap starts a node's drag only from an element marked `data-drag-handle`. The image node view marks its wrapper,
  draggable while the editor is editable, so a drag of the image moves the node and the drop handler leaves the move to
  ProseMirror. The paragraph it left stays, empty, as after any move.

### Image resizing on the web

- The editor package's image node view gains a `<button>` handle at the image's corner. TipTap's node view lets a
  button keep its own pointer and key events, so a drag never moves the selection. The drag sets the width with the
  height from the image's shape, between 48 pixels and the width of the nearest block ancestor, because TipTap wraps the
  node view in an inline span. The node's `width` and `height` attributes take whole numbers, which the sanitizer
  already admits, so the save and the readers need no change.
- The native editor has no resize. It keeps an image's stored size, and the mobile app records the handle as web-only
  in `apps/mobile/parity.md`.

### No edit time on a published post

- The 15 minute edit time is gone. The route no longer rejects a late edit, `locked` leaves the write failure, and the
  apps read `isAuthor`. The read's `isEditable` equals `isAuthor` and stays in the response for the released mobile
  app, whose frozen contract reads it.
- The edit time was copied from a hot take's, `SOCIAL_EDIT_MS`, and nothing about a post needed it. The first
  discussion keeps its 15 minute wait, named `TOPIC_POST_DISCUSSION_WAIT_MS`, so a correction right after the publish
  still reaches the recording. A later edit leaves the recording until an editor regenerates it.
- The workflow's second summary at the end of the wait is gone, and the summary writer's version check with it, because
  every edit already starts its own summary rewrite. A workflow sleeping at the deploy has recorded no patch marker
  yet, so it replays into the new code.

### Alignment

- One set of buttons, Align left, Align center, and Align right, aligns the paragraphs at the caret or a selected
  image, so text and images align the same way. `lib/topicPostAlignment.ts` in core picks which one a press
  sets. A press on the active button sets it back.
- Text uses the editor package's own paragraph alignment on both platforms, stored as a block's
  `style="text-align: …"`. The sanitizer keeps only a left, center, or right text-align on a Topic Post's blocks, and a
  Tasting Note keeps no style.
- An image's alignment is an `align` attribute on the image node from the editor package's patch, stored as the img's
  `data-align`. At the left or the right it floats from the sm breakpoint up at up to half the column, so the text
  beside it wraps. Centered, it sits in the middle on its own line. The native editor has no image alignment, so the
  phone aligns text alone and a save puts each image's alignment back from the body before the edit.

### A newer version from another tab

- The editor used to stop its saves on a 409 and show a notice with a reload. A newer version comes from the author's
  own other tab or device, or from an admin's removal of a reported image. The editor now saves its words again once at
  the version the 409 names, with no notice, so the tab being typed in wins, and the save keeps an image an admin
  removed out of the body. A second 409 in a row shows the save error.

## Risks / Trade-offs

- [The reader's colored DOM is mutated after React renders the body] → The hook reruns on every html change and touches
  only the paragraphs inside a `codeblock[data-language]`.
- [The pending-key prefix count does a `LIKE` scan on `pending_object_deletions`] → The table holds only in-flight
  deletes, and the count runs per upload, never per read.
- [A removed image is queued at once, but an author undoes the removal and saves again] → Every save clears the pending
  rows of the images it names. A file the sweep already deleted shows as a broken image, and the author can upload it
  again.
- [The moderation has no key in an environment] → The upload rejects as unavailable. Local development runs under
  Doppler, which holds the key.
- [An older mobile app edits a post] → Its native editor keeps the `img` but drops `data-language` and `alt`. That is
  accepted for releases already shipped, and the contract freeze is unaffected because the save payload does not change.
- [Rolling back] → An older api's sanitizer strips the images on the next save of each post. Their files stay until the
  post is deleted.

## Migration Plan

- One migration adds `topicPostBodyImage` to the report subject kind enum. No data moves.
- Deploy the api and the web together, as the pipeline already does. The mobile app's editor ships through an EAS
  update or build after that.

## Open Questions

- The native reader's image size rule, settled on the simulator: `EnrichedText` and the native editor draw an image at
  its stored width and height with no limit. The app scales each image to the body's measured width before it shows the
  body, and an app save puts each image's stored size back, so the spec holds.
