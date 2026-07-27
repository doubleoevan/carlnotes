## Context

`worker/attach.ts` ingests an attachment synchronously in the request: validate → extract text → one capped (8000-char) context call → insert the row. A long PDF is truncated to its first ~8000 characters, and the upload blocks on model latency. `worker/review.ts` writes `resources.content` (full page markdown) and reads it back for scoring — and, via the in-flight `add-scheduled-scans-digest-reuse` change, for reuse and revalidation. `resources.content` is the fastest-growing content in Postgres and is never used in a query. `worker/store.ts` is the S3-compatible object-storage layer (R2/MinIO/AWS) used today only for attachment bytes. There is no Temporal in the codebase, though the README and CLAUDE.md describe `worker/` as the Temporal layer.

## Goals / Non-Goals

**Goals:**
- Introduce the Temporal runtime (server, worker, client) and run attachment processing as a durable, fan-out workflow with compensation.
- Split attachment ingestion into a fast synchronous half (`pending`) and an async workflow (`ready`/`failed`), covering the whole of a long document via chunking.
- Move `resources.content` to object storage behind `content_key`/`content_bytes`, keeping the fresh-fetch scoring pass round-trip-free.
- Migrate safely in two steps, dropping the old column only after a verified backfill.

**Non-Goals:**
- Dropping `resources.content` in this change (a follow-up migration does that).
- Re-embedding on full content — embedding stays on title + snippet, which do not move.
- Moving `resources.snippet` — it is small and every list path reads it.
- Reprocessing existing attachments — they already carry context and are backfilled to `ready`.
- Using Temporal for the scan/cron — that stays the lazy sweep from the prior change.

## Decisions

### 1. Introduce Temporal for attachment processing

Add `@temporalio/{client,worker,workflow,activity}`, a Temporal server as a `docker-compose` service, and a worker process that registers the workflow and activities and polls a task queue. The synchronous ingest starts the workflow through the Temporal client; the api returns the `pending` row immediately.

- *Workflow* `processAttachment(attachmentId)`: load the stored bytes → **extract** (activity) → **chunk** (bounded by `MAX_CHUNKS`) → **summarize each chunk** (parallel activities) → **merge** the chunk notes into one context capped at a max output length → **finalize** (activity: write the context, set `status=ready`, `char_count`, `chunk_count`). On any terminal failure the workflow's compensation **best-effort deletes the stored object** and sets `status=failed` with `error`.
- *Why Temporal here (not the cron):* this is a genuine multi-step, fan-out workflow whose partial progress and compensation are worth a durable engine — a crash mid-summarize resumes rather than stranding a half-processed upload. The scan schedule, by contrast, is a stateless recency check that stayed a plain sweep.

### 2. Attachment ingestion splits synchronous / durable

Synchronous half (`ingestAttachment`): validate size and type and topic, store the bytes, insert the row with `status=pending`, start the workflow, return the row. It no longer extracts or calls the model. `ingestUrlAttachment` still fetches the page and hands markdown bytes to the same synchronous half.

- The api returns a `pending` attachment; the ui reflects "processing" and refetches for the final status. This is a visible change from today's immediately-`ready` upload.

### 3. Status model and ready-only context

`attachments.status` is `pending` | `ready` | `failed`; `error` holds a failure reason; `char_count` and `chunk_count` record the extracted length and fan-out for observability. `buildTopicScanContext` reads **only `ready`** attachments, so a `pending` or `failed` one contributes no context and a scan never reads a half-built context.

### 4. Resource content in object storage

`resources.content` → `resources.content_key` (nullable text) + `resources.content_bytes` (nullable integer). `worker/store.ts` gains `resourceContentKey(resourceId)` = `resources/<resourceId>/content.md` (mirroring `toAttachmentKey`), `putResourceContent(resourceId, markdown)` → writes the object and returns `{ key, bytes }`, `getResourceContent(key)` → reads the markdown, `deleteResourceContent(key)`.

- *Fresh fetch (curation):* write the fetched markdown to object storage, store `content_key`/`content_bytes` on the row, and score the **in-memory** markdown in the same pass — nothing round-trips.
- *Reuse / revalidation:* the body is no longer on the row, so these read it via `getResourceContent(content_key)`. The freshness gate keys on `content_key != null` instead of `content`.
- *Snippet fallback:* if the object write fails, best-effort delete the object and score the `snippet`, leaving `content_key` null — mirroring the attachment orphan-cleanup posture.
- *Delete:* deleting a Resource best-effort deletes its object via `deleteResourceContent`.

### 5. Interaction with the in-flight reuse change

`add-scheduled-scans-digest-reuse` (same branch, not yet archived) added the three-way fetch in `worker/review.ts` that reads `resource.content` for reuse and revalidation. This change rewrites those two readers to `getResourceContent(content_key)` and re-keys the "has content" checks on `content_key`. The `fetched_at`/`etag`/`last_modified` freshness logic is unchanged.

### 6. Two-step migration, backfill by script

- **Migration A (this change, Drizzle):** add `resources.content_key`, `content_bytes` (nullable); add `attachments.status` (default `pending`), `error`, `char_count`, `chunk_count`; and set existing attachments to `ready` (they already carry context).
- **Backfill (this change, script under `doppler`):** for each resource that has `content` and no `content_key`, upload its content to object storage and write `content_key`/`content_bytes`. Idempotent — rows with a key are skipped — so it can be re-run.
- **Migration B (follow-up change, not here):** drop `resources.content` once the backfill is verified in production. Keeping the column this change lets a reader fall back to it during rollout and makes rollback a code revert, not a data restore.

## Risks / Trade-offs

- **Temporal is a large first-time infra addition** → mitigated by it being the right fit for this workflow; the cron stays lazy, so Temporal's scope is bounded to attachment processing.
- **Reuse/revalidation now GET from object storage** → a cheap R2 read replaces a Postgres column read; the fresh-fetch scoring pass still uses the in-memory string, so the hot path adds no round-trip.
- **Bulk backfill uploads every resource's content** → run once, idempotent and batchable; bounded by the existing resource count.
- **A `pending` attachment whose workflow never finalizes** → Temporal retries and resumes; a terminal failure lands `status=failed`, which the ready-only context already excludes.
- **Dead `resources.content` until the follow-up** → temporary storage waste, the price of a reversible two-step.

## Open Questions

- Chunking granularity (char vs token windows), `MAX_CHUNKS`, and the merged-context cap — tuning knobs, defaulted and env-overridable.
- Prod Temporal target (self-hosted vs Temporal Cloud) — `docker-compose` covers dev; production is an ops decision, out of scope here.
