## MODIFIED Requirements

### Requirement: Reddit ingester emits canonical Resources

`redditIngester` SHALL emit one Resource per post, `kind` `read`, cost `0`, deduped by canonical URL within the payload, using the post's comments permalink (`https://www.reddit.com<permalink>`) as the canonical URL, with the post's title and a snippet. It SHALL require no Integration (`integration_id` may be null).

**What it fetches** SHALL be decided by the Source's `config`. A `subreddit` SHALL be required: it fetches that subreddit's listing at the configured `sort` (`hot`, `new`, `top`, or `rising`, defaulting to `hot` and falling back to `hot` for an unrecognized value), and a `query` alongside it fetches that query restricted to that subreddit instead. A `subreddit` that is missing, or that is not a valid Reddit name, SHALL fail the Source rather than be defaulted or encoded into a URL — a Reddit Source is the subreddit it names, which is why it is not a kind a new Topic can start with.

The ingester SHALL also build the site-wide search form of each URL, which no Source produces, because searching Reddit at large is how a subreddit relevant to a Topic is found in the first place. That form SHALL stay covered by the URL tests so the subreddit-discovery work has a checked seam to call.

**How it fetches** SHALL be decided by credentials. When `REDDIT_CLIENT_ID` **and** `REDDIT_CLIENT_SECRET` are set, the ingester SHALL attempt the app-only OAuth API first and, if that attempt fails, SHALL fall back to the keyless public RSS feeds on `www.reddit.com`. When either credential is absent, it SHALL attempt the feeds only. The ingester SHALL NOT read Reddit's public `.json` endpoints, which Reddit refuses to keyless callers.

The two modes do not carry the same payload, and the difference is the loss the fallback records. The OAuth listing SHALL supply the post's selftext as the snippet, its score as `engagement`, and the configured sort. The RSS feeds SHALL supply the entry's own summary text as the snippet, SHALL leave `engagement` unset, and SHALL serve the subreddit's default ordering, so the configured sort does not survive that mode. Both modes SHALL emit the same canonical URL for the same post. Resources produced by the feeds SHALL set `fallbackMode` to `reddit-rss`; Resources produced by the OAuth API SHALL leave `fallbackMode` unset.

Every request on every path — the token request included — SHALL carry a descriptive `User-Agent`, because Reddit rejects generic or missing agents. One Source SHALL make at most one listing request per mode attempted per Scan.

Because a Scan runs its Sources concurrently, the ingester SHALL queue every request it makes behind the one before it, separated by a gap set per mode: the keyless feeds refuse requests that arrive closer than they allow, so their gap SHALL be the measured interval they serve, and the OAuth mode — which has far more headroom — SHALL use a short gap that only keeps a Scan's Sources from arriving together. The queue SHALL advance whether a request succeeded or was refused, so a refusal still spaces out what follows.

When every attempted mode fails, the Source SHALL fail with a reason naming what it asked for and how each mode refused it, so a Source blocked by Reddit is distinguishable from one that found nothing.

#### Scenario: OAuth is preferred when credentials are present

- **WHEN** `REDDIT_CLIENT_ID` and `REDDIT_CLIENT_SECRET` are set and a Source of kind `reddit` is scanned
- **THEN** `redditIngester` fetches through the OAuth API, emits one `read` Resource per post keyed by its comments permalink with its title, selftext snippet, and score, and leaves `fallbackMode` unset

#### Scenario: A failed OAuth attempt falls through to the feeds

- **WHEN** credentials are set but the OAuth attempt fails
- **THEN** the ingester fetches the same subreddit or search from the keyless RSS feed, emits its Resources, and sets `fallbackMode` to `reddit-rss`

#### Scenario: Keyless mode when credentials are absent

- **WHEN** `REDDIT_CLIENT_ID` or `REDDIT_CLIENT_SECRET` is missing and a Source of kind `reddit` is scanned
- **THEN** the ingester fetches the keyless RSS feed with a descriptive `User-Agent`, emits `read` Resources carrying their titles, snippets, and permalinks, and sets `fallbackMode` to `reddit-rss`

#### Scenario: The sort survives the OAuth mode and not the fallback

- **WHEN** a Source configured with a `subreddit` and a `sort` of `top` is scanned
- **THEN** the OAuth mode fetches that subreddit's `top` listing, and the RSS fallback fetches the subreddit's feed at its own default ordering

#### Scenario: The score survives the OAuth mode and not the fallback

- **WHEN** the same post is emitted by each mode
- **THEN** the OAuth mode sets `engagement` to the post's score and the RSS fallback leaves `engagement` unset

#### Scenario: A query searches inside the Source's subreddit

- **WHEN** a Source of kind `reddit` carries both a `subreddit` and a `query`
- **THEN** the ingester searches that subreddit for that query and emits the results as `read` Resources

#### Scenario: A Source with no subreddit fails

- **WHEN** a Source of kind `reddit` names no `subreddit`, with or without a `query`
- **THEN** the Source fails with a reason naming the missing config rather than reading some other subreddit

#### Scenario: The site-wide search form stays available for finding a subreddit

- **WHEN** a caller builds a Reddit search request that names no subreddit
- **THEN** both the OAuth and the keyless URL builders produce the site-wide search URL, so subreddit discovery can search Reddit at large

#### Scenario: Canonical URL is stable across modes

- **WHEN** the same Reddit post is emitted once by the OAuth path and once by the keyless path
- **THEN** both emit the same canonical URL (the comments permalink), so it dedupes to a single Resource

#### Scenario: Duplicate posts within one fetch collapse

- **WHEN** a fetch returns two posts that resolve to the same comments permalink
- **THEN** only one Resource is emitted for that URL

#### Scenario: A Source blocked in every mode fails with its reason

- **WHEN** both the OAuth attempt and the keyless attempt are refused, as when Reddit blocks the deployment's IP range
- **THEN** the Source fails with a reason naming each attempted mode and its failure, and the rest of the Scan's Sources are unaffected

#### Scenario: Two Reddit Sources in one Scan do not fetch together

- **WHEN** a Topic has two Reddit Sources and a Scan runs them concurrently
- **THEN** their requests are queued one behind the other with the mode's gap between them, rather than arriving together and having the second refused

## REMOVED Requirements

### Requirement: Fallback mode is recorded on the Scan

**Reason**: The trace recorded only Sources that fell back and still succeeded, so a Source that failed every access mode left nothing durable behind and read as a Scan that simply found less. It is replaced by a trace covering both outcomes, under a name that is true of what it holds.

**Migration**: Replaced by "Every Source that hit a problem is recorded on the Scan". The column `scans.fallback_sources` is renamed to `scans.problem_sources` and its entries gain a `status` discriminant; an existing entry carrying a `fallbackMode` is the fallback arm of the new union, so no backfill is required.

## ADDED Requirements

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
