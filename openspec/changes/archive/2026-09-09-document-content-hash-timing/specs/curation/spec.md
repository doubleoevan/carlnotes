## MODIFIED Requirements

### Requirement: Content-hash dedupe drops content-level duplicates

Curation SHALL compute a content hash (SHA-256 over the Resource's normalized title and native snippet) and persist it to `resources.content_hash`. A Resource whose content hash matches that of an already-admitted Resource — stored by an earlier Scan, or admitted earlier in this Scan — SHALL be dropped as a filtered duplicate and SHALL NOT be scored. The stored-Resource comparison SHALL exclude this Scan's own candidate ids, for the same reason as embedding dedupe: a candidate must not be dropped against a sibling that has not yet been admitted. This content-level dedupe is distinct from the canonical-URL dedupe ingestion already performs.

The hash SHALL be taken in the dedupe stage, over the title and snippet as they stand there. The fetch stage runs after it and may replace a title that was read off the url with the page's own, and SHALL leave the hash as the dedupe stage wrote it. A Resource's stored hash therefore describes the title it had when it was deduped, not always the title it carries now, and the two SHALL NOT be assumed equal.

Leaving the hash alone is what the re-review selector depends on: a Finding stores the hash its Resource was reviewed against, and a Resource is reviewed again only when the two stop matching. Refreshing the hash on a retitle would part them for every retitled Resource and send each one back through the paid scoring stage to say the same thing under a better name.

#### Scenario: Content-identical Resource at a different URL is dropped

- **WHEN** a Resource's content hash equals that of an already-admitted Resource with a different canonical URL
- **THEN** the duplicate is dropped as filtered, produces no Finding, and the original stands

#### Scenario: The content hash is persisted

- **WHEN** curation processes a Resource
- **THEN** its `content_hash` is written so later Scans can dedupe against it

#### Scenario: Sibling candidates sharing a hash leave one survivor

- **WHEN** two candidates in the same Scan share a content hash
- **THEN** the first-ranked one is admitted and the second is dropped, never both

#### Scenario: A retitled Resource keeps the hash it was deduped under

- **WHEN** the fetch stage replaces a Resource's url-read title with the page's own title
- **THEN** `resources.content_hash` is left as the dedupe stage wrote it, the Resource still matches its Finding's `reviewed_content_hash`, and no later Scan scores it again for the new title
