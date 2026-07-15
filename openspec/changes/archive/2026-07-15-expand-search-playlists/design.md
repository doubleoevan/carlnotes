## Context

`searchAdapter` (`worker/adapters/search.ts`) generates queries from a topic's context, runs them through Exa, and maps every result to a `read` Resource keyed by its URL (`parseResults`), deduped across queries. A YouTube playlist is a legitimate Exa result, so today it lands as one `read` Resource pointing at the playlist page — curation then fetches that page, not the videos on it.

The `youtube` adapter (`worker/adapters/youtube.ts`) already solves the playlist→videos problem: `fetchVideos(playlistId, apiKey)` calls the Data API `playlistItems` endpoint (1 quota unit, `cost: 0`) and `parseVideos` maps the response to `watch` Resources keyed by the canonical `https://www.youtube.com/watch?v=<id>` URL. This change lets search borrow that path for a playlist URL it discovers, instead of standing up a new Source kind for something the user never configured.

Constraints: Bun runtime; adapters emit Resources only and stay idempotent by canonical URL; one failing unit never aborts the batch (adapter-authoring); `worker` may import within itself; `YOUTUBE_API_KEY` is already read by the `youtube` adapter; tests are offline/structural (no live network), matching `youtube.test.ts` / `search.test.ts`.

## Goals / Non-Goals

**Goals:**
- A `youtube.com/playlist?list=<id>` search result expands into its member videos as `watch` Resources, via the exact `playlistItems` path and `parseVideos` mapping the `youtube` Source uses — so expanded videos dedupe against a `youtube` Source's videos by canonical URL.
- Reuse, not duplication: search borrows YouTube URL knowledge and the fetch from `youtube.ts`; no second copy of playlist parsing or the Data API call.
- Graceful degradation: no `YOUTUBE_API_KEY`, or a single playlist that errors, keeps the original playlist `read` Resource and never drops the other search results.
- Zero new surface: no Source kind, no schema, no dependency, no scheduler — expansion runs inside the existing search flow, at query-generation cadence.

**Non-Goals:**
- **Keyless Atom expansion for search-discovered playlists.** The `youtube` Source kind degrades to the playlist Atom feed when unkeyed; search does not. A search-discovered playlist without a key stays the opaque `read` link. Adding the Atom path here is a second code path for a case the `youtube` Source already covers when a user actually wants that playlist tracked.
- **Expanding `youtube.com/watch?v=…&list=…` results.** A watch URL that merely carries a `list` param is already one watchable video; it lands as its own Resource. Pulling its entire playlist from an incidental result would balloon unrelated content. Only the `/playlist` page is expanded.
- **A per-scan cap on expanded videos.** `MAX_RESULTS` already bounds each playlist to 25, and curation scores/filters downstream. A global cap is deferred until a real scan shows bloat.
- Per-Source config to toggle expansion — nothing configures it; it is unconditional behavior of the scout.

## Decisions

**Expansion is a post-merge pass inside `searchAdapter`, not a new adapter or Source kind.**
The playlist was surfaced by a search query; it has no `sources` row and no `runTopicScan` dispatch. So expansion belongs where the result is produced: after Exa results are merged and deduped, `searchAdapter` walks the merged Resources, and for each one whose URL is a playlist, swaps the single `read` Resource for the playlist's `watch` Resources. Doing it post-merge means a playlist that several queries returned is deduped to one entry and expanded once. The alternative — a `playlist` Source kind, or a `runTopicScan` hook that re-dispatches — adds registry, schema, and orchestration surface for a transformation that is intrinsic to what search returns.

**`youtube.ts` exposes a pure `playlistIdFromUrl(url)` and its existing `fetchVideos`; search imports both.**
YouTube URL shape and the `playlistItems` call are YouTube-domain knowledge, so they live in `youtube.ts`. `playlistIdFromUrl` parses with the `URL` API: a YouTube host (`youtube.com` / `www.` / `m.`) plus a `/playlist` pathname returns the `list` query param; anything else returns null. `fetchVideos` (currently a private function) is exported unchanged. `searchAdapter` reads `Bun.env.YOUTUBE_API_KEY` itself (it already reads `EXA_API_KEY`) and calls `fetchVideos(id, key)`. The alternatives are worse: re-parsing playlist URLs or re-implementing the Data API call inside `search.ts` invites drift from the canonical `watch?v=` key that makes cross-Source dedupe work; a single combined `expandPlaylistUrl(url)` helper in `youtube.ts` couples URL detection to a network call, so the detection can't be unit-tested offline.

**No-key and per-playlist errors keep the original `read` Resource; `fallbackMode` stays unset.**
Search has no keyless mode, so it sets no `fallbackMode` (unchanged). When `YOUTUBE_API_KEY` is absent, expansion is skipped and the playlist keeps its `read` Resource — a working link is strictly better than dropping it. When one playlist's `fetchVideos` throws (private, deleted, 404, timeout), that playlist alone falls back to its `read` Resource while the other results and expansions proceed — the adapter-authoring "one failure never aborts the batch" rule, applied within the Source. Expansions run in parallel and each is caught independently (`Promise.allSettled`, or a per-playlist try/catch that returns the original Resource on reject).

**Cost and the Resource shape are unchanged.**
`playlistItems` is quota-metered at dollar `cost: 0`, so search's reported cost stays the Exa total. Expanded videos are `watch` Resources with `contentHash: null` and the video description as the native snippet — exactly what `parseVideos` already emits — so curation treats them like any `youtube` Source video.

**Testing: the URL detector is the new pure seam.**
`playlistIdFromUrl` is pure and offline-testable — a test in `youtube.test.ts` asserts playlist URL variants (`youtube.com` / `www.` / trailing params) map to the id, while `/watch?v=…&list=…`, non-YouTube hosts, and a `/playlist` with no `list` param map to null. `parseVideos` is already covered. The expansion wiring in `searchAdapter` is a thin live wrapper `tsc -b` type-checks and no test exercises over the network, matching the established offline-test decision for the adapters.

## Risks / Trade-offs

- **Playlist explosion** (a scan returning many playlists, each up to 25 videos) → bounded per playlist by `MAX_RESULTS = 25`, and curation scores and filters the pool. A global per-scan cap is deferred, not designed away; add one if a real scan shows bloat.
- **`YOUTUBE_API_KEY` set but a playlist is private / region-locked / deleted** → `fetchVideos` throws or returns empty; isolated to that playlist, which keeps its `read` link. No effect on other results.
- **A `/playlist` URL whose `list` value is malformed** → the Data API call 404s, caught per-playlist, link kept — same degradation path, no special-casing needed.
- **Expanded videos change the search Source's output kind mix** (`watch` alongside `read`) → intentional and correct; the canonical `watch?v=` key keeps them idempotent and dedupe-safe against `youtube` Sources.

## Migration Plan

No schema, no dependency, no env change. Steps: export `fetchVideos` and add `playlistIdFromUrl` in `worker/adapters/youtube.ts`; add the post-merge expansion pass in `worker/adapters/search.ts`; add the `playlistIdFromUrl` cases to `youtube.test.ts`. Verification gate: `bunx biome check . && bunx tsc -b && bun test` — the detector test runs offline. A live smoke (real Exa returning a playlist + a real key) is manual under `doppler run`, since tests never touch the network. Rollback: revert the two source files and the test; nothing else references the new export.

## Open Questions

- **Cap expanded videos per scan?** Start uncapped (25/playlist, curation filters); add a scan-level ceiling only if observed scans balloon.
- **Should a `/watch?v=…&list=…` result also pull its playlist?** No for MVP — the single video already lands. Revisit only if evals show single-video hits should drag in their playlist context.
