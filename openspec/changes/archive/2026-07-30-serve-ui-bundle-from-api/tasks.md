# Tasks

## 1. Serve the bundle

- [x] 1.1 Import `serveStatic` from `hono/bun` in `api/index.ts`.
- [x] 1.2 Mount static serving for `ui/dist` after the `/api` route tree, so an unmatched `/api` path is answered by the API's own 404 and never reaches static or fallback handling.
- [x] 1.3 Set cache headers in `onFound`: `public, max-age=31536000, immutable` for paths under `assets/`, `no-cache` for everything else.

## 2. Fall back to the app shell

- [x] 2.1 Add a `GET`/`HEAD` fallback outside `/api` that answers `index.html` with `Cache-Control: no-cache`.
- [x] 2.2 Answer 404 when `ui/dist/index.html` is absent, so `bun run dev:api` still starts and serves the API with no bundle built.

## 3. Prove the rules that are easy to break

- [x] 3.1 Test that an unknown `/api` path answers a JSON 404 and not `index.html`.
- [x] 3.2 Test that an unknown non-API `GET` answers `index.html`.
- [x] 3.3 Test that a `POST` to an unknown path answers 404 rather than the shell.
- [x] 3.4 Test the cache headers: immutable for a hashed asset, `no-cache` for the shell.

## 4. Verify

- [x] 4.1 Run the gate: `bash scripts/preflight.sh`.
- [x] 4.2 Build the image and confirm a container serves `/`, a deep link, and a hashed asset with the right cache header, while an unknown `/api` path still answers JSON.
