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

The Scan's Budget SHALL be created before ingestion runs, and each Source's ingester cost SHALL charge into that Budget's `ingestion` bucket — zero for the ingesters that use no paid API, and the real dollars spent for the ones that do. `scans.cost` SHALL be the Budget's total, so ingestion spend is inside the same object and the same ceiling the paid curation stages read, rather than a number summed alongside them at close.

#### Scenario: Counts and cost are recorded on success

- **WHEN** a scan completes with its Sources having found Resources
- **THEN** the Scan's `found_count` equals the count of deduped Resources discovered, its `cost` equals the Budget total including the ingestion bucket, `finished_at` is set, and its status is `succeeded`

#### Scenario: Paid ingestion charges into the Budget

- **WHEN** a `search` or `x` Source's ingester returns a non-zero cost
- **THEN** that cost is charged into the Budget's `ingestion` bucket and is visible to the spend ceiling the curation stages check

#### Scenario: Keyless ingesters charge nothing

- **WHEN** an RSS, Reddit, or YouTube Source runs
- **THEN** its returned cost is zero and the ingestion bucket is unchanged by it

#### Scenario: Curation counts are left untouched

- **WHEN** ingestion finishes a scan
- **THEN** `kept_count` and `filtered_count` remain at their defaults and `ai_summary` is unset

#### Scenario: A url Source's page fetch is charged to ingestion

- **WHEN** a url Source fetches its page at ingest
- **THEN** the fetch is charged into the `ingestion` bucket at the same per-fetch cost curation charges, and it appears in the Scan's `stage_costs`

#### Scenario: A page served from stored content charges nothing

- **WHEN** a url Source's page already has stored content that is not stale
- **THEN** the ingester finds its links in that stored body, makes no Firecrawl call, and returns zero cost for that page

### Requirement: Per-Source failure isolation

A failing Source SHALL degrade only that Source's contribution. `runTopicScan` SHALL continue scanning the remaining Sources and still record the Resources they produced. A Scan SHALL be marked `failed` (with the error recorded) only when every Source failed.

#### Scenario: One Source fails, another succeeds

- **WHEN** one Source's ingester throws and another Source's ingester succeeds
- **THEN** the succeeding Source's Resources are upserted and the Scan is marked `succeeded`

#### Scenario: All Sources fail

- **WHEN** every Source's ingester throws
- **THEN** the Scan is marked `failed` and the error is recorded

### Requirement: Reddit ingester finds canonical Resources

`redditIngester` SHALL find one Resource per post, `kind` `read`, cost `0`, deduped by canonical URL within the payload, using the post's comments permalink (`https://www.reddit.com<permalink>`) as the canonical URL, with the post's title and a snippet. It SHALL require no Integration (`integration_id` may be null).

**What it fetches** SHALL be decided by the Source's `config`. A `subreddit` SHALL be required: it fetches that subreddit's listing at the configured `sort` (`hot`, `new`, `top`, or `rising`, defaulting to `hot` and falling back to `hot` for an unrecognized value), and a `query` alongside it fetches that query restricted to that subreddit instead. A `subreddit` that is missing, or that is not a valid Reddit name, SHALL fail the Source rather than be defaulted or encoded into a URL — a Reddit Source is the subreddit it names, which is why it is not a kind a new Topic can start with.

The ingester SHALL also build the site-wide search form of each URL, which no Source produces, because searching Reddit at large is how a subreddit relevant to a Topic is found in the first place. That form SHALL stay covered by the URL tests so the subreddit-discovery work has a checked seam to call.

**How it fetches** SHALL be decided by credentials. When `REDDIT_CLIENT_ID` **and** `REDDIT_CLIENT_SECRET` are set, the ingester SHALL attempt the app-only OAuth API first and, if that attempt fails, SHALL fall back to the keyless public RSS feeds on `www.reddit.com`. When either credential is absent, it SHALL attempt the feeds only. The ingester SHALL NOT read Reddit's public `.json` endpoints, which Reddit refuses to keyless callers.

The two modes do not carry the same payload, and the difference is the loss the fallback records. The OAuth listing SHALL supply the post's selftext as the snippet, its score as `engagement`, and the configured sort. The RSS feeds SHALL supply the entry's own summary text as the snippet, SHALL leave `engagement` unset, and SHALL serve the subreddit's default ordering, so the configured sort does not survive that mode. Both modes SHALL find the same canonical URL for the same post. Resources produced by the feeds SHALL set `fallbackMode` to `reddit-rss`; Resources produced by the OAuth API SHALL leave `fallbackMode` unset.

Every request on every path — the token request included — SHALL carry a descriptive `User-Agent`, because Reddit rejects generic or missing agents. One Source SHALL make at most one listing request per mode attempted per Scan.

Because a Scan runs its Sources concurrently, the ingester SHALL queue every request it makes behind the one before it, separated by a gap set per mode: the keyless feeds refuse requests that arrive closer than they allow, so their gap SHALL be the measured interval they serve, and the OAuth mode — which has far more headroom — SHALL use a short gap that only keeps a Scan's Sources from arriving together. The queue SHALL advance whether a request succeeded or was refused, so a refusal still spaces out what follows.

When every attempted mode fails, the Source SHALL fail with a reason naming what it asked for and how each mode refused it, so a Source blocked by Reddit is distinguishable from one that found nothing.

#### Scenario: OAuth is preferred when credentials are present

- **WHEN** `REDDIT_CLIENT_ID` and `REDDIT_CLIENT_SECRET` are set and a Source of kind `reddit` is scanned
- **THEN** `redditIngester` fetches through the OAuth API, finds one `read` Resource per post keyed by its comments permalink with its title, selftext snippet, and score, and leaves `fallbackMode` unset

#### Scenario: A failed OAuth attempt falls through to the feeds

- **WHEN** credentials are set but the OAuth attempt fails
- **THEN** the ingester fetches the same subreddit or search from the keyless RSS feed, finds its Resources, and sets `fallbackMode` to `reddit-rss`

#### Scenario: Keyless mode when credentials are absent

- **WHEN** `REDDIT_CLIENT_ID` or `REDDIT_CLIENT_SECRET` is missing and a Source of kind `reddit` is scanned
- **THEN** the ingester fetches the keyless RSS feed with a descriptive `User-Agent`, finds `read` Resources carrying their titles, snippets, and permalinks, and sets `fallbackMode` to `reddit-rss`

#### Scenario: The sort survives the OAuth mode and not the fallback

- **WHEN** a Source configured with a `subreddit` and a `sort` of `top` is scanned
- **THEN** the OAuth mode fetches that subreddit's `top` listing, and the RSS fallback fetches the subreddit's feed at its own default ordering

#### Scenario: The score survives the OAuth mode and not the fallback

- **WHEN** the same post is found by each mode
- **THEN** the OAuth mode sets `engagement` to the post's score and the RSS fallback leaves `engagement` unset

#### Scenario: A query searches inside the Source's subreddit

- **WHEN** a Source of kind `reddit` carries both a `subreddit` and a `query`
- **THEN** the ingester searches that subreddit for that query and finds the results as `read` Resources

#### Scenario: A Source with no subreddit fails

- **WHEN** a Source of kind `reddit` names no `subreddit`, with or without a `query`
- **THEN** the Source fails with a reason naming the missing config rather than reading some other subreddit

#### Scenario: The site-wide search form stays available for finding a subreddit

- **WHEN** a caller builds a Reddit search request that names no subreddit
- **THEN** both the OAuth and the keyless URL builders produce the site-wide search URL, so subreddit discovery can search Reddit at large

#### Scenario: Canonical URL is stable across modes

- **WHEN** the same Reddit post is found once by the OAuth path and once by the keyless path
- **THEN** both find the same canonical URL (the comments permalink), so it dedupes to a single Resource

#### Scenario: Duplicate posts within one fetch collapse

- **WHEN** a fetch returns two posts that resolve to the same comments permalink
- **THEN** only one Resource is found for that URL

#### Scenario: A Source blocked in every mode fails with its reason

- **WHEN** both the OAuth attempt and the keyless attempt are refused, as when Reddit blocks the deployment's IP range
- **THEN** the Source fails with a reason naming each attempted mode and its failure, and the rest of the Scan's Sources are unaffected

#### Scenario: Two Reddit Sources in one Scan do not fetch together

- **WHEN** a Topic has two Reddit Sources and a Scan runs them concurrently
- **THEN** their requests are queued one behind the other with the mode's gap between them, rather than arriving together and having the second refused

#### Scenario: OAuth mode when credentials are present

- **WHEN** `REDDIT_CLIENT_ID` and `REDDIT_CLIENT_SECRET` are set and a Source of kind `reddit` is scanned
- **THEN** `redditIngester` fetches the subreddit listing via the OAuth API honoring the configured sort, finds one `read` Resource per post keyed by its comments permalink, and leaves `fallbackMode` unset

#### Scenario: Keyless RSS fallback when credentials are absent

- **WHEN** `REDDIT_CLIENT_ID` or `REDDIT_CLIENT_SECRET` is missing and a Source of kind `reddit` is scanned
- **THEN** `redditIngester` fetches the public subreddit `.rss` feed with a descriptive `User-Agent`, finds `read` Resources, and sets `fallbackMode` to `reddit-rss`

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

Every ingester SHALL populate the found Resource's `snippet` from the native text the Source's own API returns, so curation's cheap stages have real text without an extra fetch: `rssIngester` from the feed entry's description/summary, `youtubeIngester` from the video description, `redditIngester` from the post selftext, `podcastIngester` from the episode's show notes, and `searchIngester` from Exa's result highlights (requesting highlights in the search call). An ingester SHALL leave `content` unset — curation fills it when it fetches a survivor. This does not change what else an ingester finds: it still finds Resources only (never Findings, scores, or embeddings) with the canonical URL, title, and kind it already produces, and leaves `embedding` and `embedding_model` unset.

#### Scenario: RSS ingester sets the snippet from the entry description

- **WHEN** a Source of kind `rss` is scanned and a feed entry has a description or summary
- **THEN** the found Resource's `snippet` holds that native text and its `content` is unset

#### Scenario: YouTube ingester sets the snippet from the video description

- **WHEN** a Source of kind `youtube` is scanned
- **THEN** each found Resource's `snippet` holds the video description and its `content` is unset

#### Scenario: Reddit ingester sets the snippet from the post selftext

- **WHEN** a Source of kind `reddit` is scanned and a post has selftext
- **THEN** the found Resource's `snippet` holds that selftext and its `content` is unset

#### Scenario: Podcast ingester sets the snippet from the episode show notes

- **WHEN** a Source of kind `podcast` is scanned and an episode entry has show notes
- **THEN** the found Resource's `snippet` holds those show notes and its `content` is unset

#### Scenario: Search ingester sets the snippet from Exa highlights

- **WHEN** a Source of kind `search` is scanned
- **THEN** `searchIngester` requests highlights from Exa and each found Resource's `snippet` holds its result highlights, with `content` unset

#### Scenario: A missing native text leaves the snippet null, not the title

- **WHEN** a Source's entry has no native description/selftext/highlights
- **THEN** the found Resource's `snippet` is null (the title is never copied into the snippet) and the Resource is still found

#### Scenario: Url ingester sets the snippet from anchor text

- **WHEN** a Source of kind `url` is scanned and its page contains links
- **THEN** each returned link Resource's `snippet` holds that link's anchor text

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

A host that has been renamed SHALL fold to its current name, so the two spellings of one page do not store twice: `twitter.com` and its `www.` and `mobile.` forms SHALL canonicalize to `x.com`. Folding SHALL be limited to hosts known to serve the same page under both names, never applied as a general rule.

A path's case SHALL be folded only where the host is known to ignore it, and never otherwise. Reddit paths SHALL fold throughout. X paths SHALL fold throughout, since a handle ignores case and a status id is digits. YouTube SHALL fold only its handle forms — `/c/<name>`, `/user/<name>`, `/@<handle>`, and a bare vanity segment, each optionally followed by a tab like `/videos`. Every other YouTube path carries an exact id and SHALL NOT fold: a channel id under `/channel/`, a video id under `/shorts/`, and the whole path of a `youtu.be` link are case-sensitive, and lowercasing one produces a URL that resolves to nothing. Paths SHALL be case-sensitive by default, so folding is a per-host allowance rather than a general rule.

#### Scenario: Spellings of one page collapse to a single Resource

- **WHEN** two Sources find the same page differing only in a trailing slash, a tracking parameter, a fragment, or the order of its query parameters
- **THEN** both canonicalize to the same URL and store as one Resource

#### Scenario: A tweet found twice under both host names collapses

- **WHEN** the search Source finds `https://twitter.com/Sama/status/123` and an X Source finds `https://x.com/sama/status/123`
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

### Requirement: Google News is an rss Source built from a feed url helper

A Google News Source SHALL be a Source of the existing kind `rss` whose `config.url` is a Google News RSS search feed. One shared helper SHALL build that url from a query — `https://news.google.com/rss/search?q=<url-encoded query>&hl=en-US&gl=US&ceid=US:en` — trimming the query, collapsing its whitespace, and returning no url for a blank one. The helper SHALL be the single place a Google News feed url is built, so a later change that suggests news sources for a Topic stages its Sources through the same builder.

Google News SHALL introduce no new source kind, no new ingester, and no schema change: `rssIngester` SHALL handle it exactly as it handles any other feed, keylessly, at cost `0`, emitting one `read` Resource per headline with the entry's title and its native description as the snippet, deduped by canonical URL.

#### Scenario: The feed url searches the query it is given

- **WHEN** the url helper is given a query
- **THEN** it returns `https://news.google.com/rss/search?q=<url-encoded query>&hl=en-US&gl=US&ceid=US:en`, with the query trimmed, its whitespace collapsed, and its reserved characters encoded

#### Scenario: A blank query builds no feed url

- **WHEN** the url helper is given an empty or whitespace-only query
- **THEN** it returns no url and no Source is built

#### Scenario: The rss ingester handles the feed unchanged

- **WHEN** a Scan reaches a Source of kind `rss` whose `config.url` is a Google News feed url
- **THEN** `rssIngester` fetches and parses it like any other feed, emitting `read` Resources at cost `0` with `fallbackMode` unset

#### Scenario: An empty or failing Google News feed degrades only itself

- **WHEN** the Google News feed returns no entries, or the request fails
- **THEN** the Source contributes no Resources and the Scan still completes on what its other Sources found

### Requirement: A Google News Source follows one publisher

A Google News Source SHALL be scoped to a single publisher, named by that publisher's domain and applied as the feed query's `site:` filter, so the Source returns links to that publisher's articles. The domain SHALL be read out of whatever form it was given in — a bare domain, a `www.` prefix, or a pasted article url — and a value holding no domain SHALL build no Source rather than a feed that finds nothing.

The publisher SHALL be readable back out of a stored feed url, and a Source's display summary SHALL be that publisher rather than `news.google.com`, so two Google News Sources are told apart wherever Sources are listed. A feed url that names no publisher, and any other `rss` Source, SHALL keep summarizing as its feed host.

#### Scenario: A publisher domain becomes a publisher feed

- **WHEN** a Google News Source is added for `techcrunch.com`
- **THEN** its `config.url` is the Google News feed for the query `site:techcrunch.com`

#### Scenario: A pasted article url still names its publisher

- **WHEN** a Google News Source is added for `https://www.TechCrunch.com/2026/01/02/some-article`
- **THEN** it builds the same feed as the bare domain `techcrunch.com`

#### Scenario: A value naming no domain builds nothing

- **WHEN** a Google News Source is added for a value with no domain in it, such as a publisher's name
- **THEN** no Source is built and the rest of the save is unaffected

#### Scenario: A stored Google News Source is summarized by its publisher

- **WHEN** a stored `rss` Source's url is a Google News publisher feed
- **THEN** its summary is that publisher's domain, while any other `rss` Source still summarizes as its feed host

### Requirement: Every Source that hit a problem is recorded on the Scan

`runTopicScan` SHALL record on the completed Scan every Source that did not deliver normally, in `scans.problem_sources`. Each entry SHALL carry the `sourceId` and a status discriminant: a Source that ran a keyless fallback records `fallback` with the `fallbackMode` it ran, and a Source whose ingester failed records `failed` with the reason it failed, taken from the error and bounded in length. Running a fallback SHALL NOT mark the Scan `failed`: a Scan whose Sources all succeeded — even if some fell back — SHALL be `succeeded`, and the existing rule that a Scan fails only when every Source failed SHALL be unchanged. `problem_sources` SHALL be empty when every Source ran its primary path and succeeded.

#### Scenario: A Source that fell back is recorded and the Scan still succeeds

- **WHEN** a Source's ingester succeeds but reports a `fallbackMode`
- **THEN** the Scan's `problem_sources` contains that Source with status `fallback` and its mode, and the Scan's status is `succeeded`

#### Scenario: A Source that failed is recorded with its reason

- **WHEN** a Source's ingester throws while another Source succeeds
- **THEN** the Scan's `problem_sources` contains the failing Source with status `failed` and the reason it failed, and the Scan's status is `succeeded`

#### Scenario: A clean Scan leaves the trace empty

- **WHEN** every Source's ingester succeeds on its primary path
- **THEN** the Scan's `problem_sources` is empty

#### Scenario: Only Sources that hit a problem are recorded

- **WHEN** one Source runs a keyed path cleanly and another falls back
- **THEN** the Scan's `problem_sources` contains only the Source that fell back

### Requirement: The default Source set is a registry

The source kinds SHALL be declared in one shared registry that the ingestion side and the ui both read, keyed by source kind, carrying each kind's display label and its config-value placeholder. The registry SHALL also declare the preselected set as an ordered list of kinds, so that the order the default group lists them in is part of the declaration rather than left to each surface. A new Topic SHALL start with every preselected kind switched on, and the preselected set SHALL be `search` alone. Adding a kind to the default set SHALL be an edit to the registry alone, never to the modal, the topic page, or the source picker.

A preselected Source SHALL be created with no config, so a kind SHALL be preselected only when its ingester runs against a Source that carries none. `reddit` SHALL NOT be preselected: it reads the subreddit the Source names and fails without one, so it is a custom source the owner adds.

A kind SHALL be offered by the custom source picker when it takes a config value. `search` takes none and is therefore only ever a default row, and `reddit` takes one and is therefore only ever a custom row.

#### Scenario: A new Topic starts with the preselected Sources on

- **WHEN** the creation modal opens for a new Topic
- **THEN** every kind the registry preselects is switched on, and saving creates one configless Source per preselected kind

#### Scenario: An owner can remove a preselected Source

- **WHEN** the owner turns off a preselected Source before saving, leaving at least one Source
- **THEN** the Topic is created without it

#### Scenario: The registry is the single place the default set is declared

- **WHEN** the registry's preselected list changes
- **THEN** the creation modal, the topic page's Sources section, and the source picker all follow it with no further edit

#### Scenario: Reddit is added by the owner rather than preselected

- **WHEN** the creation modal opens for a new Topic
- **THEN** the default group shows the web scout alone, and `reddit` appears only in the add-a-source picker, where adding it requires naming a subreddit

### Requirement: Bluesky ingester finds the articles an account links to

`blueskyIngester` SHALL handle Sources of kind `bluesky`. Each Source SHALL name one account in `config.handle`, and a Source without one SHALL fail rather than fetch anything, since a Bluesky Source with no account named has nothing to read. A handle typed with a leading `@` SHALL name the same account as one typed without it.

The ingester SHALL read that account's recent posts through `app.bsky.feed.getAuthorFeed` on the public appview (`public.api.bsky.app`) with no credentials, and SHALL find one Resource per **article a post links to** rather than per post. A post is mostly a pointer, so the Resource is the page it points at: its URL is the link's own URL, its `title` and `snippet` come from the link card's title and description, and its `kind` follows the link's host, so a video an account links to lands as `watch` rather than as an article. Each Resource's `engagement` SHALL be the sharing post's like count, since the linked page carries no engagement of its own here. A post carrying no link SHALL be skipped, as SHALL a link back into Bluesky itself, which is a quote or a profile rather than something to read.

Resources SHALL be deduped by URL within the run. The ingester SHALL charge cost `0`, require no Integration (`integration_id` may be null), and leave `content`, `embedding`, `embedding_model`, and `fallbackMode` unset.

#### Scenario: An account's linked articles become Resources

- **WHEN** a Source of kind `bluesky` naming an account is scanned
- **THEN** `blueskyIngester` reads that account's posts from the public appview without credentials and finds one Resource per linked article, each carrying the link card's title and description

#### Scenario: A Source naming no account fails in isolation

- **WHEN** a Source of kind `bluesky` has no `config.handle`
- **THEN** the ingester throws, that Source fails alone, and the Scan continues with its remaining Sources

#### Scenario: The linked page's kind follows its host

- **WHEN** an account links to a video rather than an article
- **THEN** the found Resource's `kind` is `watch`, the same kind the video's own Source would find, so the two dedupe

#### Scenario: The sharing post's likes stand as engagement

- **WHEN** `blueskyIngester` finds a Resource for a linked article
- **THEN** its `engagement` holds the like count of the post that shared it, and its `content` is unset

#### Scenario: Posts with nothing to read are skipped

- **WHEN** a post carries no link, or links back into Bluesky itself
- **THEN** no Resource is found for it

#### Scenario: An account posting one article twice yields one Resource

- **WHEN** two posts in the fetched feed link to the same URL
- **THEN** only one Resource is found, keeping the first sighting

### Requirement: Reading an account needs no credential

Reading a named account SHALL require no App Password, no session, and no Integration. Suggesting an account SHALL go through the same public AppView call, so no part of Bluesky support depends on an operator credential.

#### Scenario: An account Source runs with no credential configured

- **WHEN** a `bluesky` Source is scanned
- **THEN** it reads the account from the public AppView and returns its Resources, with no credential read from the environment

### Requirement: Bluesky calls stay inside the rate limit and back off on 429

`blueskyIngester` SHALL bound its own traffic — one call per Source, for a capped number of posts — with the caps stated as constants at the top of the file rather than at the call sites, and Bluesky's declared points-per-hour limit recorded beside them as the ceiling they answer to. On a `429` response it SHALL wait the interval the response itself names (its rate-limit reset time, else its retry-after value, else a fixed default), capped at a maximum wait so a hostile header cannot stall a Scan, and retry once. A second `429` SHALL fail that Source in isolation.

#### Scenario: A rate-limited call waits and retries

- **WHEN** a Bluesky call returns `429` with a reset or retry-after header
- **THEN** the ingester waits the interval that header names, bounded by the maximum wait, and retries the call once

#### Scenario: A persistent rate limit fails one Source only

- **WHEN** the retry after a `429` is also rate limited
- **THEN** the `bluesky` Source fails and the Scan continues with its remaining Sources

### Requirement: A link's Resource kind is shared, not per-ingester

Reading a Resource's `kind` from its URL's host SHALL live with the other URL normalization every ingester's output passes through, so an ingester that needs it imports it from there rather than from another ingester. `searchIngester` and `blueskyIngester` SHALL both type their links through it, so the same link found by either lands as the same kind.

#### Scenario: Two ingesters type one link the same way

- **WHEN** a search result and a Bluesky link both point at the same video host
- **THEN** both find `watch`, so the two dedupe to a single Resource

### Requirement: X ingester reads one handle's recent tweets

`xIngester` SHALL handle Sources of kind `x`. An `x` Source SHALL name the account it follows in `config.handle`; the handle is required, and a Source without a valid one SHALL fail in isolation rather than fall back to reading something else. A handle SHALL be accepted with or without a leading `@`, SHALL be trimmed, and SHALL be refused unless it is one to fifteen letters, digits, or underscores — the form X itself resolves — since it is placed directly into a search operator.

The ingester SHALL issue exactly one advanced-search request per Source per Scan, for `from:<handle>`, using `TWITTERAPI_IO_API_KEY` in the `x-api-key` header. It SHALL require no Integration (`integration_id` is null) and no per-user OAuth: one operator-level key serves every Source. It SHALL find one Resource per tweet, `kind` `read`, deduped by canonical URL, and SHALL leave `embedding` and `embedding_model` unset for the curation pipeline. It SHALL leave `fallbackMode` unset — X has no keyless fallback.

The issued query SHALL carry `-filter:retweets` and a `since_time:` bound of the last seven days, appended by the ingester, since a retweet duplicates a tweet the account's own timeline already returns and an unbounded window spends reads on stale posts.

#### Scenario: A handle's recent tweets become Resources

- **WHEN** a Source of kind `x` whose `config.handle` names an account is scanned
- **THEN** `xIngester` issues one `from:<handle>` request and finds one `read` Resource per tweet it returned

#### Scenario: A handle is taken with or without its @

- **WHEN** a Source's `config.handle` is ` @Karpathy `
- **THEN** the ingester reads the account `Karpathy`

#### Scenario: A Source without a usable handle fails in isolation

- **WHEN** a Source of kind `x` has no `config.handle`, or one X would not resolve — empty, over fifteen characters, or carrying spaces or query operators
- **THEN** that Source fails without aborting the Scan, and the Scan still records what its other Sources found

#### Scenario: Retweets and stale tweets are excluded at the query

- **WHEN** `xIngester` issues its request
- **THEN** the issued query carries `-filter:retweets` and a `since_time:` bound of the last seven days

#### Scenario: An account with nothing recent yields no Resources without failing

- **WHEN** the configured handle has posted nothing inside the recency window
- **THEN** the ingester finds zero Resources and does not fail the Source

#### Scenario: Missing key or provider error degrades only this Source

- **WHEN** `TWITTERAPI_IO_API_KEY` is absent or the advanced-search request errors
- **THEN** the `x` Source fails in isolation without aborting the Scan, and `fallbackMode` is left unset

#### Scenario: A rate-limited request is retried once

- **WHEN** the provider answers with 429, which its free tier returns for more than one request every five seconds
- **THEN** the request pauses and is issued once more, and no retry is spent on any other failure

### Requirement: X accounts are suggestable alongside the other Source kinds

Source suggestion SHALL propose `x` Sources by handle, the way it proposes a subreddit or a channel. Each proposal SHALL be confirmed before the user sees it, through the provider's own account lookup rather than by reading the account's tweets, so an account that posts rarely is not mistaken for one that does not exist. The lookup answers with a success status for a missing account, so the response body SHALL decide, never the HTTP status.

A confirmed account MUST exist **and** have posted at least once: a handle a model invented often lands on a real but dormant account someone registered and abandoned, which would confirm and then return nothing on every Scan. A refused request — a rate limit or a server error — SHALL be treated as the provider declining to answer, so the suggestion is kept rather than dropped, matching how a throttled subreddit is treated.

Two `x` proposals SHALL dedupe on the handle alone, ignoring case and any leading `@`, so a Topic already following an account is never offered it again.

#### Scenario: A suggested handle that exists and posts is kept

- **WHEN** suggestion proposes an `x` Source whose handle names a real account that has posted
- **THEN** the account is confirmed by lookup and the suggestion reaches the editor

#### Scenario: An invented handle is dropped

- **WHEN** suggestion proposes a handle no account holds
- **THEN** the lookup's body reports no such account and the suggestion is dropped

#### Scenario: A real but dormant account is dropped

- **WHEN** suggestion proposes a handle held by a real account that has never posted
- **THEN** the suggestion is dropped, since ingesting it could never produce a Resource

#### Scenario: A rate-limited lookup keeps the suggestion

- **WHEN** the provider answers a lookup with 429 or a server error
- **THEN** the suggestion is kept rather than dropped, since the provider declined to answer rather than denying the account

#### Scenario: One account is one suggestion however it was written

- **WHEN** a Topic already follows `@Sama` and suggestion proposes `sama`
- **THEN** the proposal is recognized as one the Topic already holds and is not offered

### Requirement: Ingesting an X Source generates no queries

An `x` Source already names the account it follows, so ingesting it SHALL issue only the request for that handle. It SHALL NOT call a model to decide what to search for: doing so would spend a model call and extra reads to rediscover what the Source's own config states. Choosing which account to follow belongs to source suggestion, which reads the Topic's own words and costs no reads at all.

#### Scenario: Ingest issues one request and no model call

- **WHEN** an `x` Source is ingested
- **THEN** no query-generation model call is made, and the only request issued is the one for its handle

### Requirement: A tweet's canonical URL, title, snippet, and engagement

`xIngester` SHALL build each Resource's canonical URL as `https://x.com/<userName>/status/<id>` from the response's own author handle and tweet id rather than from the URL the provider echoes back, so the dedupe key has one shape whatever the provider returns. It SHALL set the Resource's `snippet` to the tweet's text and leave `content` unset. It SHALL set the Resource's `title` to `@<userName> on X` rather than leaving it for the derive-a-title rule, whose URL fallback would otherwise yield a bare numeric status id for a tweet whose text does not read like a name. It SHALL map the tweet's like count into `engagement`, from the same response, with no additional request.

X rewrites every URL a tweet contains into a `t.co` shortener, which names nothing on its own. Those links SHALL be stripped from the snippet, and a tweet whose text was only such links SHALL carry no snippet rather than a bare shortener. This matters more here than elsewhere because review never fetches a tweet, so the snippet is the only text scoring will ever see.

#### Scenario: The canonical URL is built from the handle and the id

- **WHEN** `xIngester` finds a Resource for a tweet
- **THEN** its url is `https://x.com/<userName>/status/<id>` built from the response fields, not the provider's echoed url

#### Scenario: The tweet text is the snippet and the handle names the Resource

- **WHEN** `xIngester` finds a Resource for a tweet
- **THEN** its `snippet` holds the tweet's text, its `title` is `@<userName> on X`, and its `content` is unset

#### Scenario: A tweet carries its like count as engagement

- **WHEN** `xIngester` finds a Resource for a tweet with a like count
- **THEN** the stored Resource's `engagement` holds that count, and a later scan refreshes it

#### Scenario: A shortened link is not mistaken for what the tweet said

- **WHEN** a tweet's text is `worth reading https://t.co/8B2G4GhOqU`
- **THEN** the found Resource's `snippet` is `worth reading`

#### Scenario: A tweet that was only a link carries no snippet

- **WHEN** a tweet's text is nothing but one or more `t.co` links
- **THEN** the found Resource's `snippet` is null rather than a bare shortener url

### Requirement: One X request per Source bounds what a Scan reads

One `x` Source SHALL read at most one page of tweets in one Scan. The bound SHALL be structural rather than a counter checked against the Budget: the ingester issues one request and SHALL NOT follow the provider's pagination cursor, so at the provider's twenty-per-response ceiling a Source reads at most twenty tweets, about $0.003. Because the Scan's Budget is charged once after every Source returns, a Source cannot consult the Budget mid-run, so the bound MUST hold without one. A Topic that wants more X coverage adds more handles, each individually bounded and individually visible in the editor.

#### Scenario: A prolific account cannot run up the bill

- **WHEN** the configured handle has posted hundreds of times inside the recency window
- **THEN** the ingester issues one request, follows no cursor, and finds at most that response's tweets

#### Scenario: More coverage is more handles, each bounded

- **WHEN** a Topic holds three `x` Sources
- **THEN** each issues its own single request and each is bounded on its own

### Requirement: The X ingester returns its real cost

`xIngester` SHALL return the dollars it spent, never zero. The cost SHALL be the provider's per-tweet rate applied to the tweets each request returned, floored at the provider's per-request minimum so a request that returns nothing still reports what it cost. The rate SHALL live as a named constant alongside the other best-effort rates. Like every other rate in the Budget, this is an estimate for the ceiling and the per-stage breakdown; the provider's own metering is authoritative.

#### Scenario: A completed X read reports what it spent

- **WHEN** `xIngester` reads a handle whose request returned tweets
- **THEN** it returns a `cost` equal to the per-tweet rate applied to those tweets, not `0`, and that cost is charged into the Scan Budget's `ingestion` bucket

#### Scenario: An empty response still costs the per-request minimum

- **WHEN** a request returns zero tweets
- **THEN** it still contributes the provider's per-request minimum to the returned cost

### Requirement: The default Source set is a shared registry

The Source kinds preselected on a new Topic SHALL be one shared list that both the topic editor and any other reader import, rather than a kind named inline where a new Topic is seeded. Its sole member SHALL be `search`. A Source kind belongs in the set only when it needs no configuration and is worth charging every Topic for; `x` names one account and therefore SHALL NOT be a member. Creating a Topic without touching the Sources field SHALL create one Source per member, and adding a future default Source SHALL be an entry in that list plus its display copy, requiring no change to how a Topic is seeded or how the default group renders.

A Source kind SHALL belong in the registry only when its ingester needs no configuration, working from the Topic's own context. A kind that names a particular thing to read — a feed, a subreddit, a channel, a show — SHALL be a custom Source the reader adds, since it is a choice about that Topic rather than a sensible default for every Topic.

#### Scenario: A new Topic is seeded from the registry

- **WHEN** a Topic is created from the editor's defaults
- **THEN** it holds one Source per registry member and no `x` Source, and no Source kind is named inline at the seeding site

#### Scenario: The default group renders from the registry

- **WHEN** the editor renders the Sources field's default group
- **THEN** it renders one row per registry member with that member's own display copy

#### Scenario: A new Topic starts with every registered default Source

- **WHEN** a Topic is created from the editor without the reader changing its Sources
- **THEN** it is created with one Source per registered default kind, and with no Source of a kind that is not registered

#### Scenario: A configured kind is not a default

- **WHEN** a Source kind requires a value naming what to read, such as `podcast`
- **THEN** it is absent from the registry and is offered only in the editor's custom add picker

#### Scenario: A default Source can be turned off before the first Scan

- **WHEN** the reader removes a default Source in the create modal before saving
- **THEN** the Topic is created without that Source, and its first Scan runs on the Sources that remain

#### Scenario: The registry is the only place a default kind is named

- **WHEN** a Source kind is added to or removed from the registry
- **THEN** the editor's default group, the topic page's Sources section, and what a new Topic is created with all follow, with no other file naming that kind

### Requirement: Review skips the content fetch for an X Resource

The fetch stage SHALL treat an `x.com` Resource's snippet as its content and SHALL NOT spend a paid fetch on it. A tweet's text is the whole artifact, so a fetch adds nothing when it succeeds, and x.com refuses scraping, so it would reliably fail and fall back to the snippet after being billed. The skip SHALL count as no fetch credit and SHALL NOT mark the Resource or the Scan as failed.

#### Scenario: An X survivor is scored from its snippet without a fetch

- **WHEN** an `x.com` Resource survives filtering and reaches the fetch stage
- **THEN** its snippet is used as the scoring content, no paid fetch is issued, and no fetch cost is charged

#### Scenario: Other hosts are unaffected

- **WHEN** a survivor on any other host reaches the fetch stage
- **THEN** it is reused, revalidated, or fetched exactly as before

### Requirement: Podcast ingester finds listen Resources from a named show's feed

`podcastIngester` SHALL handle Sources of kind `podcast`. A `podcast` Source SHALL name one show by its podcast id in `config.podcastId`; it is a custom Source a reader adds, never a default one. The ingester SHALL resolve that id through iTunes lookup to the show's `feedUrl`, fetch that feed through the shared feed parser, and find one Resource per episode with `kind` `listen`, its canonical URL, and its title. It SHALL take only a bounded number of the show's most recent episodes, since a podcast archive runs to hundreds of entries and every entry would be embedded by the relevance gate. It SHALL require no Integration and no API key: iTunes is keyless, so the ingester SHALL return cost `0` and SHALL leave `fallbackMode` unset, since it has no keyed path to degrade from.

A Source with no `config.podcastId`, an id iTunes does not know, or a show that publishes no feed SHALL fail that Source alone with a message naming the id, so the Scan report shows which Source is misconfigured rather than reporting that it found nothing. An unknown id SHALL be recognized by iTunes's empty result rather than by a response status, since iTunes answers an unknown id with a success and no results.

#### Scenario: A named show's episodes are ingested

- **WHEN** a Source of kind `podcast` whose `config.podcastId` names a show in iTunes is scanned
- **THEN** `podcastIngester` resolves that id to the show's feed and finds one `listen` Resource per recent episode, each with its canonical URL and title

#### Scenario: The ingester is keyless and free

- **WHEN** a `podcast` Source completes a scan
- **THEN** its returned cost is `0`, its `fallbackMode` is unset, and its `integration_id` may be null

#### Scenario: A long-running show contributes only its recent episodes

- **WHEN** the named show's feed lists hundreds of episodes
- **THEN** only its most recent episodes up to the cap are found, so the Scan does not embed the show's back catalogue

#### Scenario: A missing id fails only this Source

- **WHEN** a `podcast` Source carries no `config.podcastId`
- **THEN** it fails in isolation naming the Source, without aborting the Scan

#### Scenario: An unknown id is told apart from a working one

- **WHEN** a `podcast` Source names an id iTunes returns no results for, or names a show that publishes no feed
- **THEN** the Source fails in isolation with a message naming the id, and the Scan still records what the other Sources found

### Requirement: Podcast shows are searchable by name

The system SHALL expose a search over iTunes by name, returning for each matching show the podcast id a Source stores, the show's name, its author, and its feed URL, bounded to a small number of results. It SHALL share its request and response handling with the id lookup the ingester uses, so both read one shape. It SHALL require no Integration and no API key, and SHALL cost nothing.

This search exists so a show can be found by the name a reader or a model knows it by, rather than by the podcast id a `podcast` Source stores. The source-suggestion flow calls it to turn a proposed show name into that id. No ingester calls it: a `podcast` Source works from an id it was already given.

#### Scenario: A search returns storable shows

- **WHEN** iTunes is searched by a show name
- **THEN** each result carries the podcast id, name, author, and feed URL of a matching show, capped at the result limit

#### Scenario: An entry with nothing to store or show is skipped

- **WHEN** an iTunes entry carries no id, or no name
- **THEN** it is left out of the results rather than returned partly filled

### Requirement: A Source stored by an opaque id keeps a display name

A Source whose config stores an opaque id — a podcast's iTunes id, a YouTube channel or playlist id — SHALL also keep the name the thing is called, so the editor and the topic page never show a bare id. The name SHALL be filled wherever it is already in hand without an extra request: at save, from the id lookup or from the suggestion that resolved it, and on every scan, written back from what the ingester's own fetch names — the show a lookup returns, a playlist response's channel title, an Atom feed's own title — so a renamed show or channel updates itself. A name that cannot be resolved SHALL leave the id showing rather than fail the save or the Source, and the summary SHALL prefer the stored name over the id whenever one exists.

#### Scenario: A saved podcast reads as its show name

- **WHEN** a podcast Source is saved, by hand or from a suggestion
- **THEN** its config carries the show's name — looked up at save when the suggestion did not already carry it — and the Sources list shows the name, not the id

#### Scenario: A scan names a Source that has no name yet

- **WHEN** a podcast or youtube Source with no stored name is scanned
- **THEN** the ingester writes the name its own fetch returned onto the Source's config

#### Scenario: A renamed channel updates itself

- **WHEN** a scanned Source's stored name no longer matches what its fetch names
- **THEN** the config is updated to the current name

#### Scenario: An unresolvable name never breaks anything

- **WHEN** the name lookup fails or the fetch names nothing
- **THEN** the save and the Source succeed, and the summary falls back to the id

### Requirement: The podcast ingester captures a feed entry's transcript URL

The feed parser SHALL read a feed entry's `<podcast:transcript>` element and store its `url` attribute on the found Resource's `transcript_url`, preferring a plain-text or WebVTT transcript when an entry lists several and taking the first listed otherwise. An entry with no `<podcast:transcript>` SHALL leave `transcript_url` null. Capturing the URL SHALL NOT fetch it: the transcript is fetched later, in curation's fetch stage, and only for the episodes that survive the relevance gate.

#### Scenario: A transcript URL is captured

- **WHEN** a feed entry carries a `<podcast:transcript>` element with a `url` attribute
- **THEN** the found Resource's `transcript_url` holds that URL and the transcript itself is not fetched during ingestion

#### Scenario: A plain-text or WebVTT transcript wins

- **WHEN** a feed entry lists several `<podcast:transcript>` elements of different types
- **THEN** the plain-text or WebVTT one is captured in preference to the others

#### Scenario: No transcript leaves the field null

- **WHEN** a feed entry carries no `<podcast:transcript>` element
- **THEN** the found Resource's `transcript_url` is null and the Resource is still found

### Requirement: A feed entry that names no address of its own is identified by what it encloses

A feed entry's canonical URL SHALL be its own `link`, then an absolute `guid`, then the URL of what it encloses. A `link` equal to the feed's own channel link SHALL be read as naming the show rather than the entry, since podcast feeds commonly stamp the show's link on every episode, and SHALL fall through to the address the entry named for itself. An entry whose link is the channel link and which names no address of its own SHALL keep that link rather than be dropped, so the rule never loses an entry.

#### Scenario: A show's repeated link does not collapse its episodes

- **WHEN** a feed stamps its own channel link on every episode and each episode encloses a distinct audio file
- **THEN** each episode is keyed by its enclosure URL and one Resource is found per episode

#### Scenario: A per-entry link is preferred

- **WHEN** a feed entry carries a link of its own that differs from the channel link
- **THEN** that link is the Resource's canonical URL, unchanged from how every other feed Source resolves it

#### Scenario: An entry naming nothing else keeps the channel link

- **WHEN** an entry's link is the channel link and it names no absolute guid and encloses nothing
- **THEN** the channel link is kept as its URL and the entry is still found

