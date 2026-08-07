# source-ingestion Specification

## Purpose
TBD - created by archiving change add-source-ingestion. Update Purpose after archive.
## Requirements
### Requirement: Shared ingester interface

The system SHALL define a single `SourceIngester` interface that every source kind implements: given a Source, it returns the Resources it found, the cost it incurred, and OPTIONALLY the fallback mode it ran in. Ingesters SHALL find Resources only — never Findings, scores, or embeddings — and SHALL leave `embedding` and `embedding_model` unset so the curation pipeline fills them later. An ingester SHALL set `fallbackMode` only when it ran a keyless fallback path, and SHALL leave it unset when it ran its keyed path or has no fallback.

#### Scenario: Ingester returns Resources and cost

- **WHEN** an ingester runs against a Source
- **THEN** it returns a list of Resources and a numeric cost, and produces no Findings

#### Scenario: Ingester leaves embedding unset

- **WHEN** an ingester finds a Resource
- **THEN** the Resource has no `embedding` and no `embedding_model` set

#### Scenario: Ingester reports its fallback mode when it falls back

- **WHEN** an ingester runs its keyless fallback path
- **THEN** it sets `fallbackMode` to a value identifying that path

#### Scenario: Keyed or modeless ingester omits the fallback mode

- **WHEN** an ingester runs its keyed path, or has no fallback (such as RSS)
- **THEN** `fallbackMode` is unset

### Requirement: Kind-dispatched ingester registry

`runTopicScan` SHALL dispatch each Source to the ingester registered for its `kind`. A Source whose `kind` has no registered ingester SHALL be skipped without aborting the Scan.

A Source that has not passed its screen SHALL be skipped the same way, before its ingester is reached, so that an unscreened url is never fetched into a Resource. The skip SHALL be decided by the Source's readiness alone rather than by its kind, so a kind that gains screening later needs no change here.

#### Scenario: RSS Source is dispatched to the RSS ingester

- **WHEN** a Source of kind `rss` is scanned
- **THEN** it is handled by `rssIngester`

#### Scenario: Unregistered kind is skipped

- **WHEN** a Source whose `kind` has no registered ingester is scanned
- **THEN** that Source is skipped and the Scan continues with the remaining Sources

#### Scenario: A Source that has not passed its screen is skipped

- **WHEN** a Source that is pending or failed screening is reached during ingest
- **THEN** its ingester is not called, no Resource is created from it, and the Scan continues with the remaining Sources

### Requirement: RSS ingester finds canonical Resources

`rssIngester` SHALL fetch the feed URL from the Source's `config`, parse RSS or Atom, and find one Resource per entry with a canonical URL, a title, `kind` `read`, and cost `0`. It SHALL require no Integration (keyless). Entries sharing a canonical URL within one feed SHALL collapse to a single Resource.

#### Scenario: Feed entries become Resources

- **WHEN** a Source of kind `rss` with a valid feed URL is scanned
- **THEN** `rssIngester` finds one Resource per feed entry, each with its canonical URL, its title, and `kind` `read`

#### Scenario: Keyless operation

- **WHEN** the RSS Source has no `integration_id`
- **THEN** the ingester still runs and finds Resources

#### Scenario: Duplicate entries within a feed collapse

- **WHEN** a feed lists two entries that resolve to the same canonical URL
- **THEN** only one Resource is found for that URL

### Requirement: Global Resource dedupe on canonical URL

Upserting found Resources SHALL dedupe globally on canonical URL. Re-scanning a Source whose entries already exist as Resources SHALL NOT create duplicate rows and SHALL NOT overwrite the existing Resource, so its later-filled `embedding` and stored content are preserved. The one field a rescan MAY refresh is `engagement`, since a post's score is the Resource's own and moves after it was first found. A rescan that carries no engagement value SHALL keep the stored one rather than blanking it.

#### Scenario: Existing URL is not duplicated

- **WHEN** a scan finds a Resource whose canonical URL already exists in `resources`
- **THEN** no duplicate row is created and the existing row is left unchanged

#### Scenario: New URL is inserted

- **WHEN** a scan finds a Resource whose canonical URL is not yet stored
- **THEN** a new `resources` row is inserted

### Requirement: Scan records found count and cost

`runTopicScan` SHALL create a Scan in status `running`, and on completion record `found_count` (the number of deduped Resources discovered across all Sources), set `finished_at`, and mark the Scan `succeeded`. Ingestion SHALL NOT set `kept_count`, `filtered_count`, or `ai_summary` — those belong to curation.

The Scan's Budget SHALL be created before ingestion runs, and each Source's ingester cost SHALL charge into that Budget's `ingestion` bucket — zero for the ingesters that use no paid API. `scans.cost` SHALL be the Budget's total, so ingestion spend is inside the same object and the same limit the paid curation stages read, rather than a number summed alongside them at close.

An ingester that fetches a page SHALL charge that fetch into the `ingestion` bucket at the same per-fetch cost curation charges, so the same scrape costs the same wherever it happens and the reported cost line stays honest. An ingester SHALL NOT charge for a fetch it did not make: when it serves a page from already-stored content, its cost for that page SHALL be zero.

#### Scenario: Counts and cost are recorded on success

- **WHEN** a scan completes with its Sources having returned Resources
- **THEN** the Scan's `found_count` equals the count of deduped Resources discovered, its `cost` equals the Budget total including the ingestion bucket, `finished_at` is set, and its status is `succeeded`

#### Scenario: Paid ingestion charges into the Budget

- **WHEN** a search Source's ingester returns a non-zero cost
- **THEN** that cost is charged into the Budget's `ingestion` bucket and is visible to the spend limit the curation stages check

#### Scenario: A url Source's page fetch is charged to ingestion

- **WHEN** a url Source fetches its page at ingest
- **THEN** the fetch is charged into the `ingestion` bucket at the same per-fetch cost curation charges, and it appears in the Scan's `stage_costs`

#### Scenario: A page served from stored content charges nothing

- **WHEN** a url Source's page already has stored content that is not stale
- **THEN** the ingester finds its links in that stored body, makes no Firecrawl call, and returns zero cost for that page

#### Scenario: Keyless ingesters charge nothing

- **WHEN** an RSS, Reddit, or YouTube Source runs
- **THEN** its returned cost is zero and the ingestion bucket is unchanged by it

#### Scenario: Curation counts are left untouched

- **WHEN** ingestion finishes a scan
- **THEN** `kept_count` and `filtered_count` remain at their defaults and `ai_summary` is unset

### Requirement: Per-Source failure isolation

A failing Source SHALL degrade only that Source's contribution. `runTopicScan` SHALL continue scanning the remaining Sources and still record the Resources they produced. A Scan SHALL be marked `failed` (with the error recorded) only when every Source failed.

#### Scenario: One Source fails, another succeeds

- **WHEN** one Source's ingester throws and another Source's ingester succeeds
- **THEN** the succeeding Source's Resources are upserted and the Scan is marked `succeeded`

#### Scenario: All Sources fail

- **WHEN** every Source's ingester throws
- **THEN** the Scan is marked `failed` and the error is recorded

### Requirement: Reddit ingester finds canonical Resources

`redditIngester` SHALL read the subreddit (and an optional sort mode) from the Source's `config` and find one Resource per post, `kind` `read`, cost `0`, deduped by canonical URL, using the post's comments permalink (`https://www.reddit.com<permalink>`) as the canonical URL. When `REDDIT_CLIENT_ID` **and** `REDDIT_CLIENT_SECRET` are set, it SHALL fetch via the app-only OAuth API — honoring the configured sort mode — with a descriptive `User-Agent`, and leave `fallbackMode` unset. When either credential is absent, it SHALL fall back to the keyless public subreddit `.rss` feed with the same descriptive `User-Agent` and set `fallbackMode` to `reddit-rss`. Both modes SHALL find the same canonical URL for the same post. It SHALL require no Integration (`integration_id` may be null).

#### Scenario: OAuth mode when credentials are present

- **WHEN** `REDDIT_CLIENT_ID` and `REDDIT_CLIENT_SECRET` are set and a Source of kind `reddit` is scanned
- **THEN** `redditIngester` fetches the subreddit listing via the OAuth API honoring the configured sort, finds one `read` Resource per post keyed by its comments permalink, and leaves `fallbackMode` unset

#### Scenario: Keyless RSS fallback when credentials are absent

- **WHEN** `REDDIT_CLIENT_ID` or `REDDIT_CLIENT_SECRET` is missing and a Source of kind `reddit` is scanned
- **THEN** `redditIngester` fetches the public subreddit `.rss` feed with a descriptive `User-Agent`, finds `read` Resources, and sets `fallbackMode` to `reddit-rss`

#### Scenario: Canonical URL is stable across modes

- **WHEN** the same Reddit post is found once by the OAuth path and once by the RSS fallback
- **THEN** both find the same canonical URL (the comments permalink), so it dedupes to a single Resource

#### Scenario: Duplicate posts within one fetch collapse

- **WHEN** a fetch returns two posts that resolve to the same comments permalink
- **THEN** only one Resource is found for that URL

### Requirement: YouTube ingester finds canonical Resources

`youtubeIngester` SHALL read a channel id or playlist id from the Source's `config` and find one Resource per video, `kind` `watch`, cost `0`, deduped by canonical URL, using `https://www.youtube.com/watch?v=<videoId>` as the canonical URL. When `YOUTUBE_API_KEY` is set, it SHALL fetch recent videos via the Data API v3 (the channel's uploads playlist) and leave `fallbackMode` unset. When the key is absent, it SHALL fall back to the keyless channel/playlist Atom feed and set `fallbackMode` to `youtube-atom`. Both modes SHALL find the same canonical URL for the same video. It SHALL require no Integration (`integration_id` may be null).

#### Scenario: API mode when the key is present

- **WHEN** `YOUTUBE_API_KEY` is set and a Source of kind `youtube` is scanned
- **THEN** `youtubeIngester` fetches videos via the Data API, finds one `watch` Resource per video keyed by its `watch?v=` URL, and leaves `fallbackMode` unset

#### Scenario: Keyless Atom fallback when the key is absent

- **WHEN** `YOUTUBE_API_KEY` is missing and a Source of kind `youtube` is scanned
- **THEN** `youtubeIngester` fetches the channel/playlist Atom feed, finds `watch` Resources, and sets `fallbackMode` to `youtube-atom`

#### Scenario: Canonical URL is stable across modes

- **WHEN** the same video is found once by the API path and once by the Atom fallback
- **THEN** both find the same `https://www.youtube.com/watch?v=<videoId>` URL, so it dedupes to a single Resource

### Requirement: Fallback mode is recorded on the Scan

`runTopicScan` SHALL record on the completed Scan every Source that ran a keyless fallback as an entry `{ sourceId, fallbackMode }` in `scans.fallback_sources`. Running a fallback SHALL NOT mark the Scan `failed`: a Scan whose Sources all succeeded — even if some fell back — SHALL be `succeeded`. `fallback_sources` SHALL be empty when no Source fell back.

#### Scenario: A Source that fell back is recorded and the Scan still succeeds

- **WHEN** a Source's ingester succeeds but reports a `fallbackMode`
- **THEN** the Scan's `fallback_sources` contains `{ sourceId, fallbackMode }` for that Source and the Scan's status is `succeeded`

#### Scenario: No fallback leaves the trace empty

- **WHEN** every Source's ingester succeeds without reporting a `fallbackMode`
- **THEN** the Scan's `fallback_sources` is empty

#### Scenario: Only Sources that fell back are listed

- **WHEN** one Source runs a keyed path and another reports a `fallbackMode`
- **THEN** the Scan's `fallback_sources` contains only that Source's entry

### Requirement: Search ingester finds Resources from LLM-generated Exa queries

`searchIngester` SHALL handle Sources of kind `search`. It SHALL read the Source's topic **effective context** (via `source.topic_id`) — the topic's own `context` together with the `context` of each of the topic's attachments — generate a bounded list of search queries from it with an LLM through the LiteLLM proxy (AI SDK structured output with a Zod schema), run each query through Exa's search API using `EXA_API_KEY`, and find one Resource per result with a canonical URL (the result URL), a title, and `kind` `read`. Results SHALL be deduped by canonical URL within the ingester run. It SHALL require no Integration (`integration_id` may be null; `EXA_API_KEY` and the proxy credential are read from the environment). It SHALL leave `fallbackMode` unset — search has no keyless fallback. It SHALL leave `embedding` and `embedding_model` unset for the curation pipeline.

#### Scenario: Context doc drives queries and Exa results become Resources

- **WHEN** a Source of kind `search` whose topic has a non-empty effective context (its own `context`, an attachment `context`, or both) is scanned
- **THEN** `searchIngester` generates queries from that effective context, searches Exa for each, and finds one `read` Resource per result, each keyed by its canonical URL

#### Scenario: Empty context doc falls back to the topic name

- **WHEN** the topic's own `context` is empty and it has no attachment contexts
- **THEN** query generation falls back to the topic `name` rather than sending an empty prompt

#### Scenario: Results dedupe across queries

- **WHEN** two generated queries return results that resolve to the same canonical URL
- **THEN** only one Resource is found for that URL

#### Scenario: Ingester reports Exa's cost

- **WHEN** `searchIngester` completes a scan that called Exa
- **THEN** it returns a `cost` equal to the sum of the dollar cost Exa reported across the queries (not `0`), and that cost is summed into the Scan's `cost`

#### Scenario: No results yields no Resources without failing

- **WHEN** query generation returns no queries, or Exa returns no results
- **THEN** the ingester finds zero Resources and does not fail the Source

#### Scenario: Missing key or search error degrades only this Source

- **WHEN** `EXA_API_KEY` is absent, the LiteLLM proxy is unreachable, or Exa returns an error
- **THEN** the `search` Source fails in isolation without aborting the Scan, and `fallbackMode` is left unset

### Requirement: Ingesters populate the Resource snippet and leave content unset

Every ingester SHALL populate the returned Resource's `snippet` from the native text the Source's own API returns, so curation's cheap stages have real text without an extra fetch: `rssIngester` from the feed entry's description/summary, `youtubeIngester` from the video description, `redditIngester` from the post selftext, `searchIngester` from Exa's result highlights (requesting highlights in the search call), and `urlIngester` from each link's anchor text. An ingester SHALL leave `content` unset — curation fills it when it fetches a survivor.

An ingester that has already fetched a Resource's body for its own purposes MAY hand that body over with the Resource, and ingest SHALL store it and record `content_key`, `content_bytes`, `etag`, `last_modified`, and `fetched_at` on the stored row. This is the one exception to leaving `content` unset, and it exists so a body is paid for once rather than twice: without it, an ingester's fetch and curation's later fetch of the same url would each be billed, because reuse is keyed on the stored Resource row and no url-keyed fetch cache exists. Only the url ingester fetches at ingest today. An ingester that has not fetched SHALL hand over no body, and the Resource is stored exactly as before.

This does not change what else an ingester returns: it still returns Resources only (never Findings, scores, or embeddings) with the canonical URL, title, and kind it already produces, and leaves `embedding` and `embedding_model` unset.

#### Scenario: RSS ingester sets the snippet from the entry description

- **WHEN** a Source of kind `rss` is scanned and a feed entry has a description or summary
- **THEN** the returned Resource's `snippet` holds that native text and its `content` is unset

#### Scenario: YouTube ingester sets the snippet from the video description

- **WHEN** a Source of kind `youtube` is scanned
- **THEN** each returned Resource's `snippet` holds the video description and its `content` is unset

#### Scenario: Reddit ingester sets the snippet from the post selftext

- **WHEN** a Source of kind `reddit` is scanned and a post has selftext
- **THEN** the returned Resource's `snippet` holds that selftext and its `content` is unset

#### Scenario: Search ingester sets the snippet from Exa highlights

- **WHEN** a Source of kind `search` is scanned
- **THEN** `searchIngester` requests highlights from Exa and each returned Resource's `snippet` holds its result highlights, with `content` unset

#### Scenario: Url ingester sets the snippet from anchor text

- **WHEN** a Source of kind `url` is scanned and its page contains links
- **THEN** each returned link Resource's `snippet` holds that link's anchor text

#### Scenario: A missing native text leaves the snippet null, not the title

- **WHEN** a Source's entry has no native description/selftext/highlights
- **THEN** the returned Resource's `snippet` is null (the title is never copied into the snippet) and the Resource is still returned

#### Scenario: A body an ingester already fetched is stored, not refetched

- **WHEN** the url ingester fetches its page and hands the body over with the page Resource
- **THEN** ingest stores that body and records `content_key`, `content_bytes`, `etag`, `last_modified`, and `fetched_at`, and curation reuses it without a second Firecrawl call or a second charge

#### Scenario: An ingester that fetched nothing stores nothing

- **WHEN** any ingester returns a Resource without a body
- **THEN** the Resource is stored with `content_key` unset, exactly as before

### Requirement: Search ingester expands YouTube playlist results into videos

When a search result's URL is a YouTube playlist (`youtube.com/playlist?list=<id>`), `searchIngester` SHALL expand it into the playlist's member videos rather than find the playlist page as a single Resource. Expansion SHALL reuse the YouTube ingester's `playlistItems` Data API path (`YOUTUBE_API_KEY`) and its video-to-Resource mapping, so each member video becomes a `watch` Resource keyed by its canonical `https://www.youtube.com/watch?v=<id>` URL — the same key the `youtube` Source finds, so the two dedupe. Non-playlist results SHALL be unchanged (they remain `read` Resources keyed by their URL). Expansion SHALL run on every scan within the search flow, requiring no new Source kind, schema, or scheduler.

#### Scenario: A playlist result is expanded into its videos

- **WHEN** a search result's URL is `youtube.com/playlist?list=<id>` and `YOUTUBE_API_KEY` is set
- **THEN** the ingester fetches the playlist's items via `playlistItems` and finds one `watch` Resource per video (keyed by its `watch?v=` URL), and the playlist URL itself is not found as a Resource

#### Scenario: Non-playlist results are untouched

- **WHEN** a search result's URL is not a YouTube playlist URL
- **THEN** it lands as a `read` Resource keyed by its own URL, exactly as before

#### Scenario: Expanded videos dedupe against YouTube Sources

- **WHEN** an expanded playlist video resolves to the same canonical `watch?v=` URL as a video from a `youtube` Source in the same Scan
- **THEN** only one Resource is stored for that URL

#### Scenario: Missing key keeps the opaque link

- **WHEN** a search result is a playlist URL but `YOUTUBE_API_KEY` is absent
- **THEN** the playlist stays a single `read` Resource (no expansion) and the search Source does not fail

#### Scenario: One playlist's expansion failure is isolated

- **WHEN** expanding one playlist errors (private, 404, or timeout)
- **THEN** that playlist's original `read` Resource is kept and the Scan's other search results and playlist expansions are unaffected

### Requirement: The reddit ingester records the post score as engagement
The reddit ingester SHALL map each post's score from the listing response it already fetches into the Resource's `engagement`, with no additional API calls, and a re-scan SHALL refresh the stored value. Ingesters that capture no signal leave `engagement` null.

#### Scenario: A reddit post carries its score
- **WHEN** the reddit ingester ingests a post with a score
- **THEN** the stored Resource's `engagement` holds that score, and a later scan updates it

#### Scenario: Other sources stay null
- **WHEN** an rss Resource is ingested
- **THEN** its `engagement` is null and the trending sort falls back to recency for it

### Requirement: Canonical URL is a defined normal form

Every requirement that dedupes on canonical URL SHALL mean one defined normal form, applied before a Resource is stored. Canonicalizing a URL SHALL lowercase the host, leave the port alone so that only the scheme's own default is dropped and a non-default port keeps two servers apart, drop the fragment, drop exactly the query parameters that name a referrer rather than the page (any `utm_` prefix, and `fbclid`, `gclid`, `mc_cid`, `mc_eid`, `igshid`, `si`, `ref`, `ref_src`, `source`, `spm`) while sorting the parameters that remain, and strip a trailing slash from any path but the root. Canonicalizing SHALL be idempotent: canonicalizing an already-canonical URL SHALL return it unchanged. A URL that cannot be parsed SHALL be returned untouched, since a dedupe key that cannot be built is better than one that is wrong.

A path's case SHALL be folded only where the host is known to ignore it, and never otherwise. Reddit paths SHALL fold throughout. YouTube SHALL fold only its handle forms — `/c/<name>`, `/user/<name>`, `/@<handle>`, and a bare vanity segment, each optionally followed by a tab like `/videos`. Every other YouTube path carries an exact id and SHALL NOT fold: a channel id under `/channel/`, a video id under `/shorts/`, and the whole path of a `youtu.be` link are case-sensitive, and lowercasing one produces a URL that resolves to nothing. Paths SHALL be case-sensitive by default, so folding is a per-host allowance rather than a general rule.

#### Scenario: Spellings of one page collapse to a single Resource

- **WHEN** two Sources find the same page differing only in a trailing slash, a tracking parameter, a fragment, or the order of its query parameters
- **THEN** both canonicalize to the same URL and store as one Resource

#### Scenario: A YouTube handle folds case

- **WHEN** the same channel is found as `/c/TitoTheRaccoon` and as `/c/titotheraccoon`
- **THEN** both canonicalize to the same URL and store as one Resource

#### Scenario: A YouTube channel id keeps its case

- **WHEN** a Resource is found for `/channel/UCcefcZRL2oaA_uBNeo5UOWg`, a `/shorts/` video id, or a `youtu.be` link
- **THEN** the path's case survives canonicalization, so the stored URL still resolves

#### Scenario: An unparseable URL survives untouched

- **WHEN** a Source finds something that does not parse as a URL
- **THEN** it is stored as given rather than rewritten

### Requirement: A Resource that arrives without a title derives one

A search provider sometimes returns a result with an empty title, which would otherwise render as a bare hostname and read as broken. Ingestion SHALL derive a title for such a Resource from the first line of its snippet that reads like a name rather than a piece of body text — bounded in length, opening on a capital or a digit, and containing letters — after stripping any leading Markdown heading, quote, or bullet marker. When no snippet line qualifies, ingestion SHALL fall back to the URL's own last meaningful path segment, with separators read as spaces and any file extension dropped. When neither yields anything, the title SHALL remain unset rather than be filled with a fragment. A Resource that arrives with a title SHALL keep it.

#### Scenario: A titleless result takes its snippet's heading

- **WHEN** a search result arrives with an empty title and a snippet whose first qualifying line reads like a name
- **THEN** that line becomes the Resource's title

#### Scenario: Body text is not mistaken for a title

- **WHEN** a titleless result's snippet opens with a horizontal rule, a bare year, or a full paragraph
- **THEN** none of those become the title, and the URL's own path segment is used instead

#### Scenario: A title already provided is left alone

- **WHEN** a search result arrives carrying its own title
- **THEN** ingestion stores that title rather than deriving one

### Requirement: The url ingester returns the page and the links it contains

`urlIngester` SHALL read the page url from the Source's `config`, reject a url that is malformed, non-http, or internal, and return the page itself as a `read` Resource. It SHALL additionally fetch the page's body and return one Resource per outbound link that body contains, so a Source pointed at an index page contributes the material that page indexes rather than a single Resource whose worth is entirely the links it lists.

Each link Resource SHALL carry the link's anchor text as its `snippet`, so the embed-filter gate has real text to judge it on before any paid fetch is spent on it. A link with no anchor text SHALL still be returned with a null `snippet`.

Each link Resource's `kind` SHALL come from the same host-to-kind mapping the search ingester applies, so a linked video is returned as a `watch` Resource and collapses against the youtube ingester's output under the global canonical-url dedupe rather than sitting beside it as a second row for the same video.

The page Resource's `title` SHALL be left unset, as it is today, for the fallback-title rule to derive.

#### Scenario: An index page contributes the links it lists

- **WHEN** a Source of kind `url` pointing at a page containing outbound links is scanned
- **THEN** the ingester returns the page as a `read` Resource and one Resource per outbound link, each with the link's canonical url

#### Scenario: Anchor text becomes the link Resource's snippet

- **WHEN** the ingester returns a Resource for a link whose anchor text reads "A tour of Rust's async runtimes"
- **THEN** that Resource's `snippet` holds that anchor text and its `content` is unset

#### Scenario: A link with no anchor text is still returned

- **WHEN** a page contains a link carrying no anchor text
- **THEN** the Resource is returned with a null `snippet` rather than being dropped

#### Scenario: A linked video is returned as a watch Resource

- **WHEN** a page links to a YouTube video
- **THEN** the returned Resource's `kind` is `watch`, matching what the youtube ingester would return for the same url, so the two collapse to one Resource

#### Scenario: The page Resource carries no title

- **WHEN** the ingester returns the page Resource
- **THEN** its `title` is unset and the fallback-title rule derives one

### Requirement: A url Source's link finding is bounded and never recurses

Link finding SHALL be bounded so that one page cannot dominate a Scan's candidate set or its spend:

- The number of link Resources returned from a single page SHALL be capped at a defined constant. When a page carries more links than the cap, the ingester SHALL return the first ones in document order and drop the rest.
- Same-page anchors (a url differing from the page's own only by fragment) and any url that is not http or https SHALL be dropped before the ingester returns.
- Link finding SHALL be depth one. A link found this way SHALL NOT itself be fetched for its links, in this Scan or any later one.

#### Scenario: A page past the cap contributes only the cap

- **WHEN** a page carries more outbound links than the cap allows
- **THEN** the ingester returns the page Resource plus exactly the cap's worth of link Resources, in document order

#### Scenario: Fragments and non-http links are dropped

- **WHEN** a page contains a same-page anchor, a `mailto:` link, or a `javascript:` link
- **THEN** none of them is returned as a Resource

#### Scenario: Link finding never recurses

- **WHEN** a link found on a url Source's page is later scanned as a Resource
- **THEN** it is fetched and scored like any other Resource and its own links are not read for more

### Requirement: A failed page fetch degrades to the page alone

When the url Source's page cannot be fetched, the ingester SHALL return the page Resource by itself and report the Source as having run, rather than throwing and failing the Source. The page Resource still reaches curation, which fetches it on its own terms, so a fetch failure at ingest costs the Scan the links and nothing else.

#### Scenario: A fetch failure still returns the page

- **WHEN** the ingest-time fetch of a url Source's page fails or times out
- **THEN** the ingester returns the page as a single Resource, returns no link Resources, and the Source is not marked failed

#### Scenario: The page still reaches curation after a failed fetch

- **WHEN** the fetch failed but the page Resource was returned
- **THEN** curation fetches and scores that page exactly as it does for a url Source today

