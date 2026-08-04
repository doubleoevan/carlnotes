## 1. Schema and contracts

- [x] 1.1 `shared/enums.ts`: `chatAttachmentKinds` value set, reused by both the db enum and the zod schema.
- [x] 1.2 `db/schema.ts`: `chat_attachments` table — id, userId (cascade), topicId (cascade), kind, name, objectKey, contentType, byteSize, rawText (encrypted text, nullable), context, status, error, timestamps, an index on (userId, topicId).
- [x] 1.3 Generate and review the migration.
- [x] 1.4 `shared/contracts.ts`: `chatAttachmentPayload` gains `keep: z.boolean().default(false)`; a `CHAT_ATTACHMENT_KEEP_LIMIT` constant.

## 2. Worker primitives

- [x] 2.1 `worker/store.ts`: `toChatAttachmentKey(userId, topicId, id, filename)`, namespaced separately from the topic-attachment key scheme.
- [x] 2.2 `worker/attach.ts`: `generateImageContext(dataUrl, litellmApiKey?)` — one vision-model call via `chatModel`.
- [x] 2.3 New registry prompt `worker/prompts/attach-image-context.md`, registered in `fetch.ts`'s `FALLBACK_PROMPT_TEMPLATES`.
- [x] 2.4 `worker/index.ts` barrel exports whatever the api layer needs: `putAttachment`, `toChatAttachmentKey`, `generateImageContext`.

## 3. Persistence orchestration

- [x] 3.1 `api/topic/chat.ts`: `keepChatAttachments(userId, topicId, attachments, litellmApiKey?)` — filters to `keep`, enforces the per-(user,topic) cap, branches by kind (text encrypts raw + summarizes; image/pdf blob-stores raw + summarizes), inserts one row per kept item, catches and logs its own failures.
- [x] 3.2 `api/index.ts`: the chat route calls `keepChatAttachments` fire-and-forget from the stream's completion handler, using the pre-resolution attachment list (so a kept PDF's original bytes are still available) and the caller's own litellm key.

## 4. Retrieval and prompt

- [x] 4.1 `worker/chat/retrieve.ts`: `readChatAttachmentContext(userId, topicId)`, merged into `ChatContext` as a new field; `retrieveChatContext` takes `userId` (chat is signed-in only, so always real).
- [x] 4.2 `worker/chat/index.ts`: `ChatTurnInput` gains `userId`; `buildChatPrompt` interpolates the new context block.
- [x] 4.3 `chat-topic.md`: a new section for reader-kept material, clearly distinct from the owner-only topic context; version bump and registry sync.

## 5. UI

- [x] 5.1 `useTopicChat.ts`: new attachments default `keep: false`; a `toggleKeepAttachment(index)` handler.
- [x] 5.2 `ChatComposer.tsx`: a Bookmark-icon toggle on each chip, mirroring the existing finding-bookmark fill-current convention; Carl-voiced tooltip ("Remember this" / already-kept state).

## 6. Accounting and verification

- [x] 6.1 `api/admin.ts`: `loadAttributedStorage` sums `chat_attachments.byteSize` alongside `attachments.byteSize`.
- [x] 6.2 Unit tests: the `keep` flag and its default on the payload; `CHAT_ATTACHMENT_KEEP_LIMIT` enforcement logic; prompt interpolation carries the new block.
- [x] 6.3 Full gate (`bunx biome check .`, `bunx tsc -b`, `bun test`) and a browser check that the keep toggle renders and flips.

## 7. Cap feedback

- [x] 7.1 The cap stops being silent: the conversation load reports the reader's kept count, and the keep toggle refuses to flip on at the limit with a toast — "Carl's memory for this topic is full." — counting draft keeps alongside stored ones. A send bumps the count optimistically, turning off is always allowed, and the server-side skip stays as the backstop. Eviction rejected by design: the new item is refused loudly, never an old one dropped quietly.

## 8. Managing kept attachments

- [x] 8.1 The conversation load returns the kept list itself (id, name, kind) instead of a bare count, and `DELETE /chat-attachments/:id` removes one kept item scoped to its keeper, deleting the stored object and freeing a cap slot.
- [x] 8.2 The composer grows a FileX2 "Clear files or photos" control to the right of the paperclip — add first, curate second — present only when something is kept. It opens a "Carl remembers" popover listing kept items with truncated names, a kind icon, and a per-item ✕ whose label reads "Forget", so deleting reads as forgetting rather than file cleanup.
- [x] 8.3 The hook tracks the kept list, appends optimistic placeholder rows on send (real ids arrive on the next conversation load), and the keep toggle caps against the live list length.
- [x] 8.4 Keep flips to default-on: attaching sets the bookmark filled, opting out is the tap, and at the cap a new attachment falls back to this-turn-only with a toast saying so. Found in first real use — the manuscript arrived with the bookmark untouched and nothing persisted, because opt-in memory reads as no memory at all. The wire default stays false, so only an explicit client keep persists.
- [x] 8.5 The bookmark toggle leaves the chips entirely — attaching is the request to remember, so a chip carries just its name and its ✕, and forgetting lives in the manager popover, now labeled a centered "Chat files". Keep stays a wire field for the cap fallback, which still says so with a toast.
- [x] 8.6 Prompt v9 explains attachment mechanics to the model: an earlier turn's "[attached: …]" note was a real reading not re-shown later, so it never disowns a summary it truly wrote — found live when a pressed model "confessed" to hallucinating a manuscript it had demonstrably read (its own reply counted the clip's exact character totals). Pinned by a briefing test and synced.
- [x] 8.7 Every attachment ✕ names its action: draft chips and the Chat files rows both carry a "Delete <name>" tooltip with a matching label.
- [x] 8.8 The Chat files drawer gets a corner minimize — a dash rather than an x, so it never reads as one of the per-file deletes below it — closing the popover through radix's own close, newly exported for callers styling their own control.
- [x] 8.9 Sending an attachment stops crashing outside a secure context: the optimistic kept row's placeholder id comes from a counter rather than crypto.randomUUID, which browsers withhold over a plain-http lan address — the phone testing url is exactly that, and the throw took the whole send with it.
