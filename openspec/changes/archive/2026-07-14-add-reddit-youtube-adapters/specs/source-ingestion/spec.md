## ADDED Requirements

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

## MODIFIED Requirements

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
