## Why

A Finding row shows a url slug, a commit sha, or a topic id where the page's name belongs — `5701bfb717db3eec09bd996cab06b269d8bb79e1`, `.github`, `v0.3`. Nothing in the pipeline ever reads a page's own title: the url ingester leaves the page Resource untitled and gives each link only its anchor text, so the derive-a-title rule falls back to the url's last path segment. The page title is already in hand and thrown away — the review's scrape reads Firecrawl's metadata for `etag` and `last-modified` and drops the `title` sitting beside them.

The same page title is read a second way, for chat link previews, and that path returns its text undecoded, so a title holding an apostrophe is stored and rendered as `a topic&#39;s findings`.

## What Changes

- The scrape returns the page's own title alongside the text it already returns, read from the metadata the Firecrawl response already carries. A transcript or caption path has no page to title, and returns none.
- A Resource whose stored title is the one the derive-a-title rule read off its url takes the page's title when the review fetches it. A title an ingester supplied, or one the rule read from a real snippet line, is left alone: a page's own title is often its site's name, so overwriting a good title would read worse, not better.
- The link preview meta-tag parse decodes html entities, so a stored title and description hold the characters the page meant rather than their markup.

Existing rows keep their derived titles: a Resource with a Finding reviewed against the current context is never re-reviewed, so it is never refetched. A one-off script retitles those, and is out of scope here.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `curation`: the fetch that fills a Resource's content also fills its title when the stored one was derived from the url
- `link-previews`: a link preview's title and description decode html entities

Ingestion is unchanged: it still leaves the url Source's page untitled and still derives a title from the url when nothing better is at hand. The derived title is what the fetch later replaces.

## Impact

- `worker/scrape.ts` — `FetchResult` carries a title; `fetchFirecrawlMarkdown` reads it from the metadata it already parses
- `worker/review/score.ts` — the row update that stores fetched content stores the title too
- `worker/ingest/normalize.ts` — the test for whether a stored title came from the url
- `worker/linkPreview.ts` — the meta-tag parse decodes entities
- No schema change, no new fetch, and no added cost: both titles come from responses the app already reads
