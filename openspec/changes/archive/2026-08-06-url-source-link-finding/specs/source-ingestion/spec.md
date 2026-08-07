## ADDED Requirements

### Requirement: The url ingester emits the page and the links it contains

`urlIngester` SHALL read the page url from the Source's `config`, reject a url that is malformed, non-http, or privately routable, and emit the page itself as a `read` Resource. It SHALL additionally fetch the page's body and emit one Resource per outbound link that body contains, so a Source pointed at an index page contributes the material that page indexes rather than a single Resource whose worth is entirely the links it lists.

Each link Resource SHALL carry the link's anchor text as its `snippet`, so the embed-filter gate has real text to judge it on before any paid fetch is spent on it. A link with no anchor text SHALL still be emitted with a null `snippet`.

Each link Resource's `kind` SHALL come from the same host-to-kind mapping the search ingester applies, so a linked video is emitted as a `watch` Resource and collapses against the youtube ingester's output under the global canonical-url dedupe rather than sitting beside it as a second row for the same video.

The page Resource's `title` SHALL be left unset, as it is today, for the fallback-title rule to derive.

#### Scenario: An index page contributes the links it lists

- **WHEN** a Source of kind `url` pointing at a page containing outbound links is scanned
- **THEN** the ingester emits the page as a `read` Resource and one Resource per outbound link, each with the link's canonical url

#### Scenario: Anchor text becomes the link Resource's snippet

- **WHEN** the ingester emits a Resource for a link whose anchor text reads "A tour of Rust's async runtimes"
- **THEN** that Resource's `snippet` holds that anchor text and its `content` is unset

#### Scenario: A link with no anchor text is still emitted

- **WHEN** a page contains a link carrying no anchor text
- **THEN** the Resource is emitted with a null `snippet` rather than being dropped

#### Scenario: A linked video is emitted as a watch Resource

- **WHEN** a page links to a YouTube video
- **THEN** the emitted Resource's `kind` is `watch`, matching what the youtube ingester would emit for the same url, so the two collapse to one Resource

#### Scenario: The page Resource carries no title

- **WHEN** the ingester emits the page Resource
- **THEN** its `title` is unset and the fallback-title rule derives one

### Requirement: A url Source's harvest is bounded and never recurses

Link harvesting SHALL be bounded so that one page cannot dominate a Scan's candidate set or its spend:

- The number of link Resources emitted from a single page SHALL be capped at a defined constant. When a page carries more links than the cap, the ingester SHALL emit the first ones in document order and drop the rest.
- Same-page anchors (a url differing from the page's own only by fragment) and any url that is not http or https SHALL be dropped before emission.
- Extraction SHALL be depth one. A harvested link SHALL NOT itself be fetched for its links, in this Scan or any later one.

#### Scenario: A page past the cap contributes only the cap

- **WHEN** a page carries more outbound links than the cap allows
- **THEN** the ingester emits the page Resource plus exactly the cap's worth of link Resources, in document order

#### Scenario: Fragments and non-http links are dropped

- **WHEN** a page contains a same-page anchor, a `mailto:` link, or a `javascript:` link
- **THEN** none of them is emitted as a Resource

#### Scenario: Harvesting never recurses

- **WHEN** a link harvested from a url Source is later scanned as a Resource
- **THEN** it is fetched and scored like any other Resource and its own links are not harvested

### Requirement: A failed page fetch degrades to the page alone

When the url Source's page cannot be fetched, the ingester SHALL emit the page Resource by itself and report the Source as having run, rather than throwing and failing the Source. The page Resource still reaches curation, which fetches it on its own terms, so a fetch failure at ingest costs the Scan the links and nothing else.

#### Scenario: A fetch failure still emits the page

- **WHEN** the ingest-time fetch of a url Source's page fails or times out
- **THEN** the ingester emits the page as a single Resource, emits no link Resources, and the Source is not marked failed

#### Scenario: The page still reaches curation after a failed harvest

- **WHEN** the harvest failed but the page Resource was emitted
- **THEN** curation fetches and scores that page exactly as it does for a url Source today

## MODIFIED Requirements

### Requirement: Ingesters populate the Resource snippet and leave content unset

Every ingester SHALL populate the emitted Resource's `snippet` from the native text the Source's own API returns, so curation's cheap stages have real text without an extra fetch: `rssIngester` from the feed entry's description/summary, `youtubeIngester` from the video description, `redditIngester` from the post selftext, `searchIngester` from Exa's result highlights (requesting highlights in the search call), and `urlIngester` from each link's anchor text. An ingester SHALL leave `content` unset — curation fills it when it fetches a survivor.

An ingester that has already fetched a Resource's body for its own purposes MAY hand that body over with the Resource, and ingest SHALL store it and record `content_key`, `content_bytes`, `etag`, `last_modified`, and `fetched_at` on the stored row. This is the one exception to leaving `content` unset, and it exists so a body is paid for once rather than twice: without it, an ingester's fetch and curation's later fetch of the same url would each be billed, because reuse is keyed on the stored Resource row and no url-keyed fetch cache exists. Only the url ingester fetches at ingest today. An ingester that has not fetched SHALL hand over no body, and the Resource is stored exactly as before.

This does not change what else an ingester emits: it still emits Resources only (never Findings, scores, or embeddings) with the canonical URL, title, and kind it already produces, and leaves `embedding` and `embedding_model` unset.

#### Scenario: RSS ingester sets the snippet from the entry description

- **WHEN** a Source of kind `rss` is scanned and a feed entry has a description or summary
- **THEN** the emitted Resource's `snippet` holds that native text and its `content` is unset

#### Scenario: YouTube ingester sets the snippet from the video description

- **WHEN** a Source of kind `youtube` is scanned
- **THEN** each emitted Resource's `snippet` holds the video description and its `content` is unset

#### Scenario: Reddit ingester sets the snippet from the post selftext

- **WHEN** a Source of kind `reddit` is scanned and a post has selftext
- **THEN** the emitted Resource's `snippet` holds that selftext and its `content` is unset

#### Scenario: Search ingester sets the snippet from Exa highlights

- **WHEN** a Source of kind `search` is scanned
- **THEN** `searchIngester` requests highlights from Exa and each emitted Resource's `snippet` holds its result highlights, with `content` unset

#### Scenario: Url ingester sets the snippet from anchor text

- **WHEN** a Source of kind `url` is scanned and its page contains links
- **THEN** each emitted link Resource's `snippet` holds that link's anchor text

#### Scenario: A missing native text leaves the snippet null, not the title

- **WHEN** a Source's entry has no native description/selftext/highlights
- **THEN** the emitted Resource's `snippet` is null (the title is never copied into the snippet) and the Resource is still emitted

#### Scenario: A body an ingester already fetched is stored, not refetched

- **WHEN** the url ingester fetches its page and hands the body over with the page Resource
- **THEN** ingest stores that body and records `content_key`, `content_bytes`, `etag`, `last_modified`, and `fetched_at`, and curation reuses it without a second Firecrawl call or a second charge

#### Scenario: An ingester that fetched nothing stores nothing

- **WHEN** any ingester emits a Resource without a body
- **THEN** the Resource is stored with `content_key` unset, exactly as before

### Requirement: Scan records found count and cost

`runTopicScan` SHALL create a Scan in status `running`, and on completion record `found_count` (the number of deduped Resources discovered across all Sources), set `finished_at`, and mark the Scan `succeeded`. Ingestion SHALL NOT set `kept_count`, `filtered_count`, or `ai_summary` — those belong to curation.

The Scan's Budget SHALL be created before ingestion runs, and each Source's ingester cost SHALL charge into that Budget's `ingestion` bucket — zero for the ingesters that use no paid API. `scans.cost` SHALL be the Budget's total, so ingestion spend is inside the same object and the same ceiling the paid curation stages read, rather than a number summed alongside them at close.

An ingester that fetches a page SHALL charge that fetch into the `ingestion` bucket at the same per-fetch cost curation charges, so the same scrape costs the same wherever it happens and the reported cost line stays honest. An ingester SHALL NOT charge for a fetch it did not make: when it serves a page from already-stored content, its cost for that page SHALL be zero.

#### Scenario: Counts and cost are recorded on success

- **WHEN** a scan completes with its Sources having emitted Resources
- **THEN** the Scan's `found_count` equals the count of deduped Resources discovered, its `cost` equals the Budget total including the ingestion bucket, `finished_at` is set, and its status is `succeeded`

#### Scenario: Paid ingestion charges into the Budget

- **WHEN** a search Source's ingester returns a non-zero cost
- **THEN** that cost is charged into the Budget's `ingestion` bucket and is visible to the spend ceiling the curation stages check

#### Scenario: A url Source's page fetch is charged to ingestion

- **WHEN** a url Source fetches its page at ingest
- **THEN** the fetch is charged into the `ingestion` bucket at the same per-fetch cost curation charges, and it appears in the Scan's `stage_costs`

#### Scenario: A page served from stored content charges nothing

- **WHEN** a url Source's page already has stored content that is not stale
- **THEN** the ingester harvests its links from that stored body, makes no Firecrawl call, and returns zero cost for that page

#### Scenario: Keyless ingesters charge nothing

- **WHEN** an RSS, Reddit, or YouTube Source runs
- **THEN** its returned cost is zero and the ingestion bucket is unchanged by it

#### Scenario: Curation counts are left untouched

- **WHEN** ingestion finishes a scan
- **THEN** `kept_count` and `filtered_count` remain at their defaults and `ai_summary` is unset
