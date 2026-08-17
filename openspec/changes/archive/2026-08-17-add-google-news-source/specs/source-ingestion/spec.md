## ADDED Requirements

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
