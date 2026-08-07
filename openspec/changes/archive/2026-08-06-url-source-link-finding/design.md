## Context

`urlIngester` is eight lines. It reads `config.url`, validates it through `toFetchableUrl`, and returns one Resource at cost `0`, leaving the fetch to curation. That was a reasonable shape when a url Source meant "this one article", but the Sources people actually add include index pages, and for those the page is the least interesting thing on it.

Three parts of the existing pipeline make this change cheap:

- **Firecrawl already returns Markdown with `onlyMainContent: true`.** Nav, header, and footer are stripped by the scraper, so link extraction runs over content links instead of chrome. Extracting `[anchor](url)` from Markdown needs no HTML parser and no new dependency.
- **`toResourceKind` already maps a host to `read`/`watch`/`listen`.** It lives in `search.ts` and does exactly what a harvested link needs.
- **Global canonical-url dedupe already collapses duplicates across Sources.** `toScanSummary` keys on `toCanonicalUrl`, so a link that the search ingester also found merges instead of duplicating.

One part does not cooperate, and it is the crux of this design.

**There is no url-keyed fetch cache.** The brief asked whether an ingest-time fetch and a curation-time fetch of the same url would share a cache entry and be billed once. They would not. `fetchContent` is a bare Firecrawl POST with no memoization. What looks like a cache is the stored Resource row: curation's `fetchResourceContent` reuses `content_key` when `fetched_at` is within `CONTENT_TTL_MS`, revalidates with the stored `etag`/`last_modified` when it is stale, and only then pays for a scrape. That cache is keyed on a row, and ingest inserts rows *after* every ingester has returned. So a naive implementation fetches the page at ingest, inserts the row with `content_key` null, and curation dutifully fetches the same page again — two charges for one body.

## Goals / Non-Goals

**Goals:**

- A url Source contributes the links its page lists, not just the page.
- The page body is paid for once per Scan, whoever fetches it.
- The candidate set a single page can add is bounded and predictable.
- A fetch failure costs the links and nothing else.

**Non-Goals:**

- Recursion. Depth one, permanently. Depth two multiplies the candidate set by the branching factor again, and nothing in the budget survives that.
- Harvesting from any other ingester. Reddit's outbound links and links inside fetched article bodies are separate questions with their own fan-out arithmetic.
- Judging a link before emitting it. The embed-filter gate already exists to decide which candidates are worth paying for, and anchor text is what it needs to do that job. Adding a second judgment here would duplicate it.
- Screening harvested links as Sources. A harvested link is a Resource, not a Source. It sits in exactly the same trust class as an Exa result: reviewed and content-screened, never treated as owner-supplied.

## Decisions

### Carry the fetched body through ingest instead of accepting a double charge

The alternative was to let the page be fetched twice and pay $0.001 extra per url Source per Scan. That is genuinely small, and it would keep `NewResource` untouched. It was rejected because the cost line is meant to be honest: `stage_costs` would show ingestion and fetch each billing for the same scrape, and the same page would read as costing double what it cost. The Scan report names these numbers to the reader.

So `NewResource` gains an optional body that an ingester may hand over, and `ingestFromTopicSources` stores it after the insert — writing `content_key`, `content_bytes`, `etag`, `last_modified`, and `fetched_at` on the page's row. Curation's reuse rule then serves it for free with no change to curation at all, because it already reads exactly those fields.

The body is deliberately *not* a column on `NewResource` in the database sense. It goes with the insert values and is stripped before the insert, the way a transient field would be.

### Read stored content before fetching, using curation's own staleness rule

A url Source scanned daily would otherwise pay for its page every day. Before fetching, the ingester looks up the page's stored row; when it has a `content_key` and `fetched_at` is within `CONTENT_TTL_MS`, it reads the stored Markdown and harvests from that at zero cost.

This deliberately reuses `CONTENT_TTL_MS` instead of introducing a second freshness constant. Two constants that both mean "how stale is too stale" would drift.

Revalidation via conditional GET was considered as a middle path and left out. It is free but adds a round trip and a second code path for a case the TTL already covers most of the time; curation still revalidates when it gets there.

### Extract links from Markdown, not HTML

Firecrawl returns Markdown with main content only. A Markdown link regex over that body finds content links and misses chrome, which is most of the "drop navigation instead of content" requirement handled for free by a decision already made elsewhere. Requesting `formats: ["html"]` and parsing the DOM would find more links, nearly all of them nav, and would need a parser dependency.

The trade is that a link Firecrawl's main-content extraction drops is invisible to us. That is the correct bias: those are the links we did not want.

### Keep same-host links

Dropping same-host links would be a cheap way to shed nav, and it was rejected. `github.com/trending` links to `github.com/owner/repo` — same host, and the entire point of the page. Hacker News links off-host. A rule that works for one breaks the other. `onlyMainContent` already sheds nav more accurately than a host comparison would, so the only url filters left are structural: the page's own url differing by fragment, and non-http schemes.

### Bound by count, in document order

A cap of 25 link Resources per page, the same number the reddit and youtube ingesters already take. Index pages put their strongest material first, so document order is a better tiebreak than arbitrary truncation, and it is stable across Scans, which keeps dedupe from thrashing between runs.

25 fits `github.com/trending` exactly and takes the top half of a Hacker News front page, which is the half worth reading. It is a knob: raise it if real Sources are being truncated, lower it if the embed gate is drowning.

## Risks / Trade-offs

- **A url Source's spend goes from zero to one fetch per Scan, and its candidate count from one to up to 26.** → The embed gate charges nothing to reject a candidate, so the marginal cost of a harvested link is only paid when it survives. The per-Scan spend cap and its deferral behavior already bound the worst case. Still, this is the change's real cost and the daily-topic limits are what keep it inside a plan's budget.
- **Anchor text is a thin signal.** "Read more", "[1]", and a bare domain tell the embed gate nothing, and those links will be judged almost at random. → They are judged against the topic like everything else and cost nothing to reject. The link's url text itself carries some signal, and the fallback-title rule already derives a title from a url when nothing better exists.
- **A page that lists links to a single domain floods the candidate set with one site.** → The cap bounds it, and same-Scan embedding dedupe already collapses near-duplicates. No per-host cap for now; add one if a real Source shows the failure.
- **The body carried through ingest is stored under a Resource id that only exists after the insert.** A failure between the insert and the store leaves a row with no `content_key`. → That is exactly the state every Resource is in today, and curation fetches it. The failure mode is a wasted fetch, not a broken Scan.
- **Storing at ingest means bytes land in object storage for a page that curation might have filtered before ever fetching it.** → True, and it counts toward the owner's storage total. It is bounded by one page per url Source, and it is the same page the owner explicitly pointed at, so it is the least surprising thing in the Scan to be storing.

## Open Questions

- Should the cap be per Source or per Scan? Per Source is simpler and is what this specifies. A topic with ten url Sources could still contribute 500 candidates. If that shows up in practice, a Scan-wide harvest ceiling is the fix.
- Should a harvested link record which page it came from? Nothing needs it today, and `findings` has no provenance column. It would help explain a surprising Finding to a reader later.
