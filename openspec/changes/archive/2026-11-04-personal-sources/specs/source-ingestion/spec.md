## MODIFIED Requirements

### Requirement: Ingesters populate the Resource snippet and leave content unset

Every fetched Source ingester SHALL populate the found Resource's `snippet` from the native text the Source's own API returns, so curation's cheap stages have real text without an extra fetch: `rssIngester` from the feed entry's description/summary, `youtubeIngester` from the video description, `redditIngester` from the post selftext, `podcastIngester` from the episode's show notes, and `searchIngester` from Exa's result highlights (requesting highlights in the search call). An ingester SHALL leave `content` unset — curation fills it when it fetches a survivor. A URL ingester that already fetched its own page SHALL instead hand that body to ingest through the separate `fetchedBody` field; ingest stores and reuses it. This does not change what else an ingester finds: it still finds Resources only (never Findings, scores, or embeddings) with the canonical URL, title, and kind it already produces, and leaves `embedding` and `embedding_model` unset.

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


#### Scenario: Personal sources never populate global text from a private entry

- **WHEN** an `ai_agent` or `email` Source supplies a queued link
- **THEN** its Resource has a public URL-derived fallback title, null snippet, and no private body, sender, chat link, or imported title
- **AND** normal public-page retrieval supplies any later Resource content

## ADDED Requirements

### Requirement: Personal sources ingesters deliver queued public links

Ready `ai_agent` and `email` Sources SHALL supply eligible queued links as ordinary Resource candidates. They SHALL preserve canonical deduplication, source attribution, per-Source failure isolation, and review safety, scoring, explanations, and final trimming without fetching assistant history or Personal sources attachments.

#### Scenario: Both Personal sources kinds have queued links
- **WHEN** a Scan reaches both Sources
- **THEN** it considers their distinct eligible public links through the same scoring pipeline as other Sources
- **AND** private text never becomes a Finding on its own

#### Scenario: Two Sources supply the same URL
- **WHEN** a Personal source and an existing fetched Source supply one canonical URL
- **THEN** one global Resource exists and existing attribution and source-result counting rules remain consistent

#### Scenario: One Personal source fails
- **WHEN** one Personal source fails while another Source succeeds
- **THEN** the Scan retains the successful contribution and reports the failing Source

### Requirement: Queue consumption follows durable candidate outcomes

Queued links SHALL remain pending until a durable outcome records that they were considered. Failed, stopped, or budget-deferred processing SHALL not lose unprocessed links. Deleted entries SHALL no longer contribute pending links.

#### Scenario: A Scan stops after claiming links
- **WHEN** a Scan stops before durable review outcomes exist
- **THEN** unfinished links become available to a later Scan and are not silently marked consumed

#### Scenario: Review defers a candidate
- **WHEN** a review budget prevents consideration
- **THEN** that candidate remains queued for a later Scan

#### Scenario: An entry is deleted during a claim
- **WHEN** the sender deletes the entry before its queued link is consumed
- **THEN** the claim cannot introduce its private provenance or restart its delivery

### Requirement: Personal sources sender priority remains Topic-local

Personal-source contribution weights SHALL affect only the receiving Topic's Finding and review and SHALL never alter globally shared Resource content, embeddings, or cross-user priors.

#### Scenario: Another Topic finds the same URL
- **WHEN** another Topic independently discovers a URL received through personal email
- **THEN** it sees the public Resource without the first sender's identity or private ranking signal

### Requirement: Personal source links expose accurate sender-only outcomes

Personal source links SHALL open an authorized Finding in place when available; otherwise they SHALL open the original page externally with an ExternalLink icon. Retryable links SHALL show **Next brew**: waiting, claimed without a completed outcome, failed, stopped, or deferred by budget. Completed reviews SHALL show no status label. Private reference links SHALL remain outside candidate statuses.

#### Scenario: A candidate is pending or deferred
- **WHEN** a link is waiting, claimed without a completed outcome, failed, stopped, or deferred by budget
- **THEN** it displays **Next brew** beside the link and remains eligible for retry

#### Scenario: A link was evaluated without a kept Finding
- **WHEN** persisted review evidence records a completed relevance evaluation without a kept Finding
- **THEN** the original source link shows the external-link icon and opens the page externally, without a status pill
- **AND** this applies to scored, trimmed, and rejected links without claiming that an unscored rejection received a score

#### Scenario: A link has a Finding
- **WHEN** the current authorized Topic payload has a Finding for the item's canonical link
- **THEN** the source link itself opens that Finding in place, with no separate **Became a finding** link
- **AND** its web tooltip and native accessibility hint say **A topic finding note from Carl**
- **AND** opening and closing preserve the containing section, page, expanded item, scroll position, and route
- **AND** another Topic's Finding cannot provide the status or destination

#### Scenario: A Finding becomes unavailable
- **WHEN** the Finding is deleted or no longer readable when the item is loaded
- **THEN** the source link falls back to the original external page, with the external-link icon and no Finding opener

#### Scenario: Duplicate received links share an outcome
- **WHEN** multiple live entries supply one canonical URL to a Scan
- **THEN** each relevant item displays the same committed Topic-local result without duplicate Resource creation or quota use

### Requirement: Personal sources receive a durable non-stacking score bonus

A Finding SHALL retain the strongest personal-source score bonus across reviews. Deliberate sends, selected imports, and personal forwards SHALL add the placeholder 0.10 bonus; newsletter and automatic/unknown provenance SHALL add half. The personal bonus SHALL replace the custom-source bonus when both apply, and the final score SHALL be clamped to one.

#### Scenario: A Finding is re-scored after its original Source disappears
- **WHEN** a later Scan reviews a Finding with persisted personal-source provenance
- **THEN** its fresh model score receives the stored full or half bonus once
- **AND** a later weaker contribution cannot reduce that stored score bonus

#### Scenario: A link has both personal and custom provenance
- **WHEN** a direct or newsletter link also appears in a custom Source
- **THEN** only the applicable personal bonus is added, including on insert and conflict update

#### Scenario: A scored custom link receives a stronger personal contribution
- **WHEN** the content and context are unchanged but the incoming personal score bonus exceeds its stored score bonus
- **THEN** the link is reviewed again to persist that score bonus
- **AND** a thumbs-down rating still prevents review

### Requirement: Queued Personal sources links reach paid scoring first

Queued personal links SHALL precede other candidates, including existing Findings, before the per-Scan scoring cap is applied. They SHALL skip the embedding relevance pre-filter, including when no embedding is available. Direct contributions SHALL precede newsletter or automatic contributions. Budget-deferred links SHALL remain queued.

#### Scenario: Ordinary discoveries compete for the final scoring slot
- **WHEN** a Scan has both queued personal links and ordinary discoveries
- **THEN** a personal link uses the available slot first even if an ordinary candidate has a higher embedding similarity
- **AND** excess candidates remain eligible for later Scans

#### Scenario: A queued link has no embedding or falls below the similarity floor
- **WHEN** the live queue supplies the matched link
- **THEN** no embedding call or similarity threshold rejects it before scoring

#### Scenario: A weak or unsafe personal link is reviewed
- **WHEN** paid review judges a link unsafe or its bonus-adjusted relevance falls outside the Topic's results limit
- **THEN** the link is dropped under the ordinary safety or max-results rules
- **AND** the bonus never substitutes for model review or its relevance explanation
