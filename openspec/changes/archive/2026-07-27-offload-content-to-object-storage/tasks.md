## 1. Temporal runtime

- [x] 1.1 Add `@temporalio/client`, `@temporalio/worker`, `@temporalio/workflow`, and `@temporalio/activity` dependencies.
- [x] 1.2 Add a Temporal server service to `docker-compose.yml` (dev), and `TEMPORAL_ADDRESS` + a task-queue name to `.env.example`. (Image/command flagged for live verification.)
- [x] 1.3 Add a worker entry (`worker/temporal.ts`) that connects to Temporal, registers the workflow and activities, and polls the task queue; wire it into a `dev:temporal` script and the README Development section. (Runtime run needs a live server.)
- [x] 1.4 Add a Temporal client helper the synchronous ingest uses to start a workflow (`worker/temporal-client.ts`, connection from `TEMPORAL_ADDRESS`, one place, started by workflow name).

## 2. Schema, migration, and backfill

- [x] 2.1 Add `attachmentStatuses = ["pending", "ready", "failed"]` to `shared/enums.ts` and a matching `pgEnum`.
- [x] 2.2 In `db/schema.ts`: add `status` (default `pending`), `error`, `charCount`, `chunkCount` to `attachments`; add nullable `contentKey` (`content_key`) and `contentBytes` (`content_bytes`) to `resources`; leave `content` in place.
- [x] 2.3 Run `bun run db:generate`; add the data step that sets existing `attachments` rows to `ready`. Additive, no drop of `resources.content`.
- [x] 2.4 Add an idempotent backfill script (`scripts/backfill-resource-content.ts`) that, for each Resource with `content` and no `content_key`, uploads its content to object storage and writes `content_key`/`content_bytes`; skips Resources that already have a key. (Runs live under `doppler`.)
- [x] 2.5 Update `db/schema.test.ts` for the new columns' presence, nullability, and defaults, and that `resources.content` is not dropped.

## 3. Object-storage functions for resource content

- [x] 3.1 In `worker/store.ts`, add `resourceContentKey(resourceId)` producing `resources/<resourceId>/content.md`, mirroring `toAttachmentKey`.
- [x] 3.2 Add `putResourceContent(resourceId, markdown)` (writes the object, returns `{ key, bytes }`), `getResourceContent(key)`, and `deleteResourceContent(key)` (plus `getAttachmentBytes` for the workflow).
- [x] 3.3 Offline test for `resourceContentKey` (stable, namespaced key).

## 4. Curation content offload

- [x] 4.1 In `worker/review.ts` `fetchViaFirecrawl`: write the fetched markdown via `putResourceContent`, store `content_key`/`content_bytes` on the row, and score the in-memory markdown. On a storage-write failure, best-effort delete the object, leave `content_key` null, and fall back to the snippet.
- [x] 4.2 Rewrite the reuse and revalidation readers to read the body via `getResourceContent(content_key)`, and re-key the "has stored content" checks on `content_key` instead of `content`.
- [ ] 4.3 Best-effort `deleteResourceContent(content_key)` on the Resource-delete path. (No Resource-delete path exists today — Resources are global and never deleted — so `deleteResourceContent` is ready but has no call site yet.)
- [x] 4.4 Offline test for the storage-write fallback decision (pure `toFetchedContentFields`: write fails → snippet, `content_key` null).

## 5. Attachment ingestion split

- [x] 5.1 Rework `worker/attach.ts` `ingestAttachment`: validate size, content type (`isSupportedType`), and Topic synchronously, store the bytes, insert the row with `status = pending`, start the processing workflow via the client, and return the `pending` row — no synchronous extract or model call.
- [x] 5.2 Keep `ingestUrlAttachment` fetching the page, then hand its markdown bytes to the synchronous half unchanged.
- [x] 5.3 In `buildTopicScanContext`, filter attachments to `status = ready`.

## 6. Attachment processing workflow

- [x] 6.1 Add `worker/workflows/process-attachment.ts`: extract text (activity) → chunk into at most `MAX_CHUNKS` chunks → summarize each chunk in a parallel activity → merge into one capped context → finalize (activity: write `context`, set `status = ready`, `char_count`, `chunk_count`).
- [x] 6.2 Add the activities (`worker/workflows/process-attachment-activities.ts`: extract, summarize-chunk reusing `generateContext`, finalize, fail) and the pure `chunk` helper (`worker/chunk.ts`).
- [x] 6.3 On a terminal failure, the workflow compensation (`failAttachment`) sets `status = failed` with `error` and best-effort deletes the stored object.
- [x] 6.4 Offline tests for `chunk` (splitting and the `MAX_CHUNKS` bound). (Status transitions are workflow/activity behavior, covered by the live smoke.)

## 7. API, config, and docs

- [x] 7.1 The attachment upload routes return the attachment (now `pending` automatically); `status` is added to the topic payload (contract + `topics.ts`/`feeds.ts`), and `TopicInfoCard` shows a muted "· processing" / "· failed" marker. (Auto-refetch to flip `pending → ready` without a page refresh is a small follow-up.)
- [x] 7.2 Add `MAX_CHUNKS`, `CHUNK_CHARS`, and `MAX_ATTACHMENT_CONTEXT_CHARS` (env-overridable) to `.env.example`; `S3_*` reused unchanged.
- [x] 7.3 Update the README Development section for the Temporal worker and the backfill script.

## 8. Verification

- [x] 8.1 Run the gate — `bunx biome check .`, `bunx tsc -b`, `bun test`. (Green: tsc 0, biome 0, 76 pass. Bun/Temporal native-core load confirmed by spike.)
- [x] 8.2 Extend the smoke tests for the live paths: `worker/store.smoke.ts` (R2 resource-content round-trip) and `worker/attach.smoke.ts` reworked to start the workflow and poll to `ready` (end to end against a live Temporal server), run by hand under `doppler`.
