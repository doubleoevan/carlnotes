## Context

A Topic's Sources are rows of `kind` + `config`, dispatched at Scan time by `worker/ingest/index.ts` to the ingester registered for that kind. `rssIngester` reads `config.url`, hands it to `fetchFeed`, and gets back deduped `read` Resources at cost `0` with no credential — which is exactly what a Google News feed needs.

Two things around it are not modeled. The default Source set is the literal `[{ kind: "search", value: "" }]` the modal stages for a new Topic plus the `kind === "search"` comparison the editor and the info card each repeat. And the custom source picker lists source kinds directly, which works only while every option is a kind of its own — Google News is not, since it saves as `rss`.

## Goals / Non-Goals

**Goals:**
- A Google News Source the owner adds like any other custom Source, naming the publisher to follow, ingested by the existing `rss` path.
- One Google News feed URL builder, usable both by the picker and by the news-source suggestions being built in a separate worktree.
- One registry for the default Source set, and one table for the picker's options, both read by the editor and the info card.
- A stored Google News Source that reads as its publisher wherever Sources are listed.

**Non-Goals:**
- Suggesting which publishers a Topic should follow. That is the separate change; this one only leaves it a URL builder to call.
- Decoding Google News redirect links into publisher URLs.
- Per-user or per-Topic locale, region, or recency windows on the feed.
- Any change to `worker/`, `db/`, or the ingester interface.

## Decisions

### Google News saves as `kind: "rss"`

The Source is `{ kind: "rss", config: { url: "https://news.google.com/rss/search?q=site%3Atechcrunch.com&…" } }`. `rssIngester` needs no branch, `sourceIngesters` needs no entry, `sourceKinds` needs no value, and the database needs no migration. A `read` Resource per headline is what `parseFeed` already emits by default.

*Alternative — a `googlenews` kind:* a new enum value, a migration, and an ingester file that would call `fetchFeed` and nothing else.

### The publisher is named by domain, scoped with `site:`

`techcrunch.com` becomes `q=site:techcrunch.com`. A pasted article URL or a `www.` prefix is reduced to the bare domain first, and a value holding no domain builds no Source at all.

Probed against live Google News: `q=site:techcrunch.com` and `q=source:TechCrunch` both return 100 articles; `rss/topics/<id>` returns 400 and `rss/headlines/section/topic/…` 302s, so neither id form is usable.

*Alternative — the publisher's name (`source:TechCrunch`):* friendlier to type, but it has to match Google's own spelling, and a near-miss returns a thin feed rather than an error. A domain is verifiable, and it is what a "which publishers cover this topic" search yields.

### One URL builder, shared with the suggestions work

`toGoogleNewsFeedUrl(query)` builds the feed for any query, and the Google News picker option calls it with `site:<domain>`. Keeping the builder query-shaped rather than publisher-shaped is what lets the separate suggestions change stage a Source through the same code instead of assembling its own URL.

### The picker lists options, not kinds

A `CUSTOM_SOURCE_OPTIONS` table names each option's key, the kind it saves as, its label, its input placeholder, and how it builds a config from what was typed. Google News is the entry that proves the split: its kind is `rss` but its input is a publisher domain. The editor stages `{ optionKey, value }` and the save asks the option to build the config, so the modal no longer carries its own `toSourceConfig` branch per kind.

### The default set is a registry, with the web scout as its only entry

`DEFAULT_SOURCES` replaces the `kind === "search"` comparison in both the editor and the info card, and a stored Source matches an entry by kind. Google News is deliberately **not** an entry: it needs a publisher, and the app has nothing to pick one with until the suggestions change lands. That change adds an entry here, or stages Google News Sources from its own flow.

Every switched-on entry is staged fresh on each save rather than kept by id. A default Source's config comes from the registry, not from the row, so rewriting the row is simpler than reconciling it, and nothing references a Source id — `scans.problem_sources` records ids but is never joined back.

### The registry lives in `shared/`

`ui` renders it, and the Source summary every surface reads is built there too. `ui` may not import `worker`, so `shared/` is the only home both can reach, and `shared/sources.ts` already holds `toSourceSummary`.

### A suggested Source stages through the option carrying its kind

The Recommend button returns `{ sourceKind, value }` from `worker/suggest.ts`, while the picker stages `{ optionKey, value }`. Every option key except `googleNews` is its kind spelled the same way, so the editor maps one to the other in a line and suggestions keep working untouched. Suggesting Google News itself needs `worker/suggest.ts` to name the option rather than the kind, to verify a candidate by building its feed, and to key it by publisher rather than by `news.google.com` — a separate change, not this one.

### A Google News Source is summarized by its publisher

`toSourceSummary` returns the `site:` filter's value for a Google News feed, falling back to the feed host for any other `rss` Source. Without it every Google News Source would read `news.google.com` and two of them would be indistinguishable in the editor and the info card.

## Risks / Trade-offs

- **A Google News entry links to `news.google.com/rss/articles/…`, not the publisher, so the same article found by the web scout stores as a second Resource.** → Accept it for now. The feed carries the headline as the title and a snippet, so a Finding scores before any fetch, and Firecrawl resolves the redirect when curation fetches content. The code carries a `ponytail:` comment naming the ceiling.
- **A publisher feed is only as good as the domain given.** → A value with no domain in it builds nothing rather than a feed that finds nothing, and the stored Source shows the publisher it resolved to, so a wrong one is visible.
- **Google News returns an empty feed for an obscure publisher, or rate-limits the endpoint.** → Ingest already treats a Source that emits nothing as a `fallback` and one that throws as an isolated failure, so neither fails the Scan.
- **The locale is fixed at `hl=en-US&gl=US&ceid=US:en`.** → The app has no locale to read yet. The template is one place to change when it does.
- **A Google News Source and a publisher's own RSS feed both read as `rss — techcrunch.com` in the info card.** → They cover the same publisher either way, so the duplicate label costs the reader nothing.
- **Every save deletes and reinserts the default Source rows.** → Cheap and invisible: nothing references a Source row by id.
