## Why

A url Source contributes exactly one Resource: its own page. Every other ingester emits one Resource per thing it found — rss per entry, search per hit, youtube per video — so a url Source pointed at an index page like `news.ycombinator.com` or `github.com/trending` contributes a single Resource whose whole worth is the links it lists, and those links are never looked at.

It also fixes a blind spot in discovery. Exa queries are written from the topic's own context, so search results skew toward what the context already names. Links harvested from a page the owner chose are un-prompted, which is the mechanism that surfaces the thing a topic never thought to mention.

## What Changes

- `urlIngester` fetches its page at ingest time and emits the page as a Resource **plus one Resource per outbound link the page contains**, instead of emitting the page url alone and deferring every fetch to curation.
- Each link Resource carries its anchor text as its `snippet`, so the embed-filter gate has real signal to judge it on before any paid fetch is spent.
- Each link Resource's `kind` comes from the host-to-kind mapping the search ingester already applies, so a linked video lands as a `watch` Resource and dedupes against the youtube ingester's output rather than sitting beside it as a duplicate.
- `urlIngester` stops returning cost `0` and charges its fetch into the Budget's `ingestion` bucket, keeping `stage_costs` and the reported cost line honest.
- The page's fetched body is carried through ingest and stored on the page Resource, so curation's existing reuse rule serves it for free instead of scraping the same url a second time. **The brief asked whether the shared fetch already caches by url with ETag and Last-Modified so this would be paid for once — it does not.** There is no url-keyed cache anywhere: reuse is keyed on the stored Resource row's `content_key`, `fetched_at`, and validators, and ingest inserts those rows only after every ingester has returned. Without this change carrying the body through, an ingest-time fetch and a curation-time fetch of the same url would be two Firecrawl charges. The change closes that itself rather than assuming a cache that isn't there.
- A url Source whose page is already stored and still fresh harvests its links from the stored body and spends nothing, using the same staleness rule curation uses.
- Harvesting is bounded: a cap on link Resources per page, same-page anchors and non-http schemes dropped, and depth one with no recursion.
- A page whose fetch fails emits the page Resource alone rather than failing the Source, matching how ingesters isolate failures today.

## Capabilities

### New Capabilities

None. This extends an ingester that already exists.

### Modified Capabilities

- `source-ingestion`: adds a requirement for what the url ingester emits, which today has none at all. Amends "Ingesters populate the Resource snippet and leave content unset" so the url ingester may carry the body it already paid for, and amends the cost requirement so `url` joins `search` as an ingester that can charge.

## Impact

- `worker/ingest/url.ts` — the whole change lands here: fetch, extract, bound, and emit.
- `worker/ingest/index.ts` — carries a fetched body from an ingester through the Resource insert and stores it, which no ingester has needed before.
- `worker/ingest/ingester.ts` — `NewResource` gains the optional body an ingester may hand over.
- `worker/ingest/search.ts` — `toResourceKind` moves somewhere both ingesters can reach it.
- No schema change. `resources` already holds `content_key`, `content_bytes`, `etag`, `last_modified`, and `fetched_at`.
- No change to `curation`. Its reuse rule already reads exactly the fields ingest will now write, and its content screen already runs on reused content as well as freshly fetched content, so a body stored at ingest is still screened before any model reads it.
- Spend goes up per url Source: one Firecrawl fetch at ingest where there were none, and a wider candidate set for the embed gate to judge. The cap is what bounds it.
