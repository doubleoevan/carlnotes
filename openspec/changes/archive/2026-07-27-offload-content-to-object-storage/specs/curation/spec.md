## ADDED Requirements

### Requirement: Curation reads a Resource's stored body from object storage

When curation needs a Resource's stored page body that is not already in memory — for example scoring a Resource whose content an earlier Scan fetched — it SHALL read the body through `getResourceContent(content_key)` rather than from a Postgres column. The check that decides whether a Resource has stored content SHALL key on `content_key` being non-null. A read that fails — the object is missing, or object storage is unreachable — SHALL be treated as a cache miss and fall through to the normal fetch path, never failing the Resource or the Scan. Inline content could not fail to read, so this read is the one new way reuse can fail.

#### Scenario: A stored body is read from object storage for scoring

- **WHEN** curation scores a Resource whose body was fetched by an earlier Scan and is not in memory
- **THEN** it reads the markdown via `getResourceContent(content_key)` and scores that

#### Scenario: A Resource with no key has no stored content

- **WHEN** a Resource's `content_key` is null
- **THEN** curation treats it as having no stored content and does not attempt an object-storage read

#### Scenario: An unreadable stored object falls through to a fetch

- **WHEN** a Resource has a `content_key` but the object is missing or object storage errors on the read
- **THEN** curation logs it, treats the Resource as having no reusable content, and fetches the page again rather than failing the Resource

### Requirement: Deleting a Resource deletes its stored content

Deleting a Resource SHALL best-effort delete its stored content object via `deleteResourceContent(content_key)` when the Resource has a `content_key`, so a deleted Resource leaves no orphaned object. A best-effort delete failure SHALL NOT fail the deletion.

#### Scenario: Deleting a Resource removes its object

- **WHEN** a Resource with a `content_key` is deleted
- **THEN** its stored content object is best-effort deleted

## MODIFIED Requirements

### Requirement: Survivors are fetched via Firecrawl with a snippet fallback

For each embed-filter survivor that reaches the fetch stage and is neither reused nor revalidated (see the reuse-and-revalidation requirement), curation SHALL fetch the page's full content via Firecrawl (raw HTTP, `FIRECRAWL_API_KEY`), write the fetched markdown to object storage, store its `content_key` and `content_bytes` on the Resource, refresh `resources.fetched_at`, persist any origin `etag`/`last_modified` the fetch response exposes (leaving them null when it does not), and count the outcome as `fetched`. It SHALL score the in-memory markdown in the same pass so the fetch does not round-trip through object storage. On a Firecrawl fetch failure it SHALL fall back to the Resource's native snippet — never the bare title — as the text to score. On an object-storage write failure it SHALL best-effort delete the object, leave `content_key` null, and fall back to the snippet, mirroring the attachment orphan-cleanup posture. Neither failure SHALL fail the Resource or the Scan.

#### Scenario: Content is fetched and stored

- **WHEN** a survivor is fetched successfully via Firecrawl
- **THEN** the fetched markdown is written to object storage, the Resource stores its `content_key` and `content_bytes`, `fetched_at` is refreshed, the outcome is counted as `fetched`, and scoring runs against the in-memory markdown without re-reading it from object storage

#### Scenario: Fetch validators are persisted when exposed

- **WHEN** the Firecrawl fetch response exposes an origin `etag` or `last_modified`
- **THEN** curation stores them on the Resource so a later Scan can send a conditional GET, and leaves them null when the response exposes neither

#### Scenario: Fetch failure falls back to the snippet

- **WHEN** the Firecrawl fetch for a survivor fails
- **THEN** scoring runs against the Resource's native snippet, `content_key` stays null, and the Resource is not failed

#### Scenario: An object-storage write failure falls back to the snippet

- **WHEN** the object-storage write for a fetched survivor fails
- **THEN** curation best-effort deletes the object, leaves `content_key` null, scores the snippet, and does not fail the Resource or the Scan
