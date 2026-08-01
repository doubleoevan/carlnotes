# CarlNotes

<img src="ui/public/carl-hero.png" alt="Carl, holding a raccoon and a machine learning textbook" width="200" align="left" />

**He already read it. All of it.**

Carl doesn't check the news. The news checks in with Carl. Carl never sleeps. He drinks coffee and reads everything. He finished the internet. Now he checks nightly for new stuff. And when you drop by, he has notes.

**Give Carl three topics. You know the ones. He'll brew a hot cup of what you just missed.**

Carl stays up. You stay informed.

<br clear="left" />

## Stack

Bun + TypeScript · React SPA (Vite + Tailwind + shadcn) · Hono · Drizzle + Neon Postgres (pgvector) · Temporal · LiteLLM → Fireworks · Vercel AI SDK + Zod · Exa + Firecrawl · Langfuse · LLM Guard · Sentry + PostHog

## Layout

Modular monolith — one `package.json`, one deploy:

- `ui/` — React SPA
- `api/` — Hono HTTP layer
- `worker/` — Temporal workflows and source ingesters
- `db/` — Drizzle schema and migrations

Domain vocabulary is load-bearing and lives in `.agents/skills/domain-model/`.

How the AI guardrails work: [docs/ai-scaffolding.md](docs/ai-scaffolding.md).

Feature work lands change-by-change through [OpenSpec](https://github.com/Fission-AI/OpenSpec) — specs and in-flight changes live in `openspec/`.

## Development

```bash
bun install
bun run dev          # api, ui, temporal, and worker together (concurrently, colored per process); run carl-up first for the Docker infra
bun run dev:ui       # Vite dev server (UI); wraps itself in doppler run
bun run dev:api      # Hono API; wraps itself in doppler run for DATABASE_URL; the Vite dev server proxies /api here
bun run dev:worker   # scheduled-scan sweep loop (set SCHEDULE_INTERVAL_MS); `bun run schedule` runs one sweep, as a cron would
bun run dev:temporal # Temporal worker for async attachment processing; needs a Temporal server (docker-compose `temporal`, or `temporal server start-dev`)
bun run dev:email    # react-email preview server for the templates in emails/ (localhost:3011); no doppler needed
bun run build:ui     # production build (no doppler, so it runs in CI and deploys)
```

The homepage needs both `dev:ui` and `dev:api` running (or just `bun run dev` for the whole stack), plus a seeded dev database (below). The dev, db, and smoke scripts wrap themselves in `doppler run`, so they need a Doppler-configured machine.

Database — generate a migration from the Drizzle schema, then apply it:

```bash
bun run db:generate   # write a migration from db/schema.ts (offline, no doppler)
bun run db:migrate    # apply pending migrations (db/migrate.ts, the same one-shot script the deploy job runs)
bun run db:seed       # creates the dev demo user via a real signup, then loads idempotent stub data (refuses to run outside the dev config)
```

`db:seed` signs up a real dev account (`DEV_USER_EMAIL` / `DEV_USER_PASSWORD` in `.env.example`) through Better Auth, so log in with those credentials locally to see the seeded demo topics. Auth needs a few more Doppler variables locally: `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`, `GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET`, and `RESEND_API_KEY`/`RESEND_FROM_EMAIL` — see `.env.example` for what each is for. Signup itself is open: no invite code, Google/GitHub are one-click, and email/password sits behind a "Continue with email" toggle.

Backfills (owner-run) — one-time data migrations that pair with a schema change. Idempotent, so a second run is a no-op, and run under `doppler` against the configured database:

```bash
doppler run -- bun scripts/backfill-resource-content.ts   # upload existing resources.content to object storage, set content_key/content_bytes
```

The content scanner (LLM Guard) is optional too: `docker compose up -d llm-guard` and set `LLM_GUARD_URL`. It screens an uploaded document before its context is generated, and a fetched page before it is scored, looking for injected instructions, secrets, and invisible characters, and redacting personal details in place. The prompt loader's untrusted-data fence is unconditional and does not depend on it. Error monitoring and product analytics are the same: when `SENTRY_DSN` and `POSTHOG_API_KEY` are not set then monitoring and analytics are off but the app behaves the same.

Billing (Stripe) is optional locally: subscriptions map to the free/plus/premium plans and a Stripe webhook derives the active plan. It needs `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, the per-plan `STRIPE_PRICE_*` ids, and a metered `STRIPE_PRICE_MANUAL_SCAN_OVERAGE` (see `.env.example`). Until they're set, checkout, the Customer Portal, metered overage, and the admin console's Stripe net-revenue line stay inert — the gate, plans, and quotas all work without Stripe.

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

Live smoke tests (owner-run) — exercise real flows against live services (LiteLLM proxy, Firecrawl, object storage), so they make paid calls and are **not** part of `bun run check`. Need the LiteLLM proxy up (`docker compose up -d litellm`) and the latest migration applied; the attachment smoke also needs a Temporal server (`docker compose up -d temporal`) and the running worker (`bun run dev:temporal`):

```bash
bun run smoke              # run all smoke tests
bun run smoke:scan         # just the topic-scan smoke test (ingestion + review, end-to-end)
bun run smoke:store        # just the resource-content object-storage round-trip (put → read → delete)
bun run smoke:attach       # just the URL-attachment smoke test (Firecrawl → store → Temporal workflow → ready)
bun run smoke:search       # just the search-scout smoke test (context → LLM queries → Exa → Resources)
bun run smoke:review       # just the review smoke test: the paid section buys its best survivors, bounded by its ceiling
bun run smoke:eval         # just the eval-harness smoke: one tiny labeled fixture through the real gate and scoring
```

The review smoke reads `REVIEW_CONCURRENCY` and `MAX_SCORED_RESOURCES_PER_SCAN`, so it doubles as an A/B for the concurrency limit. Each run resets its feed's Resources cold first, so two runs differ only by their settings:

```bash
REVIEW_CONCURRENCY=1 MAX_SCORED_RESOURCES_PER_SCAN=8 bun run smoke:review
```

Evals (owner-run) — measures the review pipeline against a labeled corpus. It runs the real embed-filter and tiered scoring, so it spends money and is **not** part of `bun run check`. Fixtures and the labeling workflow live in [evals/README.md](evals/README.md):

```bash
bun run eval                      # measure every fixture: precision, recall, cost per topic, and scanner false positives
bun run eval --export <topicId>   # write an unlabeled fixture from a real Topic's Resources, ready to label
bun run eval --guard-only         # only LLM Guard's false-positive and attack-catch rates; no model spend
```

A weekly GitHub Action (`.github/workflows/llm-guard-update.yml`) watches Docker Hub for new LLM Guard releases, boots the candidate on the runner, runs the guard-only eval against it, and files an issue carrying both measured rates — so a scanner upgrade arrives as a pre-measured decision, never an unchecked version bump. Read the two rates together: a scanner that flags nothing scores a perfect false-positive rate, and one that flags everything scores a perfect catch rate.

Prompt registry (owner-run) — git is canonical for prompt wording (`worker/prompts/*.md`); this pushes it up to Langfuse as the `production` version each prompt is served from. Idempotent: an unchanged prompt creates no new version. Needs `LANGFUSE_PUBLIC_KEY`/`LANGFUSE_SECRET_KEY` set:

```bash
bun run prompts:sync
```

Container image — the app service is the Hono API plus the built UI bundle it serves. It builds from the repo-root `Dockerfile` and starts under `doppler run`. The LiteLLM proxy is a separate service with its own image in `infra/litellm/`:

```bash
docker build --platform=linux/amd64 --build-arg VITE_TURNSTILE_SITE_KEY=<site-key> -t carlnotes-app .
```

`VITE_TURNSTILE_SITE_KEY` is the one setting that cannot wait for `doppler run`: Vite inlines it into the bundle at build time, so it has to be present during the build. It is a public key that ships to every visitor, so it comes in as a build argument rather than through a build-stage Doppler token, which would hand the build read access to every real secret to inject a public one. 

`--platform=linux/amd64` matters on Apple Silicon. The Doppler CLI is copied from `dopplerhq/cli:3`, which publishes amd64 only.

Migrations are a deploy job, not a start-up step. Run the same one-shot script the local `db:migrate` runs, as a job on the deployed image, before the new service rolls out:

```bash
doppler run -- bun db/migrate.ts
```

## Attribution

The persona for CarlNotes was inspired by [Jake Van Clief](https://www.linkedin.com/in/jake-van-clief-74b66915a/). The real Jake runs [Eduba](https://eduba.io), an AI training and consulting company, makes excellent videos on [YouTube](https://www.youtube.com/@JEVanClief), and teaches AI systems over at [Clief Notes](https://www.skool.com/cliefnotes). Go learn from him. Carl would.

## License

AGPL-3.0-only
