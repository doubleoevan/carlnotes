## 1. Dependency, env, and schema

- [x] 1.1 `bun add unpdf` (PDF → text); object storage needs no dependency — Bun's native `S3Client` is used
- [x] 1.2 Confirm no config edits are needed: `S3_ENDPOINT`/`S3_REGION`/`S3_BUCKET`/`S3_ACCESS_KEY_ID`/`S3_SECRET_ACCESS_KEY` already in `.env.example`, `cheap-model` already in `litellm-config.yaml`
- [x] 1.3 In `db/schema.ts`: rename `topics.context_doc` → `topics.context`, and add the `attachments` table: `topic_id` (fk → `topics.id`, `on delete cascade`), `object_key`, `filename`, `content_type`, `byte_size` (integer), `context` (text, `not null default ''`), plus `...timestamps()`; comment every group per code-style
- [x] 1.4 `bun run db:generate` to write the migration (`0002_puzzling_sumo.sql` — resolve the topics column change as a rename, not drop+add, so data is preserved); applying it with `doppler run -- bun run db:migrate` is owner-run (needs `DATABASE_URL`) and still pending

## 2. Storage seam

- [x] 2.1 Create `worker/storage.ts`: build a `Bun.S3Client` from the `S3_*` env, throwing if any value is unset (mirrors `llm.ts` — a misconfigured upload fails loudly, never writes to a default endpoint); export `putAttachment(key, bytes, contentType)` and `attachmentKey(topicId, attachmentId, filename)` (→ `topics/<topicId>/attachments/<attachmentId>/<filename>`)

## 3. Attachment pipeline

- [x] 3.1 Create `worker/attachments.ts` with top-of-file constants: `MAX_ATTACHMENT_BYTES` (~10 MB), `MAX_EXTRACT_CHARS`, and the supported content-type set (text/markdown + `application/pdf`)
- [x] 3.2 Add `extractText(contentType, bytes): Promise<string>`: decode `text/*` and markdown with `TextDecoder`; extract PDF text with `unpdf`; throw on an unsupported content type
- [x] 3.3 Add `buildContextPrompt(text): string` (pure): instruct the model to reduce the document to concise topic context, on text capped at `MAX_EXTRACT_CHARS`
- [x] 3.4 Add `generateContext(text): Promise<string>`: one `generateText` with `cheapModel()` and `buildContextPrompt`, returning the plain-text context
- [x] 3.5 Add `ingestAttachment({ topicId, filename, contentType, bytes }): Promise<Attachment>`: validate size, that the topic exists, and content type **first** (throw before any storage/LLM), generate the attachment id, `putAttachment`, `extractText`, `generateContext`, then insert the `attachments` row with the object key, metadata, and `context` — a failure before the insert writes no row, and a failure after the upload best-effort-deletes the stored object (no orphan); return the inserted row
- [x] 3.6 Add `topicScanContext(topicId): Promise<{ name: string; context: string }>`: select the topic plus its attachments' `context` and return the topic `name` and a `context` string = the topic's own `context` merged with the attachments' `context`
- [x] 3.7 Create `worker/attachments.test.ts` (offline): assert `extractText` decodes a text/markdown fixture, `extractText` throws on an unsupported type, `ingestAttachment` rejects an oversized file before any storage/LLM call, and `buildContextPrompt` includes the document text — leave the `unpdf` and `generateText`/R2 wrappers to the live smoke

## 4. Wire the scan-time consumer

- [x] 4.1 Edit `worker/adapters/search.ts` to read query-gen context via `topicScanContext(source.topicId)` (context + `name` fallback) instead of the inline topic read, so the effective context includes the attachments' `context`
- [x] 4.2 Update `worker/adapters/search.test.ts` only if a case asserts the old inline context read; the empty-context → name fallback assertion stays valid — no change needed (the test exercises only the pure `parseResults`/`buildQueryPrompt`)

## 5. Domain canon

- [x] 5.1 Add a one-line `Attachment` note under Topic in `.agents/skills/domain-model/SKILL.md` (topic-scoped context file: R2 object + distilled context, processed once at upload) so the canon stays in sync with the Notion domain-model table; the `.claude/skills/` copy auto-syncs to match

## 6. Verify

- [x] 6.1 Run the gate: `bunx biome check . && bunx tsc -b && bun test` — green (23 tests pass)
- [ ] 6.2 Live smoke — **manual gate (owner-run); not a commit blocker** since no upload endpoint is wired yet. Under `doppler run` with R2 and the proxy configured: call `ingestAttachment` with a real PDF, confirm an object lands in the bucket and the `attachments` row holds a non-empty `context`, then scan the Topic and confirm that context appears in the query-gen input. Validates the R2 write, `unpdf`, and the LLM path the offline gate can't exercise
