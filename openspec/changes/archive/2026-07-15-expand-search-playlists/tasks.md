## 1. YouTube reuse seam

- [x] 1.1 In `worker/adapters/youtube.ts`, export the existing `fetchVideos(playlistId, apiKey)` (no behavior change) so search can call the same `playlistItems` path
- [x] 1.2 Add a pure `playlistIdFromUrl(url: string): string | null`: parse with `URL`; return the `list` query param when the host is YouTube (`youtube.com` / `www.` / `m.`) and the pathname is `/playlist`; return null for a non-YouTube host, a `/watch` URL (even with a `list` param), or a `/playlist` with no `list`; return null instead of throwing on an unparseable URL
- [x] 1.3 Extend `worker/adapters/youtube.test.ts`: assert `playlistIdFromUrl` maps playlist URL variants (`youtube.com`, `www.`, extra params) to the id and maps `/watch?v=…&list=…`, a non-YouTube host, and a `/playlist` with no `list` to null

## 2. Search adapter expansion

- [x] 2.1 In `worker/adapters/search.ts`, after Exa results are merged and deduped, add an expansion pass: read `Bun.env.YOUTUBE_API_KEY` once; for each merged Resource whose URL is a playlist (`playlistIdFromUrl`), when the key is set, replace that Resource with `fetchVideos(id, key)`'s `watch` Resources; when the key is absent, keep the original `read` Resource
- [x] 2.2 Isolate each expansion: run the playlist expansions in parallel and catch per playlist (`Promise.allSettled` or a per-item try/catch), keeping the original `read` Resource when one playlist's `fetchVideos` rejects — one failure never drops the other results
- [x] 2.3 Merge the expanded `watch` Resources back through the same URL-keyed dedupe (canonical `watch?v=` key), so a playlist's videos collapse against a `youtube` Source's videos and the playlist page URL is not emitted when it was expanded; `cost` and `fallbackMode` are unchanged

## 3. Verify

- [x] 3.1 Run the gate: `bunx biome check . && bunx tsc -b && bun test`
- [ ] 3.2 Live smoke — **manual gate (owner: repo maintainer)**: under `doppler run` with `YOUTUBE_API_KEY` and Exa set, scan a topic whose search surfaces a `youtube.com/playlist` result and confirm the playlist lands as its member `watch` Resources (not one `read` link); validates the live Exa → `playlistItems` path the offline gate can't exercise
- [x] 3.3 Add an owner-run search smoke: `worker/search.smoke.ts` seeds a topic + `search` Source and runs `searchAdapter` (exercising the playlist-expansion path end-to-end), asserting well-formed Resources plus positive Exa cost; wire `smoke:search` into `package.json` and the README Development section, folded into the aggregate `smoke`
