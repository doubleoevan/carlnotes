## MODIFIED Requirements

### Requirement: Global Resource dedupe on canonical URL

Upserting found Resources SHALL dedupe globally on canonical URL. Re-scanning a Source whose entries already exist as
Resources SHALL NOT create duplicate rows and SHALL NOT overwrite the existing Resource, so its later-filled `embedding`
and stored content are preserved. A rescan SHALL refresh no field of an existing Resource.

#### Scenario: Existing URL is not duplicated

- **WHEN** a scan finds a Resource whose canonical URL already exists in `resources`
- **THEN** no duplicate row is created and the existing row is left unchanged

#### Scenario: New URL is inserted

- **WHEN** a scan finds a Resource whose canonical URL is not yet stored
- **THEN** a new `resources` row is inserted

## ADDED Requirements

### Requirement: Reddit ingester finds canonical Resources in either mode

`redditIngester` SHALL find one Resource per post, `kind` `read`, cost `0`, deduped by canonical URL within the payload,
using the post's comments permalink (`https://www.reddit.com<permalink>`) as the canonical URL, with the post's title
and a snippet. It SHALL require no Integration (`integration_id` may be null).

**What it fetches** SHALL be decided by the Source's `config`. A `subreddit` SHALL be required: it fetches that
subreddit's listing at the configured `sort` (`hot`, `new`, `top`, or `rising`, defaulting to `hot` and falling back to
`hot` for an unrecognized value), and a `query` alongside it fetches that query restricted to that subreddit instead. A
`subreddit` that is missing, or that is not a valid Reddit name, SHALL fail the Source instead of being defaulted or
encoded into a URL — a Reddit Source is the subreddit it names, which is why it is not a kind a new Topic can start
with.

The ingester SHALL also build the site-wide search form of each URL, which no Source produces, because searching Reddit
at large is how a subreddit relevant to a Topic is found in the first place. That form SHALL stay covered by the URL
tests so the subreddit-discovery work has a checked seam to call.

**How it fetches** SHALL be decided by credentials. If `REDDIT_CLIENT_ID` **and** `REDDIT_CLIENT_SECRET` are set, the
ingester SHALL attempt the app-only OAuth API first and, if that attempt fails, SHALL fall back to the keyless public
RSS feeds on `www.reddit.com`. If either credential is absent, it SHALL attempt the feeds only. The ingester SHALL NOT
read Reddit's public `.json` endpoints, which Reddit refuses to keyless callers.

The two modes do not include the same payload, and the difference is the loss the fallback records. The OAuth listing
SHALL supply the post's selftext as the snippet and the configured sort. The RSS feeds SHALL supply the entry's own
summary text as the snippet and SHALL serve the subreddit's default ordering, so the configured sort does not survive
that mode. Both modes SHALL find the same canonical URL for the same post. Resources produced by the feeds SHALL set
`fallbackMode` to `reddit-rss`; Resources produced by the OAuth API SHALL leave `fallbackMode` unset.

Every request on every path — the token request included — SHALL include a descriptive `User-Agent`, because Reddit
rejects generic or missing agents. One Source SHALL make at most one listing request per mode attempted per Scan.

Because a Scan runs its Sources concurrently, the ingester SHALL queue every request it makes behind the one before it,
separated by a gap set per mode: the keyless feeds refuse requests that arrive closer than they allow, so their gap
SHALL be the measured interval they serve, and the OAuth mode — which has far more headroom — SHALL use a short gap that
only keeps a Scan's Sources from arriving together. The queue SHALL advance whether a request succeeded or was refused,
so a refusal still spaces out what follows.

If every attempted mode fails, the Source SHALL fail with a reason naming what it asked for and how each mode refused
it, so a Source blocked by Reddit is distinguishable from one that found nothing.

#### Scenario: OAuth is preferred when credentials are present

- **WHEN** `REDDIT_CLIENT_ID` and `REDDIT_CLIENT_SECRET` are set and a Source of kind `reddit` is scanned
- **THEN** `redditIngester` fetches through the OAuth API, finds one `read` Resource per post keyed by its comments
  permalink with its title and selftext snippet, and leaves `fallbackMode` unset

#### Scenario: A failed OAuth attempt falls through to the feeds

- **WHEN** credentials are set but the OAuth attempt fails
- **THEN** the ingester fetches the same subreddit or search from the keyless RSS feed, finds its Resources, and sets
  `fallbackMode` to `reddit-rss`

#### Scenario: Keyless mode when credentials are absent

- **WHEN** `REDDIT_CLIENT_ID` or `REDDIT_CLIENT_SECRET` is missing and a Source of kind `reddit` is scanned
- **THEN** the ingester fetches the keyless RSS feed with a descriptive `User-Agent`, finds `read` Resources including
  their titles, snippets, and permalinks, and sets `fallbackMode` to `reddit-rss`

#### Scenario: The sort survives the OAuth mode and not the fallback

- **WHEN** a Source configured with a `subreddit` and a `sort` of `top` is scanned
- **THEN** the OAuth mode fetches that subreddit's `top` listing, and the RSS fallback fetches the subreddit's feed at
  its own default ordering

#### Scenario: A query searches inside the Source's subreddit

- **WHEN** a Source of kind `reddit` includes both a `subreddit` and a `query`
- **THEN** the ingester searches that subreddit for that query and finds the results as `read` Resources

#### Scenario: A Source with no subreddit fails

- **WHEN** a Source of kind `reddit` names no `subreddit`, with or without a `query`
- **THEN** the Source fails with a reason naming the missing config instead of reading some other subreddit

#### Scenario: The site-wide search form stays available for finding a subreddit

- **WHEN** a caller builds a Reddit search request that names no subreddit
- **THEN** both the OAuth and the keyless URL builders produce the site-wide search URL, so subreddit discovery can
  search Reddit at large

#### Scenario: Canonical URL is stable across modes

- **WHEN** the same Reddit post is found once by the OAuth path and once by the keyless path
- **THEN** both find the same canonical URL (the comments permalink), so it dedupes to a single Resource

#### Scenario: Duplicate posts within one fetch collapse

- **WHEN** a fetch returns two posts that resolve to the same comments permalink
- **THEN** only one Resource is found for that URL

#### Scenario: A Source blocked in every mode fails with its reason

- **WHEN** both the OAuth attempt and the keyless attempt are refused, as when Reddit blocks the deployment's IP range
- **THEN** the Source fails with a reason naming each attempted mode and its failure, and the rest of the Scan's Sources
  are unaffected

#### Scenario: Two Reddit Sources in one Scan do not fetch together

- **WHEN** a Topic has two Reddit Sources and a Scan runs them concurrently
- **THEN** their requests are queued one behind the other with the mode's gap between them, instead of arriving
  together and having the second refused

#### Scenario: OAuth mode when credentials are present

- **WHEN** `REDDIT_CLIENT_ID` and `REDDIT_CLIENT_SECRET` are set and a Source of kind `reddit` is scanned
- **THEN** `redditIngester` fetches the subreddit listing via the OAuth API honoring the configured sort, finds one
  `read` Resource per post keyed by its comments permalink, and leaves `fallbackMode` unset

#### Scenario: Keyless RSS fallback when credentials are absent

- **WHEN** `REDDIT_CLIENT_ID` or `REDDIT_CLIENT_SECRET` is missing and a Source of kind `reddit` is scanned
- **THEN** `redditIngester` fetches the public subreddit `.rss` feed with a descriptive `User-Agent`, finds `read`
  Resources, and sets `fallbackMode` to `reddit-rss`

### Requirement: Bluesky ingester finds one Resource per linked article

`blueskyIngester` SHALL handle Sources of kind `bluesky`. Each Source SHALL name one account in `config.handle`, and a
Source without one SHALL fail instead of fetching anything, since a Bluesky Source with no account named has nothing to
read. A handle typed with a leading `@` SHALL name the same account as one typed without it.

The ingester SHALL read that account's recent posts through `app.bsky.feed.getAuthorFeed` on the public appview
(`public.api.bsky.app`) with no credentials, and SHALL find one Resource per **article a post links to** instead of
per post. A post is mostly a pointer, so the Resource is the page it points at: its URL is the link's own URL, its
`title` and `snippet` come from the link card's title and description, and its `kind` follows the link's host, so a
video an account links to lands as `watch` instead of as an article. A post that includes no link SHALL be skipped, as
SHALL a link back into Bluesky itself, which is a quote or a profile instead of something to read.

Resources SHALL be deduped by URL within the run. The ingester SHALL charge cost `0`, require no Integration
(`integration_id` may be null), and leave `content`, `embedding`, `embedding_model`, and `fallbackMode` unset.

#### Scenario: An account's linked articles become Resources

- **WHEN** a Source of kind `bluesky` naming an account is scanned
- **THEN** `blueskyIngester` reads that account's posts from the public appview without credentials and finds one
  Resource per linked article, each including the link card's title and description

#### Scenario: A Source naming no account fails in isolation

- **WHEN** a Source of kind `bluesky` has no `config.handle`
- **THEN** the ingester throws, that Source fails alone, and the Scan continues with its remaining Sources

#### Scenario: The linked page's kind follows its host

- **WHEN** an account links to a video instead of an article
- **THEN** the found Resource's `kind` is `watch`, the same kind the video's own Source would find, so the two dedupe

#### Scenario: Posts with nothing to read are skipped

- **WHEN** a post includes no link, or links back into Bluesky itself
- **THEN** no Resource is found for it

#### Scenario: An account posting one article twice yields one Resource

- **WHEN** two posts in the fetched feed link to the same URL
- **THEN** only one Resource is found, keeping the first sighting

### Requirement: A tweet's canonical URL, title, and snippet

`xIngester` SHALL build each Resource's canonical URL as `https://x.com/<userName>/status/<id>` from the response's own
author handle and tweet id instead of from the URL the provider echoes back, so the dedupe key has one shape whatever
the provider returns. It SHALL set the Resource's `snippet` to the tweet's text and leave `content` unset. It SHALL set
the Resource's `title` to `@<userName> on X` instead of leaving it for the derive-a-title rule, whose URL fallback
would otherwise yield a bare numeric status id for a tweet whose text does not read like a name.

X rewrites every URL a tweet contains into a `t.co` shortener, which names nothing on its own. Those links SHALL be
stripped from the snippet, and a tweet whose text was only such links SHALL include no snippet instead of a bare
shortener. This matters more here than elsewhere because review never fetches a tweet, so the snippet is the only text
scoring will ever see.

#### Scenario: The canonical URL is built from the handle and the id

- **WHEN** `xIngester` finds a Resource for a tweet
- **THEN** its url is `https://x.com/<userName>/status/<id>` built from the response fields, not the provider's echoed
  url

#### Scenario: The tweet text is the snippet and the handle names the Resource

- **WHEN** `xIngester` finds a Resource for a tweet
- **THEN** its `snippet` holds the tweet's text, its `title` is `@<userName> on X`, and its `content` is unset

#### Scenario: A shortened link is not mistaken for what the tweet said

- **WHEN** a tweet's text is `worth reading https://t.co/8B2G4GhOqU`
- **THEN** the found Resource's `snippet` is `worth reading`

#### Scenario: A tweet that was only a link includes no snippet

- **WHEN** a tweet's text is nothing but one or more `t.co` links
- **THEN** the found Resource's `snippet` is null instead of a bare shortener url

## REMOVED Requirements

### Requirement: The reddit ingester records the post score as engagement
**Reason**: Trending ranks by unique viewers, so nothing reads a post's score.
**Migration**: None. `resources.engagement` stays in the database, unread and unwritten, until a later release drops it.

### Requirement: Reddit ingester finds canonical Resources
**Reason**: Replaced by "Reddit ingester finds canonical Resources in either mode", which drops the score.
**Migration**: None. The ingester behaves the same apart from the score it no longer reads.

### Requirement: Bluesky ingester finds the articles an account links to
**Reason**: Replaced by "Bluesky ingester finds one Resource per linked article", which drops the like count.
**Migration**: None. The ingester behaves the same apart from the like count it no longer reads.

### Requirement: A tweet's canonical URL, title, snippet, and engagement
**Reason**: Replaced by "A tweet's canonical URL, title, and snippet", which drops the like count.
**Migration**: None.
