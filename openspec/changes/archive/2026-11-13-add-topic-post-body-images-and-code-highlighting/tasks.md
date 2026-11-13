# Tasks

## 1. Contracts and plans

- [x] 1.1 Add `CODE_BLOCK_LANGUAGES` (the short list plus Plain text) and the reading column's width to
  `packages/contracts/topicPosts.ts`, and the body image url helpers to `packages/contracts/topicPostBodyImages.ts`.
  Verify with unit tests for the url helpers.
- [x] 1.2 Add `topicPostBodyImageLimit` and `topicPostBodyImageBytes` to every plan in `packages/contracts/plans.ts`,
  with the admin unlimited. Verify that the plan tests cover each plan's values.
- [x] 1.3 Add `topicPostBodyImage` to `reportSubjectKinds`, run `bun run db:generate` for the enum migration, and verify
  that the migration adds the value alone.

## 2. Sanitizer

- [x] 2.1 Add `sanitizeTopicPostHtml(html, topicPostId)` beside `sanitizeNoteHtml` in `apps/api/noteHtml.ts`, admitting
  the post's own `img` (parsed origin and exact path, whole-number size from 1 to 4096, alt up to 200 characters,
  signature dropped) and `codeblock[data-language]` on the list. Verify with tests for an img on another origin, on
  another post's path, on a url that only starts with the post's path (`..`, `%2F`, userinfo, another host), with
  `srcset`, `style`, or `onerror`, with a missing or out-of-range size, with a signed src, and a `data-language` off
  the list.
- [x] 2.2 Verify that `sanitizeNoteHtml` still drops every `img` and every `data-language`, with a test that saves a
  Tasting Note holding a Topic Post body image's url.

## 3. Upload, storage, and serving

- [x] 3.1 Add the body image decode in `packages/pipeline/topicPosts/topicPostBodyImageFiles.ts`: GIF magic bytes, a
  pixel-count check over every frame from `metadata()` before decoding, a re-encode to WebP that stays animated, and the
  column copy. Verify with tests for a decompression bomb PNG, a GIF whose frames pass the limit, an animated GIF
  staying animated, and a JPEG with GPS EXIF whose stored files hold no EXIF.
- [x] 3.2 Add the fail-closed image moderation helper beside `toObjectionableImageCategory` in `apps/api/moderation.ts`,
  screening a still's frame or an animation's first, middle, and last frames. Verify with tests that a failed or
  skipped check returns unavailable and that the existing helper still lets a failed check through.
- [x] 3.3 Add `POST /api/topic-posts/:id/body-images` in `apps/api/topicPost/topicPostImagesRoute.ts`: author only, the
  body limit and the plan's file size, the per-user limiter, the byte-based type check, the per-post count over saved
  and in-grace pending images, `recordPendingObjectDeletionBeforeUpload` before each file is stored, and moderation.
  Verify with route tests for an SVG, an HTML file declared as `image/png`, a decompression bomb, a failed moderation
  check, the per-post limit at upload, a file past the plan's size, and a non-author editor.
- [x] 3.4 Add the read signature (HMAC under the app's auth secret over a purpose, the path, and an hourly-rounded
  expiry) and `GET /api/topic-post-body-images/:topicPostId/:imageId/:file`, serving to whoever may read the post or to
  a valid signature, with `image/webp`, nosniff, and the edge cache for a public Topic's published post alone. Verify
  with tests for a public file's headers, a private file without a session, with an expired signature, and with an
  altered one.
- [x] 3.5 Add `toTopicPostHtmlForReader` to sign and make absolute each image src in read responses, and use it on the
  post read, the editor's load, the page's server data, and the MCP tool's read. Verify with tests that a non-public
  Topic's read holds signed urls and the MCP read holds absolute ones.
- [x] 3.6 Register the new routes and modules in `apps/api/AGENTS.md`, and the decode in `packages/pipeline/AGENTS.md`.

## 4. Save, cleanup, and deletion

- [x] 4.1 Switch the Topic Post save in `topicPostsRoute.ts` to `sanitizeTopicPostHtml`, reject a body with more images
  than the plan allows, clear the pending rows of every image the body names, and queue the images the old body named
  and the new one does not. Verify with tests for a save past the limit, a removed image queued for deletion, and a
  saved upload whose pending row is cleared.
- [x] 4.2 Verify with a test that an upload never saved is still pending past the grace period and is deleted by
  `retryPendingObjectDeletions`.
- [x] 4.3 Add the body images' keys to `loadTopicPostObjectKeys`, read from each post's html. Verify with a test that
  deleting a post with saved and unsaved images queues all their files.
- [x] 4.4 Verify with a test that `toHtmlText` of a body with an image matches the body without it, so the word count,
  summary, discussion script, card, and retrieval read the same text.

## 5. Reports

- [x] 5.1 Add Report image to a body image on the web reader and the mobile reader, writing a `topicPostBodyImage`
  report named `<topicPostId>/<imageId>`, and hide a reported image from its reporter. Verify with a route test that
  writes the report, and a reader test that hides the image.
- [x] 5.2 Handle `topicPostBodyImage` in `removeReportedSubject` in `apps/api/report/adminReports.ts`, and show the
  image with Remove in the Reports view. Verify with tests that Remove takes the image out of the body, queues its
  files, and resolves the report, and that a missing post resolves without error.

## 6. Web editor and reader

- [x] 6.1 Extend `patches/react-native-enriched-html@1.1.1.patch`: `alt` on the image node, a `language` attribute on
  the code block node from `data-language`, `setCodeBlockLanguage` on the ref, and the active block's language in the
  state event. Verify that `bun install` applies the patch and that a web editor test round-trips `data-language` and
  `alt`.
- [x] 6.2 Add the shared upload hook in `packages/core/hooks/` and the Image button, the paste handling, and the
  language menu to the Topic Post toolbar, with the upload shown in the toolbar until it lands or fails. Verify with
  component tests that a paste inserts the stored url and never a `blob:` url, and that a failed upload inserts nothing.
  Add stories for the toolbar's new states.
- [x] 6.3 Show body images in the web reader no wider than the column and at their shape, with the title as the alt text
  if none is set. Verify in the browser on the Topic Post page at phone and desktop widths.
- [x] 6.4 Add the syntax color roles to `packages/nightshift/colors.ts`, run `bun run nightshift:write`, add
  highlight.js with the listed languages, and add `useCodeBlockColors` to the Topic Post reader and its MCP view. Verify
  with tests that escaped code runs no script and that a post with only Plain text blocks never imports the highlighter,
  and in the browser that a server-rendered block keeps its size when the colors arrive, in light and dark mode.
- [x] 6.5 Verify in the topic post MCP view's stories and with `bun run smoke:mcp-views` that body images load from the
  site's origin and that the content security policy is unchanged.
- [x] 6.6 Record the editor and reader changes in `apps/web/AGENTS.md` and `packages/core/AGENTS.md`.

## 7. Mobile

- [x] 7.1 Add `toHtmlWithKeptAttributes` to `packages/core/lib/`, and call it before each mobile save. Verify with
  unit tests for a code block matched by its text, one matched by its order, and an image matched by its src.
- [x] 7.2 Add the Image button from the photo library and paste uploads to the mobile Topic Post editor through the
  shared upload hook. Verify on the simulator that an upload inserts the stored image.
- [x] 7.3 Show body images in the mobile Topic Post screen from absolute, signed urls, no wider than the screen at their
  shape. Settle the design's open question on the native image size rule there: the native view draws an image at its
  stored size, so the app's reader and editor scale each image to the body's measured width, and an app save puts the
  stored size back. Verify with unit tests for the scale and the stored size, and on the simulator with a team Topic's
  post that a 1920 pixel image fits the reader and the editor and that an app edit saves it at 1920 pixels.
- [x] 7.4 Add the plain code block row and the web-only alt text editing to `apps/mobile/parity.md` with their reasons,
  and verify with `bun scripts/check-component-parity.ts`.

## 8. Edit and resize

- [x] 8.1 Remove the 15 minute edit time from published Topic Posts: the route checks, the `locked` write failure, the
  disabled Edit on the web and mobile, and the copy and docs that name it, keeping the 15 minute wait before the first
  discussion as `TOPIC_POST_DISCUSSION_WAIT_MS`. Read `isAuthor` in the apps, and drop the workflow's second summary
  and the summary writer's version check. Verify with a route test that an edit a month after publishing saves, and
  with workflow tests that a publish runs the summary, the image, the wait, and the discussion alone.
- [x] 8.2 Add a resize handle to the web editor's image node view in the editor package's patch, with drag and arrow
  keys, a 48 pixel minimum, and the column's width as the maximum. Verify in the browser that a drag and an arrow key
  resize the image and that the saved body holds the new size.
- [x] 8.3 Add a drop handler beside the paste handler in the editor package's patch, which moves the caret to the drop
  point and uploads the dropped image files there. Verify in the browser that a file dropped before a paragraph's
  first word goes in there.
- [x] 8.4 Show each body image on its own line: split each image into its own paragraph in core's reader html and in
  the html the editor opens on, and make the web editor's image a block. Verify with unit tests for the split, and in
  the browser that the editor and the reader show the text above and below each image.
- [x] 8.5 Let a drag of a body image move it, with the image's wrapper as the editor's drag handle, and give the editor's
  scroll box room past the column so a full-width image's resize handle is not cut off. Verify in the browser that a
  dragged image is saved at its new place and that the handle of a full-width image is the element under the pointer.

- [x] 8.6 Replace the conflict notice with a save at the newer version: on a 409, `useTopicPostSave` sends the draft
  again once at the version the 409 names. Remove the notice from the editor and both apps. Verify with a story whose
  first save returns a conflict and whose second save goes out at the newer version with no alert.
- [x] 8.7 Add Align left, Align center, and Align right to both apps' Topic Post toolbars: the paragraphs' text-align on
  both, and a selected image's `data-align` on the web from the editor package's patch, floated at a side with the text
  beside it, or centered. Admit both in the sanitizer, keep an image's place across a phone edit, and verify with
  sanitizer and keep tests, toolbar stories, and in the browser that the editor and the reader wrap text beside a
  placed image and center a centered one.
- [x] 8.8 Color the web editor's code blocks as the author types: a decoration plugin and `setCodeBlockHighlighter` in
  the editor package's patch, and the class ranges beside the reader's highlighter, loaded for a body with a block in
  a language or a caret in a code block. Verify with a class range test and in the browser that typed code colors at
  once and the saved body holds no color markup.
- [x] 8.9 Give the editor's title input a line height that holds the display font's descenders. Verify in the browser
  that a title with a g shows whole.
- [x] 8.10 Color a code block with no language in a guessed one, and keep Plain text as its own stored value: Auto and
  Plain text in the web menu, the guess beside the highlighter for the editor and the reader, and Plain text in the
  sanitizer. Verify with guess tests for code and prose, a sanitizer test, a menu story, and in the browser that a post
  whose blocks name no language colors in the editor and the reader.
- [x] 8.11 Keep the web editor's toolbar at the top of the window while the post scrolls under it. The app's toolbar
  already stays above its scrolling body. Verify in the browser that the toolbar stays in view after scrolling a long
  post.

## 9. Docs and integration

- [x] 9.1 Add "body image" to the `domain-model` skill, and verify that no rejected term appears in the change.
- [x] 9.2 Run `bun run check` and verify that it passes.
