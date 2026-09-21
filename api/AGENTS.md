# api/

Hono server. Entry `api/index.ts` mounts the route trees; `api/api.ts` aggregates the `/api` routes.

- Domain folders: `topic/`, `team/`, `chat/`, `invite/`, `note/`, `share/`, `tool/`, `mcp/`. Root files serve more than one domain
  (auth, billing, admin, avatars, favicons, profiles, SEO pages, and `content.ts` for the blog under `content/blog/`).
- `releases.ts` — the `/releases` index and each release's own page, both
  rendered through `content.ts`, plus the signed GitHub webhook that upserts the rows they read.
  `releases.sync.ts` (`bun run sync:releases`) re-reads the GitHub API through the same write, which
  seeds history and repairs a missed delivery, and `releases.preview.ts` (`bun run releases:preview`) stores a
  local notes file through it for reading on the dev server. The convention for writing one is `docs/release-notes.md`.
- `note/` — the tasting-notes routes and their yjs sync: `notes.ts` (page payload, snapshot, updates, stream),
  `noteCommentThreads.ts` (comment writes), `noteStream.ts` (fan-out), `permissions.ts` (visibility access),
  `noteBadges.ts` (the unread edit and comment counts, and the read time that clears them).
- `mcp/` — the mcp server: `server.ts` (the `/mcp` and `/mcp/t/:topicId` routes and the transport), `tools.ts` (the tools it registers, with their schemas and annotations), `toolCaller.ts` (the tool caller: the visitor or user a bearer token resolves to), and
  `results.ts` (what each tool returns for a visitor or a user, paged under a client's result limit).
- `tool/` — `topicTools.ts` (the Topic Tools, each with its own gate check) and the chat adapters in
  `chatTools.ts`: the edit tools bound to a chat's topic, and the draft tools of the new-topic chat. The mcp adapter is
  in `mcp/tools.ts`.
- `topic/promptVersions.ts` — the Prompt Version write the editor's save and the Topic Tools share.
- `topic/topicDrafts.ts` — the new-topic chat's Topic Draft row, written by the chat turn that changed it and read
  back when the conversation loads.
- `rateLimit.ts` — the one per-tool-caller rate limit, shared by the chat turn routes and the mcp routes, keyed by the
  user or by the client address `trustedProxies.ts` vouches for.
- Every authority answer routes through `authorization.ts` and the role helpers; inline
  `role ===` / `plan ===` comparisons are banned outside it (`authorization.test.ts` greps).
- Request bodies validate with zod payloads from `shared/contracts.ts` via `zValidator`.
- A private or team read the user may not see answers 404, never 403; the invite gate keeps its 403.
- Dev: `bun run dev:api` (doppler, port 3000). Tests: `bun test api`; `*.smoke.ts` run under `doppler run`.
