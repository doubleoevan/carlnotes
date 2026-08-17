## ADDED Requirements

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

## MODIFIED Requirements

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
