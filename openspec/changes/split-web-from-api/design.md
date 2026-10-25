## Context

Split from the apps-and-packages-restructure change, whose phase one shipped as 8b92e486; this is its phase two. It
is unapplied: an apply on 2026-10-22 measured the render path first, found it under the warning, and shipped only the
attachment extraction, as `extract-attachment-text-in-a-worker`. The measurements are in the appendix.

- One Northflank service, `app`, renders every page through the ui's server build, calls its own `/api` routes over
  loopback, draws preview and cover images with satori and resvg on a cache miss, streams avatars, attachments, and
  favicons from R2, and holds every SSE chat stream, all on one event loop. After Cloudflare, Redis, and two
  replicas, the event loop reads 6 to 10 ms p99 at 50 concurrent feed requests, and the minute line warns past a
  100 ms p99 and a 2 s stall. The case for this change is a render burst from shared links, not steady load.
- Northflank supports path-based routing on a domain: paths in exact, prefix, or regex mode, each to a service and
  port, evaluated by priority. Cloudflare's origin rules can override the destination port on every plan, but the Host
  header override, which routing by path to a second origin would need, is Enterprise-only.

## Goals / Non-Goals

**Goals:**

- Pages, documents, feeds, docs, and generated images served by a `web` service and `/api`, `/mcp`, and the streams by
  the `app` service, from one image, with the `app` service still able to serve every path, so the cutover and the
  rollback are a routing change.

**Non-Goals:**

- Removing the pages mount from `apps/api` after the flip. It stays, so a rollback is always one routing change.

## Decisions

### 1. The `web` service and the pages package

The page routes that `api/index.ts` and `api/api.ts` serve today move into `@carlnotes/pages`, a server package both
apps mount: the static roots and the ui render with its page guards, render concurrency, and page rate limiters
(`index.ts`'s page chain), `content.ts`, `documents.ts`, `seo.ts`, `jsonLd.ts`, the release pages split from the
GitHub webhook in `releases.ts`, `share/*`, `avatars.ts` and `avatarsRoute.ts`, `favicons.ts`, the podcast feed and
cover routes in `podcast/podcastFeeds.ts`, `nightshift.ts` with the component browser's root in `bundlePaths.ts`,
`botAnalytics.ts`, `edgeCache.ts`, `trustedProxies.ts`, and
`requestTracing.ts`. `apps/api/index.ts` mounts it exactly where it mounted the routes, so the `app` service serves
every path as before. `apps/web/server.ts` is a second Hono entry: the health routes, the pages package, and the ui
render from `apps/web/dist`, started by `bun run web` on the same image. Its loaders reach the api through
`API_ORIGIN`, the `app` service's Northflank internal hostname, recorded in this design at apply; the ui to api
boundary stays types only.

Routing is Northflank path routing on the domain, chosen over a Cloudflare origin rule because the Host header override
such a rule needs is Enterprise-only. Routes, highest priority first: regex
`^/api/(topics|profiles|teams|invites|episodes)/[^/]+/(preview|card)\.png$` and prefixes `/api/podcast-covers`,
`/api/podcast-feeds`, `/api/favicons`, `/api/avatars`, `/api/team-avatars` → `web`; prefixes `/api`, `/mcp`,
`/.well-known/oauth-authorization-server`, `/.well-known/oauth-protected-resource` → `app`; base path `/` → `web`. No
path changes, so every Cloudflare cache rule and the `/api/` bypass keep their meaning, and a route that sends a path to
the service the design did not intend reaches a process that still serves it: the cost is load placement, never a failed
request. Rollback is pointing `/` back at `app` and removing the other routes. `release-main.json` gains a `deploy-web`
Release step after `deploy-app`, applied with `northflank create workflow`.

Each service answers `/api/health` and `/api/health/deep` on its own port, which is what Northflank probes; the uptime
monitor watches each service's deep check through that service's own `code.run` hostname. The default pool count in
`packages/db/index.ts` goes from 8 to 11, counting two web replicas and one more overlap, and `DATABASE_POOL_COUNT` in
Doppler prd is set to the sum at both services' autoscaling maximum (manual step 18). The `web` service writes the
minute gauge line under its own process name. The oha load test from the request-path change runs against the app's
`code.run` url with a few chat streams held open before phase two (manual step 4) and again after the flip against both
services, and both p99 readings are recorded here.

### 2. The web service's root script and the client's server base url

| Northflank resource | Command |
|---|---|
| `web` service | `bun run web`, which is `doppler run -- bun apps/web/server.ts` |

Phase two adds `web` and, for symmetry with it, `api` (`doppler run -- bun apps/api/index.ts`) as root scripts; the
`app` service keeps starting from `CMD`.

`apps/web/src/lib/webApiClient.ts` holds the server render's api base url, `http://localhost:3000`. Phase two reads the
server value from `API_ORIGIN` with that default.

## Risks / Trade-offs

- [A path route sends a path to the other service] → both services serve every page path, so the cost is load
  placement, visible in the gauge lines, never a failed request.

## Migration Plan

Ship the pages package, `apps/web/server.ts`, and the pool default; the `app` service still serves
every path. Create the `web` service from the build image with `bun run web`, size both services, add `deploy-web` to
`release-main`, raise `DATABASE_POOL_COUNT` in Doppler prd and restart every prd process, then add the path routes.
Confirm a public page answers `cf-cache-status: HIT` on its second request and the chat stream and `/api/*` still bypass
the cache. Point the uptime monitor at both deep checks. Rerun the load test. Rollback is pointing `/` back at `app`
and removing the routes (manual steps 16 to 21).

The load test baseline before this change is recorded in the archived apps-and-packages-restructure design: 77 requests
per second and a p99 of 2.27 s on `/api/topic-feed`, measured 2026-10-21.

## Open Questions

**How the web service gets its routes.** The 2026-10-22 apply found two problems with decision 1's pages package, and
the next apply decides between it and a second process name before it starts:

- The modules decision 1 lists reach about 70 api modules through their imports. `podcast/podcastEpisodeRows.ts`
  imports `topic/helpers.ts`, which reaches `invite/invites.ts`, `topic/featuring.ts`, `topic/feeds.ts`, and from there
  `topic/saveTopic.ts` and the invite emails. `authorization.ts` would move into a package named `pages`. Cutting the
  closure means extracting `topicSubscriptionStartDate`, `toInviteTarget`, `countDistinctSubscribers`, and
  `toStoredFileHeaders` into small modules first, and it still moves `authorization.ts` and the podcast episode rows.
- The routing table sends the prefixes `/api/avatars`, `/api/team-avatars`, and `/api/podcast-feeds` to `web`. Those
  prefixes also carry the signed-in avatar uploads and the podcast feed reset, so a web server without the session and
  auth stack fails them. The risk below, that a mis-routed path still reaches a process that serves it, holds only if
  `web` serves every path. The package option needs routes that name the image paths exactly.

The alternative is that `bun run web` starts `apps/api/index.ts` itself under the process name `web`, with
`API_ORIGIN` pointing its server renders at `app`. Both services then serve every path, the routing table and the
rollback work as written, and the change shrinks to the process name, the client base url, the pool count, the release
step, and the docs. The spec deltas would then drop the pages package and `apps/web`'s server from `static-serving`.

The values only a dashboard knows are known now: the `app` service's internal hostname is `app` on port 3000, so
`API_ORIGIN` is `http://app:3000`, and its public `code.run` hostname is `p01--app--7bh2h7cn7nbq.code.run`. It runs two
instances on `nf-compute-100-2` with no autoscaling.

## Appendix: measurements, 2026-10-22

Against production's `app` service, two replicas, from one address, through `p01--app--7bh2h7cn7nbq.code.run` so
Cloudflare did not cache the page. The page was `/topics/feed7979-a4a3-48d1-8fc0-ac34b07ca71d/dev-tools-for-builders`.
No chat stream was held open, since every stream needs a signed-in session. Each row reads the minute gauge lines of
the two replicas.

| Run | Responses | Event loop p99 | Largest delay |
|---|---|---|---|
| The prior 1,000 minute lines, about 8 hours | — | 17 ms at most, 0 ms median | 1,324 ms in one minute |
| `oha -n 120 -c 50`, a 2.2 s burst | 40 rendered, 78 shed at the render limit, 2 rate limited | 3 ms, 2 ms | 282 ms, 316 ms |
| `oha -z 62s -q 2 -c 16`, the per-address render limit for a minute | 123 rendered, 1 rate limited, 374 ms average | 10 ms, 6 ms | 40 ms, 32 ms |

The rerun after a routing flip has not happened, since this change is unapplied.
