## 1. Shared pieces the harvest needs

- [x] 1.1 Move `toResourceKind` and its `WATCH_HOSTS`/`LISTEN_HOSTS` lists out of `worker/ingest/search.ts` into a module both ingesters import, keeping `search.ts`'s behavior identical and its tests passing.
- [x] 1.2 Add a link extractor that takes a page's Markdown and its own url and returns `{ url, anchorText }` pairs in document order, dropping same-page anchors, non-http schemes, and the page's own url, capped at the harvest limit.
- [x] 1.3 Cover the extractor: a page with more links than the cap keeps the first N in document order, a `mailto:` and a `javascript:` link are dropped, a fragment-only link is dropped, a link with no anchor text still comes back, and a relative link resolves against the page url.

## 2. Carrying a fetched body through ingest

- [x] 2.1 Add the optional fetched body to what an ingester may hand back with a Resource, and strip it from the values before the `resources` insert so the insert shape is unchanged.
- [x] 2.2 After the insert, store each carried body through the same object-storage path curation uses and set `content_key`, `content_bytes`, `etag`, `last_modified`, and `fetched_at` on that Resource's row.
- [x] 2.3 Make a failed store leave the row's `content_key` unset and the Scan unaffected, so the page falls back to curation's own fetch rather than failing ingest.
- [x] 2.4 Cover it: a Resource handed over with a body ends up with `content_key` set, one handed over without a body is stored exactly as before, and a failed store leaves the row usable.

## 3. The url ingester

- [x] 3.1 Look up the page's stored Resource row first and harvest from its stored body at zero cost when it has a `content_key` and its `fetched_at` is within `CONTENT_TTL_MS`.
- [x] 3.2 Otherwise fetch the page through the shared Firecrawl helper, charge the same per-fetch cost curation charges into the returned ingester cost, and hand the body back with the page Resource.
- [x] 3.3 Emit the page as a `read` Resource with its title unset, plus one Resource per extracted link, each carrying its anchor text as `snippet` and its host-derived `kind`.
- [x] 3.4 Catch a fetch failure and emit the page Resource alone at zero cost, so the Source runs rather than failing.
- [x] 3.5 Cover the ingester: an index page emits the page plus its links, a linked video comes back as `watch`, a fresh stored page costs nothing and still harvests, a fetch failure emits the page alone, and a misconfigured `config.url` still throws.

## 4. Verification

- [x] 4.1 `bunx biome check .`, `bunx tsc -b`, `bun test`.
- [x] 4.2 Live: add a url Source pointing at an index page, run a scan, and confirm the Scan's `found_count` includes the harvested links and that they appear as Resources with anchor-text snippets.
- [x] 4.3 Live: confirm the page's body is billed once — the Scan's `stage_costs` shows the fetch under `ingestion` and curation reports the page as `reused` rather than fetching it again.
- [x] 4.4 Live: re-run the same scan within `CONTENT_TTL_MS` and confirm the ingestion bucket charges nothing for that page while the links are still harvested.
- [x] 4.5 Live: point a url Source at a page that cannot be fetched and confirm the Source reports as run, the page Resource still exists, and the Scan succeeds.
