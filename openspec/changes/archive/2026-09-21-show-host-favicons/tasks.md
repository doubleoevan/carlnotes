## 1. Storage

- [x] 1.1 `favicons` table keyed by host: the stored object's key and content type, both null until a fetch stores one, and when it was fetched. Migration
- [x] 1.2 `toFaviconKey(host)` in `worker/store.ts`, beside the other object keys

## 2. Fetch and store

- [x] 2.1 `FetchResult.faviconUrl` from Firecrawl's metadata, resolved against the page url; null on every other fetch path
- [x] 2.2 `worker/favicons.ts`: `fetchAndStoreHostFavicon(host, faviconUrl)`. Skips a row fetched within thirty days, fetches through the public-url guard, tries the root icon, the page's icon, the root svg and touch icon, then the www or bare sibling's three, keeps only an image type, the link preview types plus ico and svg, at most 256 KB, stores it, and writes the row either way, keeping a stored icon through a failed fetch
- [x] 2.3 Start it from `fetchAndStoreContent` after the content is stored, without awaiting it, and settle every fetch under way at the end of the review batch, so an icon never fails or delays a score
- [x] 2.4 Tests: the thirty-day rule, the candidate order, an ico and an svg are kept, an oversized icon is rejected, a failed fetch keeps the stored icon
- [x] 2.5 `worker/publicFetch.ts`: an ipv6-mapped ipv4 in the hex spelling is judged as the ipv4 it wraps, with tests

## 3. Serving and payloads

- [x] 3.1 `GET /api/favicons/:host` in `api/favicons.ts`, mounted ahead of the session middleware like the health check: the stored-file headers, a month-long public `Cache-Control`, a content security policy that allows nothing, and a same-origin resource policy; 404 for an unknown host or a remembered failure
- [x] 3.2 `faviconPath` on the Finding and the link preview contracts, and each loader reads the host's row to fill it
- [x] 3.3 Test: the path encodes the host

## 4. The ui

- [x] 4.1 `HostFavicon` in `ui/src/components/common/`: the `<img>` in a round chip at the text's icon size with an empty alt, with a muted `Globe` in the chip until it loads and when the path is null or the image errors
- [x] 4.2 The feed row's metadata line shows it before the host, in both row variants
- [x] 4.3 The link preview card shows it before its host
- [x] 4.4 Test: the fallback renders for a null path

## 5. Docs

- [x] 5.1 `worker/AGENTS.md` names `favicons.ts`; `api/AGENTS.md` lists favicons among the root files
