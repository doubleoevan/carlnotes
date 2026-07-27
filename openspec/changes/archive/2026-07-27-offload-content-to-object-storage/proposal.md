## Why

`resources.content` holds full page markdown and is the fastest-growing content in the database, yet nothing queries it — curation writes it once and reads it back only for scoring. That belongs in object storage, not Postgres. Separately, attachment ingestion runs the whole extract-and-summarize pass synchronously in the request with a single 8000-character cap, so a long document is truncated to its first page and the upload blocks on model latency. Both halves extend `worker/store.ts`, so they land together — and the attachment half is the durable, fan-out workflow that finally justifies standing up Temporal.

## What Changes

- **Temporal lands** — introduce the `@temporalio/*` runtime the README/CLAUDE.md already describe: a Temporal server (a docker-compose service), a worker process that polls a task queue and registers workflows and activities, and a client the api uses to start workflows. This is the first Temporal in the codebase.
- **Attachment ingestion splits in two** — a synchronous half validates, stores the bytes, inserts a `pending` attachment row, and starts the workflow; a durable workflow extracts the text, chunks it (bounded by `MAX_CHUNKS`), summarizes each chunk in parallel activities, merges the chunk notes into one context with a capped output length, and marks the attachment `ready` — or `failed` with an error. Add `attachments.status` (`pending`/`ready`/`failed`), `attachments.error`, `char_count`, and `chunk_count`. The scan context reads `ready` attachments only. Orphan cleanup moves into the workflow's compensation path.
- **Resource content moves to object storage** — replace `resources.content` with `resources.content_key` (nullable text) and `resources.content_bytes` (nullable integer). `worker/store.ts` gains `putResourceContent`, `getResourceContent`, and `deleteResourceContent`, plus a `resourceContentKey` helper producing `resources/<resourceId>/content.md`, mirroring the attachment key. Curation writes the fetched markdown to object storage and scores the in-memory string in the same pass, so nothing round-trips; readers that need the body later (reuse and revalidation scoring) go through `getResourceContent`. `resources.snippet` stays in Postgres — it is small and every list path touches it. A storage failure after the write best-effort-deletes the object and falls back to the snippet; deleting a Resource best-effort-deletes its object.
- **Two-step migration** — this change adds the new columns and backfills existing rows by uploading their content to object storage and writing the key, then switches all reads and writes to the object-storage path. `resources.content` is left in place, no longer read or written, to be dropped by a follow-up migration once the backfill is verified in production.

## Capabilities

### New Capabilities
<!-- none: the durable-workflow behavior extends topic-attachments; the Temporal runtime itself is infrastructure, covered in design -->

### Modified Capabilities
- `topic-attachments`: ingestion splits into a synchronous store-and-`pending` half and a durable workflow that chunks a long document, summarizes chunks in parallel, and merges them; the scan context reads `ready` attachments only; orphan cleanup runs in the workflow's compensation path.
- `domain-schema`: `attachments` gains `status`, `error`, `char_count`, and `chunk_count`; `resources.content` is replaced by `content_key` and `content_bytes`; plus the additive migration and backfill.
- `curation`: the fetched markdown is written to object storage and scored in memory in one pass; reuse and revalidation read the body through `getResourceContent`; a storage failure falls back to the snippet, and deleting a Resource deletes its object.

## Impact

- **Dependencies**: `@temporalio/client`, `@temporalio/worker`, `@temporalio/workflow`, `@temporalio/activity`. A new Temporal service in `docker-compose.yml`, and a new worker entry (`dev:worker` gains the Temporal worker, or a dedicated process).
- **Code**: `worker/store.ts` (resource-content functions), `worker/attach.ts` (split sync/async; the `pending` insert), new `worker/workflows/` + activities, `worker/review.ts` (write content to object storage, score in memory, read via `getResourceContent` on reuse/revalidation, snippet fallback, delete-on-delete), `buildTopicScanContext` (ready-only filter), `db/schema.ts` + a migration.
- **Interaction with the in-flight reuse change**: the fetch-reuse and revalidation paths in `worker/review.ts` (added by `add-scheduled-scans-digest-reuse`) currently read `resource.content`; they switch to `getResourceContent(content_key)`, and the freshness gate keys on `content_key` presence instead of `content`.
- **Config**: a Temporal address and task-queue name (e.g. `TEMPORAL_ADDRESS`); the existing `S3_*` values are reused unchanged.
- **Not dropped here**: `resources.content` stays until a verified-backfill follow-up migration removes it.
