## Why

Every finding in the feed names the site it came from as plain text, and every link preview card names the host it
points at the same way. A user scanning thirty findings tells the sources apart by reading each host name. The
site's own icon is what every browser tab, feed reader, and link unfurl uses to make a source recognizable at a
glance, and Firecrawl already returns its url with every page we scrape. We throw it away.

## What Changes

When review fetches a page, the worker keeps the host's favicon. It fetches the icon Firecrawl names through the
public-url guard, stores it once per host, and remembers a host whose icon could not be fetched, so the next scan
does not try again for a month. The api serves a host's icon from our own origin with a month-long cache lifetime,
and the Finding and the link preview each include the path to theirs. The feed row and the link preview card
show the icon beside the host name, and a muted globe glyph where there is none, the fallback every browser tab
uses.

No icon is ever loaded from a third party at render time, so a user's browser never tells anyone which sites they
follow. The scan email stays image-free.

## Capabilities

### New Capabilities

- `host-favicons`: a host's favicon is fetched and stored when review reads a page on it, stored once per host, served from our
  origin with a long cache lifetime, and shown beside the host name with a globe glyph as the fallback

### Modified Capabilities

_none_. The Finding and the link preview payloads gain one nullable field each, and every requirement they
already meet is unchanged.

## Impact

- `db/schema.ts`: a `favicons` table keyed by host, with the stored object's key and type and when it was fetched.
  A migration
- `worker/scrape.ts`: the fetch result includes the favicon url Firecrawl names
- `worker/favicons.ts`: fetching and storing a host's favicon, and the month-long freshness rule
- `worker/review/score.ts`: after a page's content is stored, its host's favicon is fetched and stored, best effort
- `api/favicons.ts`: the route that serves a stored favicon
- `api/topic/findings.ts`, the link preview loaders: each payload includes the host's favicon path
- `shared/contracts.ts`: `faviconPath` on the Finding and the link preview
- `ui/src/components/common/HostFavicon.tsx`: the icon with its globe fallback
- `ui/src/components/topic/TopicResource.tsx`, `ui/src/components/common/LinkPreviewCard.tsx`: show it beside the host
- no change to what is scanned, scored, or emailed
