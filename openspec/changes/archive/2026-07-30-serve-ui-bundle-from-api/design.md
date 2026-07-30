## Context

`api/index.ts` builds one Hono app at `basePath("/api")` and exports `{ port: 3000, fetch: route.fetch }`. Vite serves the UI on :5173 in dev and proxies `/api` to :3000, so nothing has ever needed the server to return HTML. The container changes that: it runs the single exported fetch handler with `ui/dist` sitting beside it, and every non-API path 404s.

Vite builds to `ui/dist` with hashed asset filenames (`assets/index-C3Cn5oAz.js`), an unhashed `index.html`, and unhashed public files copied through (`carl-hero.png`).

## Goals / Non-Goals

**Goals:**
- One process serves the API and the UI, matching what the Dockerfile already assembles.
- A reader can deep-link to any client route and get the app.
- A wrong or removed API path still fails as an API failure, not as a page.
- A deploy is visible on the next request without a hard refresh.

**Non-Goals:**
- Server-side rendering. The SPA stays a client-rendered bundle.
- A CDN or separate static host. Northflank serves this container directly.
- Changing dev, which keeps Vite on :5173 proxying `/api`.
- Compression or precompressed assets. Northflank's ingress terminates that.

## Decisions

### serveStatic from `hono/bun`, not the generic middleware

Hono ships `serveStatic` in three places: a generic one under `hono/middleware`, and runtime adapters under `hono/bun` and `hono/deno`. The generic export is explicitly not for direct use — it requires the caller to supply `getContent`. The Bun adapter supplies it via `Bun.file`, which streams from disk and sets `Content-Type` from the extension.

Chosen: `import { serveStatic } from "hono/bun"`. The runtime is Bun everywhere this runs, and the adapter is the supported path. No new dependency: Hono is already a direct dependency.

Rejected: reading files by hand with `Bun.file` and a route. It would mean reimplementing MIME lookup, range requests, and 404 handling that the middleware already does.

### Cache headers split by whether the filename is content-hashed

Vite fingerprints everything under `assets/`, so a given URL's bytes never change. `index.html` is the opposite: its URL is stable and its contents change on every deploy, because it carries the hashed asset URLs.

Chosen, set in `onFound`:
- `assets/*` → `Cache-Control: public, max-age=31536000, immutable`. A year, never revalidated. Safe precisely because a content change produces a new filename.
- everything else served statically, including `index.html` and public files like `carl-hero.png` → `Cache-Control: no-cache`. Not "no store" — the browser may keep it, but must revalidate before use, so a deploy is picked up on the next request and an unchanged file still answers 304.

The fallback response for client routes is `index.html` and carries the same `no-cache`, for the same reason.

Rejected: one policy for the whole bundle. A short max-age on hashed assets throws away the only real caching win; a long max-age on `index.html` pins readers to a stale bundle after every deploy.

### The fallback is mounted so it cannot see `/api/*`

This is the requirement most likely to be got wrong, and the failure is quiet: a catch-all that returns `index.html` for anything unmatched turns every mistyped or retired API path into a 200 with an HTML body. A fetch client then fails on JSON parse instead of reading a 404, and a genuinely missing route looks like a working page.

Chosen: the existing `/api` route tree is registered first and keeps its own 404. The static middleware and the fallback are registered after it and scoped to paths outside `/api`, so an unmatched `/api/*` path is answered by the API's own 404 and never reaches the fallback. The fallback also only answers `GET`/`HEAD`; a `POST` to an unknown path is a 404, not a page.

Rejected: a `notFound` handler that inspects the path and branches. It puts the API/SPA split in one conditional far from both, and it is the exact shape that silently starts matching `/api` when someone edits the condition.

### A missing bundle degrades instead of crashing

In dev the server runs with no `ui/dist` at all. Static lookups miss, and the fallback has no `index.html` to return. It must answer a plain 404 rather than throwing, so `bun run dev:api` behaves as it does today.

## Risks / Trade-offs

- **The fallback is only as good as its scoping.** If a later edit widens it to `/api`, API 404s silently become HTML. The spec pins this as its own scenario, and a test asserts an unknown `/api` path still answers JSON.
- **`no-cache` on `index.html` costs a revalidation round trip per navigation.** That is the price of deploys being visible immediately; the document is ~1 kB and answers 304 when unchanged.
- **`immutable` is unforgiving if Vite's hashing is ever turned off.** Then a changed asset keeps its URL and readers hold a year-old file. Tied to Vite's default `assets/[name]-[hash]` output, which this repo does not override.
- **Serving static files from the app process spends its event loop on bytes a CDN could serve.** Acceptable for one container on Northflank, and revisitable by putting a CDN in front without touching this code.
