## Why

One process, the `app` service, puts page renders and generated images on the event loop that holds every live chat
stream. On 2026-10-22 a render burst at the render limit measured an event loop p99 of 10 ms at most, a tenth of the
minute line's 100 ms warning, so this change waits, unapplied, until render load moves that reading. The stall that did
cross the warning, attachment text extraction, shipped on its own as `extract-attachment-text-in-a-worker`. This is
phase two of the apps-and-packages-restructure change, split out when its phase one shipped.

## What Changes

**Render split at the deployment layer.** A new `web` service takes over pages, documents, feeds, docs, and generated
images through Northflank path routing, from the same build image, while the `app` service keeps serving every path.
The web service's server renders call `apps/api` over Northflank's private network. The default pool count grows to
cover the web replicas, and each service answers its own health checks. Rolling back is pointing the base path back at
`app`. The design's open question is how the web service gets its routes: a pages package, or the api's own entry
started under a second name.

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

## Impact

- Adds the `web` and `api` root scripts, and either `packages/pages` with `apps/web/server.ts` or a second process name
  for `apps/api/index.ts`.
- Northflank: adds the `web` service, its path routes, and its release step, and raises `DATABASE_POOL_COUNT`.
