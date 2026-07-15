## Context

The domain schema ships Topics with a typed context column; the search adapter already reads it to generate Exa queries (`worker/adapters/search.ts`), and `worker/llm.ts` exposes the cheap-tier model through LiteLLM. The roadmap makes attachments a Topic field — "file in R2 + distilled context, processed once at upload" — and picked object storage deliberately: "Cloudflare R2, accessed through the S3 SDK with a configurable endpoint" over "AWS S3 / Postgres bytea / Northflank volumes," because the S3 API keeps the exit path a config change (self-hosters point the same env vars at MinIO or S3) and "blobs don't belong in Postgres." The `S3_*` env is already staged in `.env.example`; nothing reads it yet.

This change also renames the existing `topics.context_doc` column to `topics.context`, so a Topic's own context and the context generated from its attachments share one field name (`context`) and merge cleanly for a scan.

Constraints that shape this design:
- **Module boundaries** (`tsconfig` project references, gated by `bunx tsc -b`): `api` and `worker` each reference only `db`. **`api` cannot import `worker`.** The LLM seam and the only scan-time context reader both live in `worker`.
- **No HTTP layer exists yet.** `api/index.ts` is `export {}`; there is no Hono server, no auth, no multipart route. The UI ↔ api edge lands on Day 3.
- **Bun is the runtime.** Bun 1.3 ships a native `S3Client` (`bun-types/s3.d.ts`) with a configurable `endpoint` — an S3 SDK, already in the box.
- Tests are structural/offline (no live network), matching `search.test.ts` / `rss.test.ts`.

## Goals / Non-Goals

**Goals:**
- Persist a Topic file to R2 and the context generated from it to an `attachments` row, generating **once at upload**.
- Make that extracted context what scans read: the search adapter's query generation reads the topic's own `context` **plus** its attachments' `context`.
- Keep exit a config change: one S3-compatible client whose endpoint/bucket/credentials are env, pointing at R2, MinIO, or S3 unchanged.
- Preserve the offline-test discipline: the extraction dispatch and the context prompt are pure and tested; the R2 write and the LLM call are thin wrappers.

**Non-Goals:**
- **The HTTP upload endpoint and auth.** No server exists yet; the multipart receiver lands with the API/UI. Because `api` cannot import `worker`, that endpoint will invoke this pipeline through a Temporal workflow (the declared orchestration) — a seam to wire when Temporal is stood up, not now. This change exposes `ingestAttachment(...)` as the single "at upload" entry point, exercised directly by tests (as the search change shipped `searchAdapter` before it was wired into a schedule).
- **Async processing and an attachment status column.** One file is one `generateText` call; inline-at-upload is simplest. A `processing/ready/failed` status is added only when async (Temporal) processing arrives.
- **Binary formats beyond PDF** (docx, pptx, images). Text + PDF cover "novel synopsis, resume"; other types are rejected at validation, not silently dropped.
- **Attachment deletion, R2 orphan cleanup, presigned download URLs.** Added when the UI can list/remove attachments.
- **Content-hash dedupe of re-uploads** and **per-attachment LLM-token cost accounting** (LiteLLM meters proxy spend; attachments are not part of a Scan's cost).

## Decisions

**Object storage: Bun's native `S3Client` — over `@aws-sdk/client-s3`.**
`new Bun.S3Client({ accessKeyId, secretAccessKey, bucket, endpoint, region })` then `bucket.write(key, bytes, { type })`. The five constructor options map 1:1 onto the `S3_*` env already in `.env.example`, and `endpoint` is exactly the "configurable endpoint" the roadmap names — the same code hits R2, MinIO, or S3 by config. The AWS SDK is ~15 transitive packages and a client-command API for what Bun does natively in one call; adding it would also cut against the repo's "Bun is the runtime, never node/npm plumbing" posture. A thin `worker/storage.ts` builds the client from env (throwing when a value is unset, mirroring `llm.ts` — a misconfigured upload fails loudly, never writes to a default endpoint) and exposes `putAttachment(key, bytes, contentType)`. `ponytail:` native client, revisit only if we need multipart-upload of very large files or bucket events the native client lacks.

**The pipeline lives in `worker/`; the HTTP trigger is deferred.**
`ingestAttachment` needs the LLM seam (`worker/llm.ts`) and writes to `db` — both reachable from `worker`. It is also where the file is *consumed* (the search adapter reads the generated context). Putting producer and consumer in one module keeps the context-generation logic cohesive. `api` cannot import `worker` (project references), so the future HTTP endpoint will start a Temporal workflow that runs this pipeline — decided when Temporal is wired, avoiding both a premature `shared/` package and premature Temporal plumbing now. This is the same shape the search change used: ship the processing function, defer the live wiring.

**Extract text, then generate context; text + PDF via `unpdf` — over one vision call.**
The first step dispatches on content type: `text/*` and markdown are `new TextDecoder().decode(bytes)`; PDF goes through `unpdf` (`extractText`), a serverless/Bun-friendly wrapper over pdf.js with no native bindings. Then one `generateText({ model: cheapModel(), prompt })` reduces that text to a context string. The alternative — pass the file straight to the vision-capable cheap model and let it extract-and-reduce in one call — bets on MiniMax-M3-via-Fireworks accepting multi-page PDF file parts (vision usually means images), sends the whole document through the model (costlier for long files), and is less deterministic. Deterministic text extraction is cheaper, model-independent, and correct on the edge cases that matter (a 20-page PDF). The `unpdf` dependency is the price; no installed package parses PDFs, and PDF is core to the stated use case (a resume), so it is not speculative.

**Context generation: one cheap-tier `generateText`, plain-text output, capped input.**
The context call reuses the exact seam the search adapter established — `cheapModel()` through LiteLLM — so this adds no new LLM plumbing. Output is plain text (a condensed, topic-agnostic summary of the document), not structured: the output is just context, so a Zod schema buys nothing. Input is capped at `MAX_EXTRACT_CHARS` before prompting, the same guard the search adapter uses on the topic context, so a huge PDF can't blow the token budget. `buildContextPrompt(text)` is pure and tested.

**Attachment is a new topic-scoped table — not a Source, not a Resource.**
An attachment produces no Resources and is never scanned by an adapter, so it is not a Source. It is not a globally-deduped external artifact, so it is not a Resource. It is context material owned by one Topic — the file analog of the Topic's own `context` — so it is its own `attachments` table (topic_id, object_key, filename, content_type, byte_size, context, timestamps), cascading on Topic delete. `context` is `not null default ''`. No content hash, no embedding, no cost column (YAGNI). The object key is `topics/<topicId>/attachments/<attachmentId>/<filename>`, unique via the generated id.

**Scans read attachment context through one small helper.**
`topicScanContext(topicId)` returns `{ name, context }`, where `context` is the topic's own `context` joined with its attachments' `context`. The search adapter calls it instead of reading the topic row inline, and falls back to `name` when the merged `context` is empty — its current empty-context behavior, now keyed on the merged context. The merge has an immediate second consumer (Day-2 curation scores against the same effective context), so a single home for "what a scan reads as a topic's context" is justified, not speculative. It is the minimal change that makes "scans read the stored context" true today.

**Ordering and failure semantics: validate cheap, store, then persist with cleanup.**
`ingestAttachment` runs the cheap trust-boundary checks first — size cap, then that the Topic exists — so a bad upload spends no storage or inference. It then extracts the file's text (which also rejects an unsupported content type, still before any upload), generates the id, uploads bytes to R2, and finally generates the context and inserts the row. A failure before the insert writes no row — a scan never sees a half-processed attachment — and because the object exists once the upload returns, the context-and-insert step is wrapped so any failure best-effort-deletes the stored object, leaving neither a row nor an orphan. Object lifecycle GC on Topic/attachment deletion (a sweep, when a delete path lands) is still deferred.

## Risks / Trade-offs

- **Hostile document content (user file is data, not instructions)** → context generation is a Tier-1 "no hands" call: text in, text out, no tool loop. The worst a malicious PDF does is steer its own generated context, whose blast radius is "a badly-worded piece of topic context" that at most distorts query generation — the same model as a hostile topic `context`. The `MAX_EXTRACT_CHARS` cap bounds it.
- **Mid-pipeline failure orphans an R2 object** → the context-and-insert step is wrapped so a failure after the upload best-effort-deletes the stored object; the row is only written on full success, so no scan is corrupted. Cleanup on Topic/attachment *deletion* (a sweep keyed on `attachments.object_key`) is still deferred until a delete path exists.
- **`unpdf` on a scanned/image-only PDF yields little or no text** → generating context from empty text produces an empty-ish context; the attachment still stores (non-fatal), and OCR/vision extraction is a later upgrade if evals show image PDFs matter. → Mitigation: none for MVP; documented ceiling.
- **Large file blocks the upload path** → inline processing means a big PDF holds the call open. Bounded by `MAX_ATTACHMENT_BYTES` (validated first) and `MAX_EXTRACT_CHARS` (context-step input). Async (Temporal) processing is the upgrade when file sizes or volume demand it.
- **Context is extracted once and not re-run when the model improves** → by design (extracted once at upload). A future model change is a backfill (re-extract from the stored R2 object), not a schema change — the raw file is retained precisely so re-extraction is possible.
- **Bun native `S3Client` lock-in** → it speaks plain S3; swapping to the AWS SDK later is a `storage.ts`-local change behind `putAttachment`, and the env contract is unchanged.

## Migration Plan

1. `bun add unpdf`. Object storage needs no dependency (Bun native `S3Client`).
2. Rename `topics.context_doc` → `topics.context` and add the `attachments` table in `db/schema.ts`; `bun run db:generate` writes the migration (`0002_puzzling_sumo.sql` — an `ALTER TABLE ... RENAME COLUMN` for topics plus the attachments `CREATE TABLE`; the rename is resolved as a rename, not drop+add, so data is preserved); `doppler run -- bun run db:migrate` applies it (owner-run, needs `DATABASE_URL`).
3. Write `worker/storage.ts` (S3 client from env + `putAttachment`/`deleteAttachment`), `worker/attachments.ts` (`ingestAttachment` + pure `extractText` / `buildContextPrompt` / `topicScanContext`), and `worker/attachments.test.ts`.
4. Edit `worker/adapters/search.ts` to read `topicScanContext(source.topicId)` instead of the inline topic read.
5. Verification gate: `bunx biome check . && bunx tsc -b && bun test` — the extraction dispatch, the unsupported-type rejection, the size-limit rejection, and the context prompt run offline.
6. Live smoke (manual, owner-run under `doppler run` with R2 + proxy configured): ingest a real PDF, confirm an object lands in the bucket and the `attachments` row holds a non-empty `context`, then scan the Topic and confirm that context appears in the query-gen input. Covers the R2 write, `unpdf`, and the LLM call the offline gate can't.

Rollback: revert the files, drop `unpdf`, and (if migrated) drop the `attachments` table and rename `topics.context` back to `context_doc`. No other code reads the new table; the topics rename is reversible.

## Open Questions

- **`MAX_ATTACHMENT_BYTES` and `MAX_EXTRACT_CHARS` defaults.** Start at ~10 MB and the search adapter's existing context cap; tune once real documents and cost-per-upload are observed.
- **Context shape.** MVP produces a plain prose summary as the context. If curation later wants structured facets (entities, exclusions), revisit the prompt — but that is a curation-era decision, not this change's.
- **Image/scanned PDFs.** Deferred to an OCR/vision extraction path if evals show image-only PDFs are common enough to matter.
