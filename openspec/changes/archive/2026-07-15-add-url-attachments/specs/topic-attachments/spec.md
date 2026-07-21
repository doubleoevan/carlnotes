## ADDED Requirements

### Requirement: An attachment can be ingested from a URL

Ingesting an attachment from a URL SHALL fetch the page's content as markdown through the Firecrawl seam (`worker/scrape.ts`), wrap the result as a `text/markdown` upload, and pass it through the same ingestion path as a file upload — the extraction, context generation, storage, persistence, and failure/orphan cleanup are reused unchanged. The URL SHALL be validated as a well-formed `http`/`https` URL before any fetch is attempted. A fetch that fails (network error, missing `FIRECRAWL_API_KEY`, or non-ok response) or returns empty content SHALL fail ingestion before anything is stored, so no contextless attachment is ever persisted. The originating URL SHALL be recorded on the attachment's `sourceUrl` column.

This is a one-time context read at attach time, not a Source: it does not create a Scan, Resource, or Finding, and does not change `generateContext` or a Topic's scan context.

#### Scenario: A URL page is fetched and stored as an attachment

- **WHEN** an attachment is ingested for a Topic from a valid `http(s)` URL whose page fetches to non-empty markdown
- **THEN** the page markdown is extracted and reduced to a context string, an attachment row is persisted with its `context` and with `sourceUrl` set to the fetched URL, and the raw markdown is stored in object storage

#### Scenario: URL ingestion reuses the file ingestion path

- **WHEN** the fetched markdown is wrapped as a `text/markdown` upload
- **THEN** it flows through the same size validation, topic-existence check, extraction, context generation, storage, and orphan-cleanup as a file upload, with no separate ingestion code path

#### Scenario: A malformed URL is rejected before any fetch

- **WHEN** an attachment is ingested from a value that is not a well-formed `http`/`https` URL
- **THEN** ingestion fails with an error before Firecrawl is called, and no object is stored and no row is created

#### Scenario: An empty or failed fetch stores no attachment

- **WHEN** the Firecrawl fetch throws or returns empty content for the URL
- **THEN** ingestion fails with an error, no attachment row is created, and nothing is left in object storage

#### Scenario: File uploads carry no source URL

- **WHEN** an attachment is ingested from uploaded file bytes rather than a URL
- **THEN** its `sourceUrl` is null, and the file-upload behavior is otherwise unchanged
