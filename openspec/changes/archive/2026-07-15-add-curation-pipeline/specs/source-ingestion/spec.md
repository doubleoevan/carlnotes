## ADDED Requirements

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
