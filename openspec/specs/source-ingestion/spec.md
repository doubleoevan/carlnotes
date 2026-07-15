# source-ingestion Specification

## Purpose
TBD - created by archiving change add-source-ingestion. Update Purpose after archive.
## Requirements
### Requirement: Shared adapter interface

The system SHALL define a single `SourceAdapter` interface that every source kind implements: given a Source, it returns the Resources it emitted, the cost it incurred, and OPTIONALLY the fallback mode it ran in. Adapters SHALL emit Resources only — never Findings, scores, or embeddings — and SHALL leave `embedding` and `embedding_model` unset so the curation pipeline fills them later. An adapter SHALL set `fallbackMode` only when it ran a keyless fallback path, and SHALL leave it unset when it ran its keyed path or has no fallback.

#### Scenario: Adapter returns Resources and cost

- **WHEN** an adapter runs against a Source
- **THEN** it returns a list of Resources and a numeric cost, and produces no Findings

#### Scenario: Adapter leaves embedding unset

- **WHEN** an adapter emits a Resource
- **THEN** the Resource has no `embedding` and no `embedding_model` set

#### Scenario: Adapter reports its fallback mode when it degrades

- **WHEN** an adapter runs its keyless fallback path
- **THEN** it sets `fallbackMode` to a value identifying that path

#### Scenario: Keyed or modeless adapter omits the fallback mode

- **WHEN** an adapter runs its keyed path, or has no fallback (such as RSS)
- **THEN** `fallbackMode` is unset

### Requirement: Kind-dispatched adapter registry

`runTopicScan` SHALL dispatch each Source to the adapter registered for its `kind`. A Source whose `kind` has no registered adapter SHALL be skipped without aborting the Scan.

#### Scenario: RSS Source is dispatched to the RSS adapter

- **WHEN** a Source of kind `rss` is scanned
- **THEN** it is handled by `rssAdapter`

#### Scenario: Unregistered kind is skipped

- **WHEN** a Source whose `kind` has no registered adapter is scanned
- **THEN** that Source is skipped and the Scan continues with the remaining Sources

### Requirement: RSS adapter emits canonical Resources

`rssAdapter` SHALL fetch the feed URL from the Source's `config`, parse RSS or Atom, and emit one Resource per entry with a canonical URL, a title, `kind` `read`, and cost `0`. It SHALL require no Integration (keyless). Entries sharing a canonical URL within one feed SHALL collapse to a single Resource.

#### Scenario: Feed entries become Resources

- **WHEN** a Source of kind `rss` with a valid feed URL is scanned
- **THEN** `rssAdapter` emits one Resource per feed entry, each with its canonical URL, its title, and `kind` `read`

#### Scenario: Keyless operation

- **WHEN** the RSS Source has no `integration_id`
- **THEN** the adapter still runs and emits Resources

#### Scenario: Duplicate entries within a feed collapse

- **WHEN** a feed lists two entries that resolve to the same canonical URL
- **THEN** only one Resource is emitted for that URL

### Requirement: Global Resource dedupe on canonical URL

Upserting emitted Resources SHALL dedupe globally on canonical URL. Re-scanning a Source whose entries already exist as Resources SHALL NOT create duplicate rows and SHALL NOT overwrite the existing Resource (its later-filled `embedding` is preserved).

#### Scenario: Existing URL is not duplicated

- **WHEN** a scan emits a Resource whose canonical URL already exists in `resources`
- **THEN** no duplicate row is created and the existing row is left unchanged

#### Scenario: New URL is inserted

- **WHEN** a scan emits a Resource whose canonical URL is not yet stored
- **THEN** a new `resources` row is inserted

### Requirement: Scan records found count and cost

`runTopicScan` SHALL create a Scan in status `running`, and on completion record `found_count` (the number of deduped Resources discovered across all Sources) and `cost` (the sum of the Sources' adapter costs), set `finished_at`, and mark the Scan `succeeded`. Ingestion SHALL NOT set `kept_count`, `filtered_count`, or `ai_summary` — those belong to curation.

#### Scenario: Counts and cost are recorded on success

- **WHEN** a scan completes with its Sources having emitted Resources
- **THEN** the Scan's `found_count` equals the count of deduped Resources discovered, its `cost` equals the summed adapter cost, `finished_at` is set, and its status is `succeeded`

#### Scenario: Curation counts are left untouched

- **WHEN** ingestion finishes a scan
- **THEN** `kept_count` and `filtered_count` remain at their defaults and `ai_summary` is unset

### Requirement: Per-Source failure isolation

A failing Source SHALL degrade only that Source's contribution. `runTopicScan` SHALL continue scanning the remaining Sources and still record the Resources they produced. A Scan SHALL be marked `failed` (with the error recorded) only when every Source failed.

#### Scenario: One Source fails, another succeeds

- **WHEN** one Source's adapter throws and another Source's adapter succeeds
- **THEN** the succeeding Source's Resources are upserted and the Scan is marked `succeeded`

#### Scenario: All Sources fail

- **WHEN** every Source's adapter throws
- **THEN** the Scan is marked `failed` and the error is recorded

### Requirement: Reddit adapter emits canonical Resources

`redditAdapter` SHALL read the subreddit (and an optional sort mode) from the Source's `config` and emit one Resource per post, `kind` `read`, cost `0`, deduped by canonical URL, using the post's comments permalink (`https://www.reddit.com<permalink>`) as the canonical URL. When `REDDIT_CLIENT_ID` **and** `REDDIT_CLIENT_SECRET` are set, it SHALL fetch via the app-only OAuth API — honoring the configured sort mode — with a descriptive `User-Agent`, and leave `fallbackMode` unset. When either credential is absent, it SHALL fall back to the keyless public subreddit `.rss` feed with the same descriptive `User-Agent` and set `fallbackMode` to `reddit-rss`. Both modes SHALL emit the same canonical URL for the same post. It SHALL require no Integration (`integration_id` may be null).

#### Scenario: OAuth mode when credentials are present

- **WHEN** `REDDIT_CLIENT_ID` and `REDDIT_CLIENT_SECRET` are set and a Source of kind `reddit` is scanned
- **THEN** `redditAdapter` fetches the subreddit listing via the OAuth API honoring the configured sort, emits one `read` Resource per post keyed by its comments permalink, and leaves `fallbackMode` unset

#### Scenario: Keyless RSS fallback when credentials are absent

- **WHEN** `REDDIT_CLIENT_ID` or `REDDIT_CLIENT_SECRET` is missing and a Source of kind `reddit` is scanned
- **THEN** `redditAdapter` fetches the public subreddit `.rss` feed with a descriptive `User-Agent`, emits `read` Resources, and sets `fallbackMode` to `reddit-rss`

#### Scenario: Canonical URL is stable across modes

- **WHEN** the same Reddit post is emitted once by the OAuth path and once by the RSS fallback
- **THEN** both emit the same canonical URL (the comments permalink), so it dedupes to a single Resource

#### Scenario: Duplicate posts within one fetch collapse

- **WHEN** a fetch returns two posts that resolve to the same comments permalink
- **THEN** only one Resource is emitted for that URL

### Requirement: YouTube adapter emits canonical Resources

`youtubeAdapter` SHALL read a channel id or playlist id from the Source's `config` and emit one Resource per video, `kind` `watch`, cost `0`, deduped by canonical URL, using `https://www.youtube.com/watch?v=<videoId>` as the canonical URL. When `YOUTUBE_API_KEY` is set, it SHALL fetch recent videos via the Data API v3 (the channel's uploads playlist) and leave `fallbackMode` unset. When the key is absent, it SHALL fall back to the keyless channel/playlist Atom feed and set `fallbackMode` to `youtube-atom`. Both modes SHALL emit the same canonical URL for the same video. It SHALL require no Integration (`integration_id` may be null).

#### Scenario: API mode when the key is present

- **WHEN** `YOUTUBE_API_KEY` is set and a Source of kind `youtube` is scanned
- **THEN** `youtubeAdapter` fetches videos via the Data API, emits one `watch` Resource per video keyed by its `watch?v=` URL, and leaves `fallbackMode` unset

#### Scenario: Keyless Atom fallback when the key is absent

- **WHEN** `YOUTUBE_API_KEY` is missing and a Source of kind `youtube` is scanned
- **THEN** `youtubeAdapter` fetches the channel/playlist Atom feed, emits `watch` Resources, and sets `fallbackMode` to `youtube-atom`

#### Scenario: Canonical URL is stable across modes

- **WHEN** the same video is emitted once by the API path and once by the Atom fallback
- **THEN** both emit the same `https://www.youtube.com/watch?v=<videoId>` URL, so it dedupes to a single Resource

### Requirement: Fallback mode is recorded on the Scan

`runTopicScan` SHALL record on the completed Scan every Source that ran a keyless fallback as an entry `{ sourceId, fallbackMode }` in `scans.degraded_sources`. Running a fallback SHALL NOT mark the Scan `failed`: a Scan whose Sources all succeeded — even if some ran degraded — SHALL be `succeeded`. `degraded_sources` SHALL be empty when no Source fell back.

#### Scenario: A degraded Source is recorded and the Scan still succeeds

- **WHEN** a Source's adapter succeeds but reports a `fallbackMode`
- **THEN** the Scan's `degraded_sources` contains `{ sourceId, fallbackMode }` for that Source and the Scan's status is `succeeded`

#### Scenario: No fallback leaves the trace empty

- **WHEN** every Source's adapter succeeds without reporting a `fallbackMode`
- **THEN** the Scan's `degraded_sources` is empty

#### Scenario: Only degraded Sources are listed

- **WHEN** one Source runs a keyed path and another reports a `fallbackMode`
- **THEN** the Scan's `degraded_sources` contains only the degraded Source's entry

### Requirement: Search adapter emits Resources from LLM-generated Exa queries

`searchAdapter` SHALL handle Sources of kind `search`. It SHALL read the Source's topic **effective context** (via `source.topic_id`) — the topic's own `context` together with the `context` of each of the topic's attachments — generate a bounded list of search queries from it with an LLM through the LiteLLM proxy (AI SDK structured output with a Zod schema), run each query through Exa's search API using `EXA_API_KEY`, and emit one Resource per result with a canonical URL (the result URL), a title, and `kind` `read`. Results SHALL be deduped by canonical URL within the adapter run. It SHALL require no Integration (`integration_id` may be null; `EXA_API_KEY` and the proxy credential are read from the environment). It SHALL leave `fallbackMode` unset — search has no keyless fallback. It SHALL leave `embedding` and `embedding_model` unset for the curation pipeline.

#### Scenario: Context doc drives queries and Exa results become Resources

- **WHEN** a Source of kind `search` whose topic has a non-empty effective context (its own `context`, an attachment `context`, or both) is scanned
- **THEN** `searchAdapter` generates queries from that effective context, searches Exa for each, and emits one `read` Resource per result, each keyed by its canonical URL

#### Scenario: Empty context doc falls back to the topic name

- **WHEN** the topic's own `context` is empty and it has no attachment contexts
- **THEN** query generation falls back to the topic `name` rather than sending an empty prompt

#### Scenario: Results dedupe across queries

- **WHEN** two generated queries return results that resolve to the same canonical URL
- **THEN** only one Resource is emitted for that URL

#### Scenario: Adapter reports Exa's cost

- **WHEN** `searchAdapter` completes a scan that called Exa
- **THEN** it returns a `cost` equal to the sum of the dollar cost Exa reported across the queries (not `0`), and that cost is summed into the Scan's `cost`

#### Scenario: No results yields no Resources without failing

- **WHEN** query generation returns no queries, or Exa returns no results
- **THEN** the adapter emits zero Resources and does not fail the Source

#### Scenario: Missing key or search error degrades only this Source

- **WHEN** `EXA_API_KEY` is absent, the LiteLLM proxy is unreachable, or Exa returns an error
- **THEN** the `search` Source fails in isolation without aborting the Scan, and `fallbackMode` is left unset

### Requirement: Adapters populate the Resource snippet and leave content unset

Every adapter SHALL populate the emitted Resource's `snippet` from the native text the Source's own API returns, so curation's cheap stages have real text without an extra fetch: `rssAdapter` from the feed entry's description/summary, `youtubeAdapter` from the video description, `redditAdapter` from the post selftext, and `searchAdapter` from Exa's result highlights (requesting highlights in the search call). An adapter SHALL leave `content` unset — curation fills it when it fetches a survivor. This does not change what else an adapter emits: it still emits Resources only (never Findings, scores, or embeddings) with the canonical URL, title, and kind it already produces, and leaves `embedding` and `embedding_model` unset.

#### Scenario: RSS adapter sets the snippet from the entry description

- **WHEN** a Source of kind `rss` is scanned and a feed entry has a description or summary
- **THEN** the emitted Resource's `snippet` holds that native text and its `content` is unset

#### Scenario: YouTube adapter sets the snippet from the video description

- **WHEN** a Source of kind `youtube` is scanned
- **THEN** each emitted Resource's `snippet` holds the video description and its `content` is unset

#### Scenario: Reddit adapter sets the snippet from the post selftext

- **WHEN** a Source of kind `reddit` is scanned and a post has selftext
- **THEN** the emitted Resource's `snippet` holds that selftext and its `content` is unset

#### Scenario: Search adapter sets the snippet from Exa highlights

- **WHEN** a Source of kind `search` is scanned
- **THEN** `searchAdapter` requests highlights from Exa and each emitted Resource's `snippet` holds its result highlights, with `content` unset

#### Scenario: A missing native text leaves the snippet null, not the title

- **WHEN** a Source's entry has no native description/selftext/highlights
- **THEN** the emitted Resource's `snippet` is null (the title is never copied into the snippet) and the Resource is still emitted

