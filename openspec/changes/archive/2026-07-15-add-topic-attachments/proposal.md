## Why

The product's differentiator is scoring media against *your* context — "your novel synopsis, your resume" ([Roadmap & Tech Stack](https://app.notion.com/p/39262400378d81bcb64febe02343b3db), positioning). Today a Topic's only context is its typed `context` field; there is no way to hand Carl a file. The roadmap makes attachments a first-class Topic field — "attachments (file in R2 + distilled context, processed once at upload)" — and provisions the storage for it: Cloudflare R2 via the S3 SDK with a configurable endpoint, already staged in `.env.example` (`S3_*`) but unused. This change stands up that pipeline: upload the raw file to R2, generate its context **once at upload**, and let scans read the stored context — so a nightly scan pays for a resume once, not every night.

## What Changes

- Add an **`attachments`** table (`db/schema.ts` + generated migration): a topic-scoped row holding the R2 object key, original filename/content-type/size, and the **`context`** (the text extracted from the file). Topic-owned, `on delete cascade`. Also rename the existing `topics.context_doc` column to `topics.context`, so a Topic's own context and its attachments' context share one field name.
- Add a **storage seam** (`worker/storage.ts`) built on Bun's **native** `S3Client` — the "S3 SDK with a configurable endpoint" the roadmap names, zero new dependencies. It reads the existing `S3_*` env, so the same code points at R2, MinIO, or S3 by config alone.
- Add the **`ingestAttachment` pipeline** (`worker/attachments.ts`): store bytes to R2 → extract text (plain text/markdown decoded directly; PDF via a lightweight parser) → extract a `context` string with the cheap-tier model through LiteLLM (the `worker/llm.ts` seam) → persist the row. It runs exactly once per attachment, at upload.
- **Scans read the context**: the search adapter's topic-context read folds in the topic's attachments' `context`, so query generation (and later curation) scores against files as well as the typed topic `context`.
- Add **`unpdf`** for PDF text extraction; `S3_*` env is already present; the `cheap-model` LiteLLM entry already exists.

## Capabilities

### New Capabilities
- `topic-attachments`: uploading a Topic file to R2, generating its `context` once at upload, persisting that `context` on an `attachments` row, and making it part of the context scans read. Owns file validation, the R2 storage seam, the context-generation pipeline, and per-attachment failure isolation.

### Modified Capabilities
- `domain-schema`: adds the `attachments` entity — a topic-scoped context table (object key + `context`), cascading on Topic delete; and renames the existing `topics.context_doc` column to `topics.context`.
- `source-ingestion`: the search adapter now generates queries from the topic's **effective context** (its own `context` plus any attachments' `context`), not the topic `context` alone. The empty-context name fallback and everything else about the adapter are unchanged.

## Impact

- **Schema:** new `attachments` table + a rename of `topics.context_doc` → `topics.context`, in one generated migration (`0002_puzzling_sumo.sql` — a `RENAME COLUMN`, so topics data is preserved).
- **Dependencies:** adds `unpdf` (PDF → text; serverless/Bun-friendly, wraps pdf.js). Object storage uses Bun's built-in `S3Client` — **no** `@aws-sdk/*`. `ai`/`@ai-sdk/openai`/`zod` already present for the context-generation call.
- **Code:** new `worker/storage.ts`, `worker/attachments.ts` (+ `.test.ts`); a small edit to `worker/adapters/search.ts` (read effective context via the new helper). No change to `adapter.ts`, `scan.ts`, or the other adapters.
- **Env / config:** `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` already in `.env.example`; `cheap-model` already in `litellm-config.yaml`. `integration_id` is not involved — R2 is a deployment-level bucket, not a per-user grant.
- **Deferred:** the HTTP multipart upload endpoint + auth (no HTTP server exists yet; it lands with the API/UI on Day 3, when the api→worker invocation seam — a Temporal workflow — is wired; api cannot import worker today, enforced by `tsc -b`). Also deferred: async processing + an attachment status column (inline-at-upload for MVP); non-PDF binary formats such as docx/pptx (rejected at validation with a clear error); attachment deletion / R2 orphan cleanup / presigned download URLs (add when the UI needs them); content-hash dedupe of re-uploaded files; per-attachment LLM-token cost accounting (LiteLLM meters proxy spend).
