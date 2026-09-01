## 1. The cache table

- [x] 1.1 Add `link_previews` to `db/schema.ts`: a unique normalized `url`, nullable encrypted `title` and `description`, a nullable `image_object_key` and `image_content_type`, a `status` reusing the existing `attachment_status` enum, a nullable `fetched_by_team_id` referencing teams, and a `fetched_at` time
- [x] 1.2 Index the table on the team and fetched time pair, which is what the per-team hourly limit counts
- [x] 1.3 Generate the migration with `bun run db:generate`, additive only, creating one table and touching no existing row

## 2. Fetching and parsing the page

- [x] 2.1 Add `worker/preview.ts` with `toPreviewUrl`, which finds the first http(s) url in a message and leaves the surrounding sentence punctuation out of it, keeping a bracket the url itself opened
- [x] 2.2 Add `toNormalizedPreviewUrl`, which drops the fragment and rejects a malformed, non-http(s), or internal url through the existing `toFetchableUrl`
- [x] 2.3 Read the page with `fetchPublicUrl`, so every redirect hop is re-checked, under a request timeout and refusing a response that is not html. Never `fetchContent(url, "read")`, which bills a Firecrawl scrape
- [x] 2.4 Parse the meta tags with Bun's `HTMLRewriter`, preferring OpenGraph over the plain title and description, ignoring a tag with no content, and resolving a relative `og:image` against its page. No html-parsing dependency
- [x] 2.5 Bound the read: truncate the html at the byte limit so a large page still yields its head, and refuse an image past its own limit outright
- [x] 2.6 Fetch the image through the same guard and accept only image types a browser renders safely, leaving SVG out
- [x] 2.7 Add the preview object key to `worker/store.ts` and export the new surface from `worker/index.ts`

## 3. Storing, caching, and limiting

- [x] 3.1 Add `api/chat/roomPreviews.ts` holding the post-time path: find the url, reuse a stored preview, check the team's hourly limit, then fetch
- [x] 3.2 Encrypt the title and description with `encryptChatText` before storing, the treatment the message the url came from gets
- [x] 3.3 Store the page's image with `putAttachment` under a key the preview id names, and point the row at it only once the bytes are in place
- [x] 3.4 Record a failed row for a url that could not be previewed, with a shorter retry window than a fetched one, so a dead link is not refetched on every post
- [x] 3.5 Upsert on the url, so two teams fetching the same url at the same moment keep one row
- [x] 3.6 Load previews for a batch of messages in one query, keyed by the url found in each message's decrypted text, adding no column to `room_messages`

## 4. The routes

- [x] 4.1 Call the preview path from `postChatRoomMessage` after the room's own authorization has already passed, before the room is notified, so the card arrives with the message
- [x] 4.2 Add `toStoredFileHeaders` to `api/topic/attachments.ts`, serving an image type a browser renders safely inline and everything else as a download, refusing to serve SVG inline
- [x] 4.3 Serve the image from `GET /api/link-previews/:previewId/image` to signed-in readers only, through those headers
- [x] 4.4 Add `preview` to `ChatRoomMessage` in `shared/contracts.ts` as its own `ChatRoomLinkPreview` type

## 5. The card

- [x] 5.1 Render the card in `ChatRoomMessages.tsx` below the bubble and above the shared files, showing the host, title, description, and the proxied image
- [x] 5.2 Keep the raw url in the message text, so the card never replaces where the link goes
- [x] 5.3 Route the card's link through `AnchorLink`, which gives an external destination its target and rel
- [x] 5.4 Leave `ReplyImage` as it is, still downgrading a markdown image to a text link

## 6. The content security policy

- [x] 6.1 Set `Content-Security-Policy` in `api/index.ts` with `img-src 'self' blob: data:`, `object-src 'none'`, and `frame-ancestors 'none'`
- [x] 6.2 Leave `script-src` and `style-src` unset, since the application shell runs an inline theme script before first paint

## 7. Verification

- [x] 7.1 Cover the url finder, the meta parse, both fallbacks, and the whitespace clipping in `worker/preview.test.ts`
- [x] 7.2 Cover the SSRF rejections: an internal address, a redirect chain arriving at one with the internal hop never requested, a dead host, and a non-html response
- [x] 7.3 Cover the card render in `ChatRoomMessages.test.tsx`: the words and host show, the image comes from this origin, the url stays in the message text, and a preview with no image still renders
- [x] 7.4 Confirm the unfurler against real pages: one with OpenGraph tags and an image, one with only a title, and the cloud metadata address failing closed
- [x] 7.5 `bun run check` green
- [x] 7.6 Record the new module in `worker/AGENTS.md` and the root module map
