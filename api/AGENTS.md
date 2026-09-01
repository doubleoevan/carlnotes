# api/

Hono server. Entry `api/index.ts` mounts the route trees; `api/api.ts` aggregates the `/api` routes.

- Domain folders: `topic/`, `team/`, `chat/`, `invite/`, `note/`, `share/`. Root files serve more than one domain
  (auth, billing, admin, avatars, profiles, SEO pages, and `content.ts` for the blog under `content/blog/`).
- `releases.ts` — the `/releases` index and each release's own page, both
  rendered through `content.ts`, plus the signed GitHub webhook that upserts the rows they read.
  `releases.sync.ts` (`bun run sync:releases`) re-reads the GitHub API through the same write, which
  seeds history and repairs a missed delivery. The convention for writing one is `docs/release-notes.md`.
- `note/` — the tasting-notes routes and their yjs sync: `notes.ts` (page payload, snapshot, updates, stream),
  `noteCommentThreads.ts` (comment writes), `noteStream.ts` (fan-out), `permissions.ts` (visibility access),
  `noteBadges.ts` (the unread edit and comment counts, and the read time that clears them).
- Every authority answer routes through `authorization.ts` and the role helpers; inline
  `role ===` / `plan ===` comparisons are banned outside it (`authorization.test.ts` greps).
- Request bodies validate with zod payloads from `shared/contracts.ts` via `zValidator`.
- A private or team read the user may not see answers 404, never 403; the invite gate keeps its 403.
- Dev: `bun run dev:api` (doppler, port 3000). Tests: `bun test api`; `*.smoke.ts` run under `doppler run`.
