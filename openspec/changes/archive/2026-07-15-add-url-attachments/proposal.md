## Why

Topic attachments accept only uploaded file bytes today, but much of the context a user wants to attach lives on the web. Letting a user attach a page by URL — read once at attach time, exactly like a file — captures that context without standing up a Source.

## What Changes

- Add a URL entry point to attachment ingestion: fetch the page through the existing Firecrawl seam (`worker/scrape.ts`), wrap the returned markdown as the existing `AttachmentUpload` shape with `contentType: "text/markdown"`, and pass it through the current `ingestAttachment()`. Extraction (`extractText` already has a `text/markdown` branch), context generation, storage, and failure/orphan cleanup are all reused unchanged.
- Add a nullable `sourceUrl` column to `attachments` for provenance display. URL attachments store the fetched URL; file uploads leave it null. Threaded through `AttachmentUpload` and the insert.
- Validate the URL at the trust boundary (well-formed `http(s)`) before fetching, and reject an empty fetch result so a blank page never produces a contextless attachment.
- Explicitly NOT a Source: this is a one-time context read at attach time. No Scan, Resource, or Finding is involved, and `generateContext()` / `topicScanContext()` are unchanged.

## Capabilities

### New Capabilities

<!-- none — this extends existing capabilities -->

### Modified Capabilities

- `topic-attachments`: adds the ability to ingest an attachment from a URL (Firecrawl fetch → markdown → existing pipeline), with URL validation and an empty-fetch rejection at the trust boundary.
- `domain-schema`: the `attachments` table gains a nullable `sourceUrl` column recording an attachment's origin URL (null for file uploads).

## Impact

- Code: `worker/attachments.ts` (new URL entry point; `sourceUrl` threaded through `AttachmentUpload` and the insert), `db/schema.ts` (+ generated migration). Reuses `fetchContent` from `worker/scrape.ts` and `FIRECRAWL_API_KEY` (already configured).
- Unchanged: `extractText` (markdown branch already exists), `generateContext`, `topicScanContext`, and the scan/curation pipeline.
- No new dependencies.
