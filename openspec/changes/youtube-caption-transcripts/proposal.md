## Why

A YouTube video that survives the embed-filter is fetched through Firecrawl like any other page, and a watch page has no article to scrape — the scrape returns player chrome and sidebar links, so scoring falls back to a one-paragraph video description. The words the video actually says are already published as its caption track, free and in full, so the Finding for a video can be grounded in what was said instead of in its blurb.

Videos are underserved a step earlier too. A YouTube Source can only be stored by its channel id, and the suggestion prompt asks the model for one — twenty-four opaque characters. Every other way a channel is named, including the handle it is actually known by and the url anyone would paste, is fetched as if it were an id, answers 404, and is dropped. A channel url is discarded despite carrying a valid id in plain sight.

## What Changes

- The fetch stage branches on the Resource: a `watch` Resource whose url carries a video id on a host that publishes captions keylessly fills its content from that video's caption track, and every other Resource keeps the existing Firecrawl path unchanged.
- Three hosts qualify, each verified by probing rather than assumed from its feature list: **YouTube** (player endpoint, json3), **Vimeo** (player config, WEBVTT), and **Dailymotion** (player metadata, SRT). Each maps its own payload into one shared track shape, so a single English-preference rule, one domain guard, and one cue parser serve all of them.
- The transcript is stored, scored, reused, and pruned exactly like Firecrawl markdown — same object storage key, same `content_bytes`, same `CONTENT_TTL_MS` reuse.
- A video with no caption track, or a transcript fetch that fails, leaves content unset and scores on the Resource's native snippet, exactly as a failed Firecrawl scrape does today.
- Source suggestions accept a YouTube channel however it is named — a handle, a channel or playlist url, or a raw id — and resolve it to the id the ingester stores before the candidate is deduped or verified. The prompt now asks for the handle, since a channel id is twenty-four characters of nothing and a half-remembered one reads as a channel that does not exist.
- The transcript path charges into the existing `fetch` entry of `stage_costs`. It goes straight to YouTube and spends no vendor credit, so it charges zero and the fetch bucket does not grow for a video. The outcome still counts as `fetched`, so a transcribed video counts against `MAX_SCORED_RESOURCES_PER_SCAN` like any other scored Resource.

## Capabilities

### New Capabilities

None. This changes how one existing stage fills content, not what the pipeline does.

### Modified Capabilities

- `curation`: the "Survivors are fetched via Firecrawl with a snippet fallback" requirement becomes kind-aware — a YouTube `watch` survivor is filled from its caption track rather than Firecrawl, with the same storage, the same snippet fallback, and the same `fetched` outcome. The `stage_costs` requirement is amended to say the transcript path charges into the existing `fetch` bucket rather than earning a bucket of its own.
- `injection-defense`: the scanner screens the bounded prefix that scoring reads rather than the whole fetched body. A transcript runs to tens of thousands of characters against a 2.5-second scanner timeout that fails open, so screening it all risked losing the screening entirely on exactly the Resources this change introduces. The prefix is every character a model reads, so nothing goes unscreened.
- `source-suggestion`: a suggested Source is resolved into the value its ingester stores before it is deduped or verified, so a YouTube channel can be proposed by handle or url rather than only by raw id. Verification then reads the Atom feed of the id it resolved to, so what is checked is what gets stored.

## Impact

- `worker/scrape.ts`: gains a per-host video-id parse, a per-host track-list mapper, the caption fetches, the shared cue parser, and the caption-domain guard, alongside `fetchContent`.
- `worker/review/score.ts`: `fetchResourceContent` picks the transcript path or the Firecrawl path per Resource; the storage write, the row update, and the snippet fallback stay shared. It also screens the bounded prefix that scoring reads rather than a whole transcript.
- `worker/ingest/normalize.ts`: `dai.ly` joins the watch hosts, so a Dailymotion short link is classified as a video rather than an article.
- `worker/ingest/youtube.ts`: gains `toYoutubeSourceId`, which reads a channel or playlist id out of an id, a url, or a handle, looking a handle up against the channel page's canonical link.
- `worker/suggest.ts`: resolves each candidate into its stored form before the dedupe and the verification, dropping one that names nothing.
- `worker/prompts/suggest-sources.md`: version 2 asks for a handle in preference to a raw id.
- `worker/scrape.test.ts` and `worker/chat/retrieve.ts`: the parsers get fixture coverage, and the chat text cap records that it stays within the screened prefix.
- No new dependency, no new environment variable, no schema change, and no new Source kind. Loom, TED, TikTok, Rumble, and every `listen` host keep the Firecrawl path, because their captions are not readable without a key or a page scrape.
- Revalidation is unaffected in practice: a caption fetch exposes no usable `etag` or `last_modified`, so a stale video refetches its transcript rather than sending a conditional GET.
