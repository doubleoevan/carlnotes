## Why

When Exa surfaces a `youtube.com/playlist` URL, `searchAdapter` lands it as one opaque `read` Resource — curation sees a playlist landing page, never the videos inside it, which are the watchable content the topic actually wants. The YouTube adapter already turns a playlist id into its member videos via one `playlistItems` call; search should reuse it so a discovered playlist expands into real `watch` Resources instead of a dead-end link.

## What Changes

- **Expand playlist results in `searchAdapter`** (`worker/adapters/search.ts`): after Exa results are merged, any result whose URL is a `youtube.com/playlist?list=<id>` link is replaced by its member videos as `watch` Resources; non-playlist results are untouched. This runs on every scan, in the search flow, at the same cadence as query generation — no scheduler, no new Source kind.
- **Reuse the YouTube playlist path** (`worker/adapters/youtube.ts`): expose the pure playlist-URL detector (`youtube.com/playlist?list=…` → playlist id, else null) and the existing `playlistItems` fetch (`fetchVideos`), so search calls the exact same Data API path and `parseVideos` mapping the `youtube` Source uses. Expanded videos are keyed by the same canonical `watch?v=` URL, so they dedupe against any `youtube` Source's videos.
- **Degrade gracefully**: with no `YOUTUBE_API_KEY`, or if a playlist's expansion errors (private/404/timeout), the original playlist `read` Resource is kept rather than lost — one failing expansion never drops the other search results.

## Capabilities

### New Capabilities
<!-- none: this extends the existing source-ingestion capability -->

### Modified Capabilities
- `source-ingestion`: the search adapter gains one behavior — a `youtube.com/playlist` result is expanded into its member videos (`watch` Resources) via the YouTube `playlistItems` path, instead of landing as a single `read` Resource. No other requirement changes: the shared interface, dedupe, cost, failure isolation, and the RSS/Reddit/YouTube adapters are untouched.

## Impact

- **Code:** `worker/adapters/search.ts` (playlist-expansion pass over merged results); `worker/adapters/youtube.ts` (export a pure `playlistIdFromUrl` and the `playlistItems` fetch); extend `youtube.test.ts` (URL detector) and `search.test.ts` if a pure seam is added. No change to `adapter.ts`, `scan.ts`, or the adapter registry.
- **Dependencies:** none — the `playlistItems` fetch, `parseVideos`, and `YOUTUBE_API_KEY` already exist.
- **Schema / env:** none. No new Source kind, no new columns, no new env var (`YOUTUBE_API_KEY` is already read by the `youtube` adapter).
- **Cost:** unchanged. `playlistItems` is quota-metered at dollar `cost: 0`, like the rest of the YouTube adapter; search's Exa cost is unaffected.
- **Deferred:** keyless Atom expansion for search-discovered playlists (search keeps the opaque link when unkeyed; the `youtube` Source kind still has its Atom fallback); a per-run cap on expanded videos (curation already scores and filters; `MAX_RESULTS` bounds each playlist to 25).
