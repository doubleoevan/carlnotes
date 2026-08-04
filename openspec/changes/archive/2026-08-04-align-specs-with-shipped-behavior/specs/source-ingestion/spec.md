## ADDED Requirements

### Requirement: Canonical URL is a defined normal form

Every requirement that dedupes on canonical URL SHALL mean one defined normal form, applied before a Resource is stored. Canonicalizing a URL SHALL lowercase the host, leave the port alone so that only the scheme's own default is dropped and a non-default port keeps two servers apart, drop the fragment, drop exactly the query parameters that name a referrer rather than the page (any `utm_` prefix, and `fbclid`, `gclid`, `mc_cid`, `mc_eid`, `igshid`, `si`, `ref`, `ref_src`, `source`, `spm`) while sorting the parameters that remain, and strip a trailing slash from any path but the root. Canonicalizing SHALL be idempotent: canonicalizing an already-canonical URL SHALL return it unchanged. A URL that cannot be parsed SHALL be returned untouched, since a dedupe key that cannot be built is better than one that is wrong.

A path's case SHALL be folded only where the host is known to ignore it, and never otherwise. Reddit paths SHALL fold throughout. YouTube SHALL fold only its handle forms — `/c/<name>`, `/user/<name>`, `/@<handle>`, and a bare vanity segment, each optionally followed by a tab like `/videos`. Every other YouTube path carries an exact id and SHALL NOT fold: a channel id under `/channel/`, a video id under `/shorts/`, and the whole path of a `youtu.be` link are case-sensitive, and lowercasing one produces a URL that resolves to nothing. Paths SHALL be case-sensitive by default, so folding is a per-host allowance rather than a general rule.

#### Scenario: Spellings of one page collapse to a single Resource

- **WHEN** two Sources emit the same page differing only in a trailing slash, a tracking parameter, a fragment, or the order of its query parameters
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

### Requirement: A Resource that arrives without a title derives one

A search provider sometimes returns a result with an empty title, which would otherwise render as a bare hostname and read as broken. Ingestion SHALL derive a title for such a Resource from the first line of its snippet that reads like a name rather than a piece of body text — bounded in length, opening on a capital or a digit, and containing letters — after stripping any leading Markdown heading, quote, or bullet marker. When no snippet line qualifies, ingestion SHALL fall back to the URL's own last meaningful path segment, with separators read as spaces and any file extension dropped. When neither yields anything, the title SHALL remain unset rather than be filled with a fragment. A Resource that arrives with a title SHALL keep it.

#### Scenario: A titleless result takes its snippet's heading

- **WHEN** a search result arrives with an empty title and a snippet whose first qualifying line reads like a name
- **THEN** that line becomes the Resource's title

#### Scenario: Body text is not mistaken for a title

- **WHEN** a titleless result's snippet opens with a horizontal rule, a bare year, or a full paragraph
- **THEN** none of those become the title, and the URL's own path segment is used instead

#### Scenario: A title already provided is left alone

- **WHEN** a search result arrives carrying its own title
- **THEN** ingestion stores that title rather than deriving one
