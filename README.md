# CarlNotes

**He already read it. All of it.**

You met him at a party once. Talked for twenty minutes about who owns the moon, legally. You forgot his name twice. He never forgot yours. Carl doesn't forget. Carl knows everything. He doesn't sleep, he reads, and whenever you drop by, he has notes for you.

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
bun run dev:ui       # Vite dev server
bun run build:ui     # production build
```

Database — generate a migration from the Drizzle schema, then apply it (migrate needs `DATABASE_URL`, so run it under `doppler run`):

```bash
bun run db:generate                 # write a migration from db/schema.ts
doppler run -- bun run db:migrate   # apply pending migrations
```

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

Live smokes (owner-run) — exercise real flows against live services (LiteLLM proxy, Firecrawl, object storage), so they make paid calls and are **not** part of `bun run check`. Need the LiteLLM proxy up (`docker compose up -d litellm`), the latest migration applied, and Doppler configured:

```bash
doppler run -- bun run smoke              # run every live smoke
doppler run -- bun run smoke:scan         # just the topic-scan smoke (ingestion + curation, end-to-end)
doppler run -- bun run smoke:attachments  # just the URL-attachment smoke (Firecrawl fetch → context → object storage)
```

## License

MIT