## Why

The app service ships as one container that is meant to serve both the UI and the API, and its own code says so: `api/index.ts` closes with "in prod, one service serves both the ui and the api". It does not. The Hono app is mounted at `basePath("/api")`, nothing reads `ui/dist`, and there is no root route. A container built from the new Dockerfile answers `/api/*` correctly and returns 404 for `/`, `/topics/:id`, and every other page a reader can reach, so the SPA never loads.

The Dockerfile already copies the built bundle into the runtime image, so the artifact is present and unused. This change is the missing half.

## What Changes

- Serve the built UI bundle from the same Hono app that serves the API, so one process answers both.
- Add a SPA fallback so client-routed paths (`/topics/:id`, `/activity`, `/pricing`) return `index.html` instead of 404.
- Scope the fallback so it never answers for `/api/*`: a genuine API 404 stays a JSON 404 and never becomes an HTML page.
- Cache hashed assets immutably for a year, and revalidate `index.html` on every request, so a deploy is picked up immediately while assets are cached hard.
- **No change to any existing API route, status code, or response shape.**

## Capabilities

### New Capabilities
- `static-serving`: how the app service serves the built UI bundle, what it caches, and how client-routed paths resolve without swallowing API 404s.

### Modified Capabilities

None. Every existing `/api/*` route keeps its current behavior, so no existing spec's requirements change.

## Impact

- `api/index.ts`: static middleware and the fallback mount alongside the existing `/api` route tree. The exported `AppType` the UI's typed client builds from is unaffected, since it is derived from the `/api` routes only.
- Runtime dependency on `ui/dist` existing next to the server. In the image the Dockerfile guarantees it; in local dev Vite serves the UI on :5173 and proxies `/api`, so the bundle is absent and the fallback must degrade without crashing.
- No new package: `serveStatic` ships with Hono, which is already a dependency.
- No database, contract, or environment change.
