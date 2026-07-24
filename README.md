# CarlNotes

**He already read it. All of it.**

Carl keeps track of everything. He just needs you to ask. Carl doesn't sleep. He reads and drinks coffee. And when you drop by, he has updates for you.

Give Carl three topics. You know the ones.

Carl stays up. You stay informed.

> **Status: early development.** The scaffold is real; the product is being built change-by-change via [OpenSpec](https://github.com/Fission-AI/OpenSpec) — see `openspec/`.

## Stack

Bun + TypeScript · React SPA (Vite + Tailwind + shadcn) · Hono · Drizzle + Neon Postgres (pgvector) · Temporal · LiteLLM → Fireworks · Vercel AI SDK + Zod · Exa + Firecrawl · Langfuse

## Layout

Modular monolith — one `package.json`, one deploy:

- `ui/` — React SPA
- `api/` — Hono HTTP layer
- `worker/` — Temporal workflows and source adapters
- `db/` — Drizzle schema and migrations

Domain vocabulary is load-bearing and lives in `.agents/skills/domain-model/`.

How the AI guardrails work: [docs/ai-scaffolding.md](docs/ai-scaffolding.md).

## Development

```bash
bun install
bun run dev:ui       # Vite dev server (UI); wraps itself in doppler run
bun run dev:api      # Hono API; wraps itself in doppler run for DATABASE_URL; the Vite dev server proxies /api here
bun run build:ui     # production build (no doppler, so it runs in CI and deploys)
```

The homepage needs both `dev:ui` and `dev:api` running, plus a seeded dev database (below). The dev, db, and smoke scripts wrap themselves in `doppler run`, so they need a Doppler-configured machine.

Database — generate a migration from the Drizzle schema, then apply it:

```bash
bun run db:generate   # write a migration from db/schema.ts (offline, no doppler)
bun run db:migrate    # apply pending migrations
bun run db:seed       # creates the dev demo user via a real signup, then loads idempotent stub data (refuses to run outside the dev config)
```

`db:seed` signs up a real dev account (`DEV_USER_EMAIL` / `DEV_USER_PASSWORD` in `.env.example`) through Better Auth, so log in with those credentials locally to see the seeded demo topics. Auth needs a few more Doppler variables locally: `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`, `GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET`, and `RESEND_API_KEY`/`RESEND_FROM_EMAIL` — see `.env.example` for what each is for. Signup itself is open: no invite code, Google/GitHub are one-click, and email/password sits behind a "Continue with email" toggle.

Checks — run the full gate with one command (enforced on push by `scripts/preflight.sh`):

```bash
bun run check       # biome + tsc + bun test
```

Or run them individually:

```bash
bunx biome check .
bunx tsc -b
bun test
```

Live smoke tests (owner-run) — exercise real flows against live services (LiteLLM proxy, Firecrawl, object storage), so they make paid calls and are **not** part of `bun run check`. Need the LiteLLM proxy up (`docker compose up -d litellm`) and the latest migration applied:

```bash
bun run smoke              # run all smoke tests
bun run smoke:scan         # just the topic-scan smoke test (ingestion + review, end-to-end)
bun run smoke:attach       # just the URL-attachment smoke test (Firecrawl fetch → context → object storage)
bun run smoke:search       # just the search-scout smoke test (context → LLM queries → Exa → Resources)
```

Prompt registry (owner-run) — git is canonical for prompt wording (`worker/prompts/*.md`); this pushes it up to Langfuse as the `production` version each prompt is served from. Idempotent: an unchanged prompt creates no new version. Needs `LANGFUSE_PUBLIC_KEY`/`LANGFUSE_SECRET_KEY` set:

```bash
bun run prompts:sync
```

## License

MIT
