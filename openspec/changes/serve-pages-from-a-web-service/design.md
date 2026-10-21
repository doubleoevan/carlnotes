## Context

Split from the apps-and-packages-restructure change, whose phase one shipped as 8b92e486; this is its phase two.
Measured on 2026-10-20:

- One Northflank service, `app`, renders every page through the ui's server build, calls its own `/api` routes over
  loopback, draws preview and cover images with satori and resvg on a cache miss, streams avatars, attachments, and
  favicons from R2, runs `extractText` on a chat attachment of up to 14 million data-url characters before the turn
  starts, and holds every SSE chat and note stream, all on one event loop. The request-path load test measured 290 ms
  of event-loop lag at 50 concurrent feed requests; the minute line warns past a 100 ms p99 and a 2 s stall.
- Northflank supports path-based routing on a domain: paths in exact, prefix, or regex mode, each to a service and
  port, evaluated by priority. Cloudflare's origin rules can override the destination port on every plan, but the Host
  header override, which routing by path to a second origin would need, is Enterprise-only.

## Goals / Non-Goals

**Goals:**

- Pages, documents, feeds, docs, and generated images served by a `web` service and `/api`, `/mcp`, and the streams by
  the `app` service, from one image, with the `app` service still able to serve every path, so the cutover and the
  rollback are a routing change. Attachment text extraction off the api's event loop.

**Non-Goals:**

- Removing the pages mount from `apps/api` after the flip. It stays, so a rollback is always one routing change.

## Decisions

### 1. The `web` service and the pages package

The page routes that `api/index.ts` and `api/api.ts` serve today move into `@carlnotes/pages`, a server package both
apps mount: the static roots and the ui render with its page guards, render concurrency, and page rate limiters
(`index.ts`'s page chain), `content.ts`, `documents.ts`, `seo.ts`, `jsonLd.ts`, the release pages split from the
GitHub webhook in `releases.ts`, `share/*`, `avatars.ts` and `avatarsRoute.ts`, `favicons.ts`, the podcast feed and
cover routes in `podcast/podcastFeeds.ts`, `botAnalytics.ts`, `edgeCache.ts`, `trustedProxies.ts`, and
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

Chat attachment extraction moves to a Bun `Worker` thread inside `apps/api`: one persistent worker per process,
created on first use, given the content type and the bytes as a transferred `ArrayBuffer`, answering the text or the
error. It adds the transfer and one message round trip, under a few milliseconds, to the turn's wait, and the
extraction time it already took. A Temporal activity the turn awaits was rejected: it would add a workflow start and
a queue poll, hundreds of milliseconds to seconds, put a chat turn behind the worker service's health, and Temporal's
payload limit of 2 MB would route a 10 MB file through R2 first.

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

Ship the pages package, `apps/web/server.ts`, the worker thread, and the pool default; the `app` service still serves
every path. Create the `web` service from the build image with `bun run web`, size both services, add `deploy-web` to
`release-main`, raise `DATABASE_POOL_COUNT` in Doppler prd and restart every prd process, then add the path routes.
Confirm a public page answers `cf-cache-status: HIT` on its second request and the chat stream and `/api/*` still bypass
the cache. Point the uptime monitor at both deep checks. Rerun the load test. Rollback is pointing `/` back at `app`
and removing the routes (manual steps 16 to 21).

The load test baseline before this change is recorded in the archived apps-and-packages-restructure design: 77 requests
per second and a p99 of 2.27 s on `/api/topic-feed`, measured 2026-10-21.

## Open Questions

None that block the apply. The values only a dashboard knows, the `app` service's internal hostname and the autoscaling
maximums, are confirmed in the console at the manual steps that need them and recorded in this design when known.
