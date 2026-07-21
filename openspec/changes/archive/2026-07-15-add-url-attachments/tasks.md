## 1. Schema

- [x] 1.1 Add a nullable `sourceUrl` (`source_url`) text column to the `attachments` table in `db/schema.ts`, with a comment noting it is null for file uploads and holds the origin URL for URL-ingested attachments.
- [x] 1.2 Generate the Drizzle migration with `bun run db:generate` and confirm it only adds the nullable column.

## 2. Ingestion

- [x] 2.1 Add an optional `sourceUrl?: string` field to the `AttachmentUpload` type in `worker/attachments.ts`.
- [x] 2.2 Thread `sourceUrl` through `ingestAttachment` into the insert values as `upload.sourceUrl ?? null` (file uploads keep passing null).
- [x] 2.3 Add a URL entry point (e.g. `ingestUrlAttachment(topicId, url)`) that validates the URL is well-formed `http`/`https` via `new URL()` before any fetch, calls `fetchContent(url)` from `worker/scrape.ts`, rejects an empty result, derives a filename from the URL, and calls `ingestAttachment` with `contentType: "text/markdown"`, the encoded markdown bytes, and `sourceUrl: url`.

## 3. Tests & verification

- [x] 3.1 Extend `worker/attachments.test.ts` with offline cases: a malformed / non-`http(s)` URL is rejected before any fetch, and the URL entry point rejects an empty fetch result (inject/stub the fetch so the test stays offline).
- [x] 3.2 Run the verification gate: `bunx biome check .`, `bunx tsc -b`, `bun test`.
- [x] 3.3 Validate the change: `openspec validate add-url-attachments --strict`.
