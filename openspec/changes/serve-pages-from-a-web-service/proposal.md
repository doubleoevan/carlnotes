## Why

One process, the `app` service, puts page renders, generated images, and a 10 MB PDF's text extraction on the event
loop that holds every live chat stream. This is phase two of the apps-and-packages-restructure change, split out when
its phase one shipped.

## What Changes

**Render split at the deployment layer.** The page routes that the api serves today, the ui render, the blog, the
docs, the documents, the feeds, the share and cover images, the avatars, and the favicons, move into a server package
that both `apps/api` and a new `apps/web` server mount, so the `app` service keeps serving every path while a new
`web` service takes over pages through Northflank path routing. `apps/web`'s loaders call `apps/api` over Northflank's
private network. Chat attachment text extraction moves to a Bun worker thread in `apps/api`. The default pool count
grows to cover the web replicas, and each service answers its own health checks. Rolling back is pointing the base
path back at `app`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities
- `static-serving`: the one-process requirement becomes two services from one image, the web service serving pages and
  images and the api service keeping every path.
- `deploy-mechanics`: the replica and pool rule and the health checks cover the web service, and the web service is
  routed by path and rolls back by routing.
- `request-capacity`: the default pool count counts the web service's replicas.
- `performance-telemetry`: the minute gauge line is written by the web service too.
- `docs-site`: the built docs are served by the web service, and the app service keeps serving them.
- `topic-chat`: attachment text is extracted off the event loop.

## Impact

- Adds `packages/pages` and `apps/web/server.ts`, and the `web` and `api` root scripts.
- Northflank: adds the `web` service, its path routes, and its release step, and raises `DATABASE_POOL_COUNT`.
