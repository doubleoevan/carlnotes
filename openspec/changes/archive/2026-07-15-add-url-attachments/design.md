## Context

Topic attachments today ingest uploaded file bytes: `ingestAttachment({ topicId, filename, contentType, bytes })` in `worker/attachments.ts` validates size, checks the topic exists, extracts text, stores the bytes, generates a context string once, and persists a row (with best-effort orphan cleanup on failure). `extractText` already decodes any `text/*` content type — including `text/markdown` — straight to a string.

Two seams the codebase already has make a URL path nearly free:
- `fetchContent(url)` in `worker/scrape.ts` scrapes a page to main-content markdown (used by curation). It throws on a missing key / non-ok response and returns `""` on empty markdown.
- `FIRECRAWL_API_KEY` is already configured.

There is no API or UI caller for attachments yet — `ingestAttachment` is worker-level. This change stays at that level: a URL entry point in the same module.

## Goals / Non-Goals

**Goals:**
- Ingest an attachment from a URL by reusing the entire existing file-ingestion pipeline (extraction, context, storage, cleanup) with no parallel path.
- Record provenance via a nullable `sourceUrl` column.
- Zero changes to `generateContext` and `topicScanContext`.

**Non-Goals:**
- Not a Source. No Scan, Resource, or Finding; no scheduling, dedupe, or spend-cap gating.
- No crawling, link-following, or recursion — one page, one fetch.
- No refresh/re-fetch: like a file upload, the context is read once at attach time and never revalidated.
- No new API/UI surface beyond the worker entry point (matching the current state of file ingestion).

## Decisions

**Wrap, don't fork.** The URL entry point fetches markdown, then builds an `AttachmentUpload` with `contentType: "text/markdown"` and calls `ingestAttachment` unchanged. Everything downstream (size guard, topic check, `extractText`'s markdown branch, context generation, storage, orphan cleanup) is shared. Alternative — a second ingestion function duplicating storage/cleanup — was rejected: it would drift from the file path and re-implement the failure handling that is the subtle part.

**Reuse the Firecrawl seam as-is; guard emptiness at the call site.** `fetchContent` already scrapes to main-content markdown with the right config. It returns `""` (not an error) on empty content because curation *wants* to fall back to a snippet there — so the seam must not change. The URL entry point instead rejects an empty result itself, before wrapping, so a blank/paywalled page produces an error rather than a contextless attachment. A failed fetch (`fetchContent` throws) propagates before any storage, so no orphan is possible.

**`sourceUrl` as an optional field on `AttachmentUpload`, nullable column.** One shape serves both origins: file uploads omit it (→ null), URL ingestion sets it. `ingestAttachment` threads `upload.sourceUrl ?? null` into the insert values. Nullable column means no backfill and no change to existing rows.

**Validate the URL natively at the trust boundary.** `new URL(value)` plus an `http`/`https` protocol check, before any fetch — rejects malformed input and non-web schemes (`file:`, `data:`) cheaply, with no dependency.

**Derive a filename from the URL** (host + path, `.md` suffix) so the object key and `filename` column are meaningful for a URL attachment; purely cosmetic, no behavioral weight.

## Risks / Trade-offs

- **Server-side fetch of a user-supplied URL (SSRF surface)** → Firecrawl fetches the page from its own infrastructure, not from our network, so internal-network SSRF is out of reach; the protocol check additionally blocks non-`http(s)` schemes.
- **Firecrawl latency/cost per attach** → one fetch, user-initiated, bounded by the seam's existing 30s timeout. It is deliberately *not* under the per-Scan spend cap because this is not a Scan; the cost is a single interactive fetch, acceptable and not accumulating across a pipeline.
- **Oversized page** → the reused `MAX_ATTACHMENT_BYTES` guard and the `MAX_EXTRACT_CHARS` prompt cap already bound storage and tokens; markdown of a single page is well within them in practice.

## Migration Plan

1. Add the nullable `sourceUrl` column to `attachments` in `db/schema.ts`; generate the Drizzle migration (`bun run db:generate`).
2. Nullable, so existing rows need no backfill and file uploads keep writing null.
3. Rollback: drop the column — file attachments are unaffected, only provenance for any URL attachments is lost.
