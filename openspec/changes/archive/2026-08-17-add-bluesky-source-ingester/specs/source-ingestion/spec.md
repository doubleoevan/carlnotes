## ADDED Requirements

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
