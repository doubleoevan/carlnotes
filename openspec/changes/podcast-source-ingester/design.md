## Context

Ingestion today has five registered ingesters (`url`, `rss`, `reddit`, `youtube`, `search`) behind one `SourceIngester` interface, dispatched by Source kind in `worker/ingest/index.ts`. One of them already carries most of what a podcast ingester needs: `fetchFeed`/`parseFeed` in `worker/ingest/feed.ts` parse RSS and Atom into Resources of a caller-chosen kind. The `listen` Resource kind exists and is already produced by the search ingester when a result lands on a podcast host.

Two things are hardcoded that this change has to unpick:

- **The default Source set.** The topic editor stages `{ kind: "search" }` for a new Topic, and both the editor and the topic page render that Source through a `WEB_SOURCE = { label: "web", summary: "let Carl crawl" }` constant in `ui/src/lib/utils.ts`. Adding any second default Source to that shape means a second constant and a second special case in three components. Several ingester changes are in flight, so the shape is worth fixing once even though podcasts turn out not to belong in that set.
- **The fetch stage.** `fetchViaFirecrawl` treats every survivor as a page to scrape. A podcast episode page is a play button and a paragraph of show notes, so a Firecrawl credit buys almost nothing — while the show notes are already sitting in the Resource's snippet, and a growing share of feeds publish a full transcript under `<podcast:transcript>`.

## Goals / Non-Goals

**Goals:**

- A `podcast` Source kind naming one show by its podcast id, ingesting that show's episodes as `listen` Resources through the existing feed parser.
- An iTunes show search, exposed for the topic suggestion flow to call.
- The default Source set behind one registry rather than a hardcoded constant, so the next default Source joins with one line.
- A `listen` survivor scored on a transcript when its feed publishes one, and on its show notes when it does not — never on a Firecrawl scrape of the episode page.

**Non-Goals:**

- Transcribing audio. A feed either publishes a transcript or it does not; this change never sends audio to a speech model.
- Suggesting shows for a Topic. This change exposes the search a suggestion flow needs and stops there — choosing what to offer, and where to offer it, belongs to that work.
- Podcasts as a default Source. A show is a deliberate choice a reader makes, not something a new Topic should start with.
- A `watch` caption resolver. See the overlap note under Risks: `youtube-caption-transcripts` owns that, and `watch` Resources keep their current Firecrawl behavior here.
- Apple-specific charts, rankings, or subscriber counts. iTunes is read for a show's feed url and its name, nothing else.
- Accepting a raw feed URL as `podcast` config. A reader who has the feed URL can already add it as an `rss` Source — what iTunes adds is not having to find that URL.

## Decisions

### A podcast id names the show, and iTunes resolves its feed

A `podcast` Source's config is `{ podcastId }` — a show's podcast id, the number in every `podcasts.apple.com/.../id1528594034` link. Each Scan resolves it through `https://itunes.apple.com/lookup?id=<id>`, which returns the show with its `feedUrl`, then hands that feed to the existing `fetchFeed(feedUrl, { resourceKind: "listen" })`. Cost is `0` and `fallbackMode` stays unset: there is no keyed path to fall back *from*, so the field would be lying about a degraded mode.

An id iTunes does not know answers `200` with zero results rather than an error, so the ingester reads the absence itself and throws a message naming the id. The Scan isolates that to the one Source, as it does for any misconfigured Source.

*Alternative considered:* storing the resolved `feedUrl` on the Source instead of the id, sparing a lookup per Scan. The id is the stable identity — a show that moves hosts keeps its podcast id and changes its feed url — and the lookup is one keyless request against a cached index. Storing the feed url would also make a Source added by hand and a Source added from a suggestion carry different shapes.

*Alternative considered:* Podcast Index (podcastindex.org), which has a richer API and an explicit transcript field. It needs an API key and an HMAC-signed header, so it would add a credential and an env var to every deploy for a lookup Apple does for free. Rejected on setup cost, not capability.

Each show contributes only its most recent episodes. `fetchFeed` bounds a feed by bytes, which is the wrong bound here: a podcast archive is small on the wire and enormous in entries — the Data Skeptic feed lists 605 episodes — and every entry becomes a Resource the relevance gate has to embed. An early live scan ran unbounded and had to be killed. Feeds list newest first, so the cap keeps a Scan reading what a show is saying now rather than paying to embed its back catalogue. It is set to 25, the depth the YouTube ingester already reads a channel to.

### The show search resolves a name into an id, for source suggestion

`searchPodcasts(term)` queries iTunes by name and returns `{ podcastId, name, author, feedUrl }` per show — the id a Source stores, what to call the show, and where its episodes come from. The ingester never calls it: it works from an id. Its caller is `worker/suggest.ts`.

This is the piece that makes podcasts suggestable at all. Every other suggested kind is proposed under the value its Source stores — a feed url, a subreddit, a channel id — so verification only has to confirm it. A podcast Source stores an podcast id, which is a bare number a model would invent rather than know. So the model proposes a **show name**, and the iTunes lookup *is* the verification: it either matches a real show, and the suggestion is rewritten to that show's id, or it matches nothing and the candidate is dropped. That is the rule the file already states — "every proposal is fetched the way its ingester will fetch it before the user sees it" — applied to a value that has to change shape on the way through.

Two consequences fall out of a suggestion whose value is rewritten:

- **Verification returns a source rather than a verdict.** `isReadable(): Promise<boolean>` becomes `toConfirmedSource(): Promise<SuggestedSource | null>`. Every other kind returns itself unchanged.
- **Dedupe runs twice.** The first pass runs on what the model proposed, where a podcast is still a name and cannot match an already-followed id. The second runs on what verification returned, against both the Topic's existing Sources and the candidates already accepted in the same reply, so a show suggested under two names collapses.

A podcast candidate is also the one kind that cannot survive the "host declined to answer" allowance the other kinds get. Reddit throttles hard, so a rate-limited subreddit is kept rather than discarded — its value is already storable. An unresolved show name is not storable at all, so it is dropped whatever stopped the lookup.

*Alternative considered:* having the model propose the podcast id directly. It is the shape the Source stores, so no resolution would be needed — but ids are exactly what a model makes up, and every wrong one costs a suggestion slot and reaches the editor as a Source that fails on its first Scan.

*Alternative considered:* returning the raw iTunes entry so the caller picks its own fields. Rejected: the four fields are what identifies a show, and an unshaped vendor payload leaking into a suggestion UI is how a vendor swap becomes a rewrite. Artwork is one field away if the suggestion cards want it.

### The default Source set is a shared registry

A `DEFAULT_SOURCES` record lands in `shared/enums.ts` beside `sourceKinds` and `editableSourceKinds`, keyed by Source kind, each entry carrying the label and summary the editor and the topic page render:

```ts
export const DEFAULT_SOURCES = {
  search: { label: "web", summary: "let Carl crawl" },
}
```

`WEB_SOURCE` in `ui/src/lib/utils.ts` is deleted and its two readers switch to the registry. `EditTopicModal` stages every registered kind for a new Topic instead of the single `search` row, and `TopicSourceEditor`/`TopicSettingsCard` map over the registry to render the default group. Registering a future ingester into the default set becomes one line in one file, which is the point of the registry — whichever ingestion change lands first creates it, and the rest add their line.

Podcasts are deliberately not in it. A show is a choice a reader makes about what they want in their ears, not a sensible default for a Topic that has not said it wants podcasts at all.

*Alternative considered:* leaving `WEB_SOURCE` alone, since the registry now holds one entry and reads like ceremony. But `bluesky-source-ingester`, `google-news-rss-source`, `reddit-ingester`, and `x-source-ingester` are all in flight, and each would otherwise add its own constant and its own special case in three components.

*Alternative considered:* deriving the default set in the api at topic creation, so a new Topic gets its default Sources server-side. It removes the staging step from the editor, but it also removes the reader's ability to turn a default Source off before the first Scan, which the editor supports today. Rejected: the behavior would regress.

### The transcript URL is captured at ingest and read at fetch

`parseFeed` gains a `podcast:transcript` custom field (rss-parser's `customFields.item` with `keepArray`), preferring a `text/plain` or `text/vtt` transcript when a feed lists several, and writes it to a new nullable `resources.transcript_url`. Fetching it at ingest time is wrong — most episodes never survive the embed filter, so it would buy a transcript per episode to read a handful.

The fetch stage then branches before Firecrawl:

- `transcript_url` set → plain `GET` (no Firecrawl, no credit), strip WebVTT/SRT cue timestamps and indexes, store the text through the same object-storage path a scrape uses, count the outcome as `fetched`.
- `listen` with no `transcript_url` → score `resource.snippet`, count the outcome as `fetched`, store nothing.
- anything else → the Firecrawl path, unchanged.

Keying the first branch on the column rather than on the Resource kind is deliberate: a Resource whose publisher declared a transcript takes that path whatever its kind, so nothing has to be taught about podcasts specifically.

**This overlaps `youtube-caption-transcripts`, which is in flight.** That change routes the same stage by kind *and url host*, reading a caption track from YouTube's, Vimeo's, or Dailymotion's own player payload. It adds no `transcript_url` column, and it holds that "kind alone SHALL NOT select the transcript path" — naming a podcast host as one that should take Firecrawl. The two disagree on exactly one case: a `listen` Resource whose feed declared no transcript. That change would scrape it; this one scores its show notes. Confirmed with the author that this one wins: an episode page is a player and a paragraph, the paragraph is already in the snippet, and the live scan scraped zero episodes. The two are otherwise complementary, and whichever lands second folds them into one router — a declared `transcript_url` first, then a host caption track, then Firecrawl — and amends that change's wording where it names podcast hosts.

*Alternative considered:* storing the transcript URL in a JSON blob on the Resource to avoid a migration. A nullable text column is smaller, indexable if it ever needs to be, and honest about being one value.

### Episode URL and dedupe

An episode's canonical URL is its feed entry `link`, then an absolute `guid`, then the `enclosure` URL, canonicalized by the shared normalizer. The enclosure fallback is not theoretical: probing real feeds during implementation found that shows commonly stamp the *show's own* link on every episode — Google DeepMind's feed has 49 episodes and one distinct `link` — so preferring the link alone collapses a whole show into a single Resource. `parseFeed` therefore treats a `link` equal to the feed's own channel link as naming the show rather than the episode, and falls through to the address the entry named for itself. An entry whose link is the show link and that names nothing else keeps the show link, so no entry is ever dropped by the rule.

The consequence is that some episodes are keyed by their audio file. Hard Fork's feed stamps `nytimes.com/column/hard-fork` on every item and gives each a non-permalink uuid guid, so two of its three entries resolve to a podtrac tracking-redirect mp3 url and only the third, which carries a real article link, resolves to a page. That is the honest outcome — the feed publishes no per-episode page for those entries — and the alternative is losing them to a collapse. It leaves two warts: a Finding whose link opens audio rather than a page, and a dedupe key whose path depends on a tracking-redirect chain, so an episode would re-ingest as a new Resource if its publisher changed prefixes. The episode identity itself (`awEpisodeId`) survives canonicalization, so the key is stable while the chain is.

That means an episode discovered through a podcast Source and the same episode discovered as a `podcasts.apple.com` link by the search Source will usually *not* collapse — the feed links to the show's own site or its audio file, Exa links to Apple. Accepted: the two are different URLs for the same audio, and reconciling them would mean resolving every Apple episode page to its feed entry, which costs a fetch per Resource to save a duplicate that the embed dedupe already catches at the content level.

## Risks / Trade-offs

- **iTunes rate limits (roughly 20 requests/minute, unpublished and enforced by 403).** → A `podcast` Source makes exactly one lookup per Scan, so a Topic would need twenty podcast Sources scanning in the same minute to approach it. A 403 fails that one Source and the Scan keeps what its other Sources found.
- **A show's feed is slow, huge, or dead.** → `fetchFeed` already bounds both (10s timeout, 5 MB cap), and the episode cap bounds what a healthy feed contributes. A failed feed fails that Source alone.
- **A reader types a wrong or stale id.** → An unknown id comes back as zero results, and the ingester throws naming the id, so the Scan report shows which Source is misconfigured rather than silently finding nothing. A show delisted from iTunes reads the same way.
- **`searchPodcasts` ships with no caller.** → It is dead code until the suggestion flow lands, and dead code rots. It is tested and exercised through the same parser the ingester's lookup uses, so it cannot silently break, but if that flow does not land this should be deleted rather than left sitting.
- **Skipping Firecrawl for transcript-less `listen` Resources scores them on show notes, which are sometimes one sentence.** → That is the intended trade: a one-sentence snippet scores low and gets filtered, which is a truer outcome than a scrape of a play-button page and a wasted credit. Episodes from feeds with real show notes score on real text.
- **A transcript can be very large.** → The transcript `GET` reuses the feed fetcher's byte cap, and scoring already truncates to `MAX_SCORE_CHARS`. Timestamp stripping happens before storage, so the stored body is words rather than cue markers.
- **The `source_kind` enum gains a value.** → Postgres enum additions are forward-only and non-breaking; nothing reads an exhaustive list of kinds at the database level, and the TypeScript unions widen at compile time so any unhandled kind fails `tsc` rather than at runtime.
