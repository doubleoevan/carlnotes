## ADDED Requirements

### Requirement: X ingester reads one handle's recent tweets

`xIngester` SHALL handle Sources of kind `x`. An `x` Source SHALL name the account it follows in `config.handle`; the handle is required, and a Source without a valid one SHALL fail in isolation rather than fall back to reading something else. A handle SHALL be accepted with or without a leading `@`, SHALL be trimmed, and SHALL be refused unless it is one to fifteen letters, digits, or underscores — the form X itself resolves — since it is placed directly into a search operator.

The ingester SHALL issue exactly one advanced-search request per Source per Scan, for `from:<handle>`, using `TWITTERAPI_IO_API_KEY` in the `x-api-key` header. It SHALL require no Integration (`integration_id` is null) and no per-user OAuth: one operator-level key serves every Source. It SHALL emit one Resource per tweet, `kind` `read`, deduped by canonical URL, and SHALL leave `embedding` and `embedding_model` unset for the curation pipeline. It SHALL leave `fallbackMode` unset — X has no keyless fallback.

The issued query SHALL carry `-filter:retweets` and a `since_time:` bound of the last seven days, appended by the ingester, since a retweet duplicates a tweet the account's own timeline already returns and an unbounded window spends reads on stale posts.

#### Scenario: A handle's recent tweets become Resources

- **WHEN** a Source of kind `x` whose `config.handle` names an account is scanned
- **THEN** `xIngester` issues one `from:<handle>` request and emits one `read` Resource per tweet it returned

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
- **THEN** the ingester emits zero Resources and does not fail the Source

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

- **WHEN** `xIngester` emits a Resource for a tweet
- **THEN** its url is `https://x.com/<userName>/status/<id>` built from the response fields, not the provider's echoed url

#### Scenario: The tweet text is the snippet and the handle names the Resource

- **WHEN** `xIngester` emits a Resource for a tweet
- **THEN** its `snippet` holds the tweet's text, its `title` is `@<userName> on X`, and its `content` is unset

#### Scenario: A tweet carries its like count as engagement

- **WHEN** `xIngester` emits a Resource for a tweet with a like count
- **THEN** the stored Resource's `engagement` holds that count, and a later scan refreshes it

#### Scenario: A shortened link is not mistaken for what the tweet said

- **WHEN** a tweet's text is `worth reading https://t.co/8B2G4GhOqU`
- **THEN** the emitted Resource's `snippet` is `worth reading`

#### Scenario: A tweet that was only a link carries no snippet

- **WHEN** a tweet's text is nothing but one or more `t.co` links
- **THEN** the emitted Resource's `snippet` is null rather than a bare shortener url

### Requirement: One X request per Source bounds what a Scan reads

One `x` Source SHALL read at most one page of tweets in one Scan. The bound SHALL be structural rather than a counter checked against the Budget: the ingester issues one request and SHALL NOT follow the provider's pagination cursor, so at the provider's twenty-per-response ceiling a Source reads at most twenty tweets, about $0.003. Because the Scan's Budget is charged once after every Source returns, a Source cannot consult the Budget mid-run, so the bound MUST hold without one. A Topic that wants more X coverage adds more handles, each individually bounded and individually visible in the editor.

#### Scenario: A prolific account cannot run up the bill

- **WHEN** the configured handle has posted hundreds of times inside the recency window
- **THEN** the ingester issues one request, follows no cursor, and emits at most that response's tweets

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

#### Scenario: A new Topic is seeded from the registry

- **WHEN** a Topic is created from the editor's defaults
- **THEN** it holds one Source per registry member and no `x` Source, and no Source kind is named inline at the seeding site

#### Scenario: The default group renders from the registry

- **WHEN** the editor renders the Sources field's default group
- **THEN** it renders one row per registry member with that member's own display copy

### Requirement: Review skips the content fetch for an X Resource

The fetch stage SHALL treat an `x.com` Resource's snippet as its content and SHALL NOT spend a paid fetch on it. A tweet's text is the whole artifact, so a fetch adds nothing when it succeeds, and x.com refuses scraping, so it would reliably fail and fall back to the snippet after being billed. The skip SHALL count as no fetch credit and SHALL NOT mark the Resource or the Scan as failed.

#### Scenario: An X survivor is scored from its snippet without a fetch

- **WHEN** an `x.com` Resource survives filtering and reaches the fetch stage
- **THEN** its snippet is used as the scoring content, no paid fetch is issued, and no fetch cost is charged

#### Scenario: Other hosts are unaffected

- **WHEN** a survivor on any other host reaches the fetch stage
- **THEN** it is reused, revalidated, or fetched exactly as before

## MODIFIED Requirements

### Requirement: Scan records found count and cost

`runTopicScan` SHALL create a Scan in status `running`, and on completion record `found_count` (the number of deduped Resources discovered across all Sources), set `finished_at`, and mark the Scan `succeeded`. Ingestion SHALL NOT set `kept_count`, `filtered_count`, or `ai_summary` — those belong to curation.

The Scan's Budget SHALL be created before ingestion runs, and each Source's ingester cost SHALL charge into that Budget's `ingestion` bucket — zero for the ingesters that use no paid API, and the real dollars spent for the ones that do. `scans.cost` SHALL be the Budget's total, so ingestion spend is inside the same object and the same ceiling the paid curation stages read, rather than a number summed alongside them at close.

#### Scenario: Counts and cost are recorded on success

- **WHEN** a scan completes with its Sources having emitted Resources
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

### Requirement: Canonical URL is a defined normal form

Every requirement that dedupes on canonical URL SHALL mean one defined normal form, applied before a Resource is stored. Canonicalizing a URL SHALL lowercase the host, leave the port alone so that only the scheme's own default is dropped and a non-default port keeps two servers apart, drop the fragment, drop exactly the query parameters that name a referrer rather than the page (any `utm_` prefix, and `fbclid`, `gclid`, `mc_cid`, `mc_eid`, `igshid`, `si`, `ref`, `ref_src`, `source`, `spm`) while sorting the parameters that remain, and strip a trailing slash from any path but the root. Canonicalizing SHALL be idempotent: canonicalizing an already-canonical URL SHALL return it unchanged. A URL that cannot be parsed SHALL be returned untouched, since a dedupe key that cannot be built is better than one that is wrong.

A host that has been renamed SHALL fold to its current name, so the two spellings of one page do not store twice: `twitter.com` and its `www.` and `mobile.` forms SHALL canonicalize to `x.com`. Folding SHALL be limited to hosts known to serve the same page under both names, never applied as a general rule.

A path's case SHALL be folded only where the host is known to ignore it, and never otherwise. Reddit paths SHALL fold throughout. X paths SHALL fold throughout, since a handle ignores case and a status id is digits. YouTube SHALL fold only its handle forms — `/c/<name>`, `/user/<name>`, `/@<handle>`, and a bare vanity segment, each optionally followed by a tab like `/videos`. Every other YouTube path carries an exact id and SHALL NOT fold: a channel id under `/channel/`, a video id under `/shorts/`, and the whole path of a `youtu.be` link are case-sensitive, and lowercasing one produces a URL that resolves to nothing. Paths SHALL be case-sensitive by default, so folding is a per-host allowance rather than a general rule.

#### Scenario: Spellings of one page collapse to a single Resource

- **WHEN** two Sources emit the same page differing only in a trailing slash, a tracking parameter, a fragment, or the order of its query parameters
- **THEN** both canonicalize to the same URL and store as one Resource

#### Scenario: A tweet found twice under both host names collapses

- **WHEN** the search Source emits `https://twitter.com/Sama/status/123` and an X Source emits `https://x.com/sama/status/123`
- **THEN** both canonicalize to the same URL and store as one Resource

#### Scenario: A YouTube handle folds case

- **WHEN** the same channel is emitted as `/c/TitoTheRaccoon` and as `/c/titotheraccoon`
- **THEN** both canonicalize to the same URL and store as one Resource

#### Scenario: A YouTube channel id keeps its case

- **WHEN** a Resource is emitted for `/channel/UCcefcZRL2oaA_uBNeo5UOWg`, a `/shorts/` video id, or a `youtu.be` link
- **THEN** the path's case survives canonicalization, so the stored URL still resolves

#### Scenario: An unparseable URL survives untouched

- **WHEN** a Source emits something that does not parse as a URL
- **THEN** it is stored as given rather than rewritten
