## Context

The curation pipeline writes Findings, but the app has no face: `ui/src/App.tsx` is a "Hello!" placeholder and `api/index.ts` is `export {}`. This change is MVP roadmap item 3 — the Feed UI — and it is the first time three seams get exercised for real: a Hono `api/`, the `ui → api` type edge, and the `shared/` wire contract.

Constraints that shape the design:
- **Module boundaries** are compiler-enforced by tsconfig project references (`bunx tsc -b`). Today the graph is `ui → nothing`, `api → db`, `worker → db`, `db → nothing`. The Architecture doc's *target* graph — which this change lands — is `ui → api (types only), shared`; `api → db, shared`; `worker → db, shared`; `db → shared`; `shared → nothing`.
- **`shared/` is a structural graph change** and, per the Architecture timing rule, rides trunk as its own commit before this feature — it is a prerequisite, not a task here.
- Bun-only, one `package.json`, Drizzle-only DB access, and the canonical domain vocabulary (Topic · Source · Scan · Resource · Finding · Feed · Subscription · Audience · Integration).
- Pre-auth: Better Auth lands days 6–9. There is no login yet; a single seeded dev user stands in.

## Goals / Non-Goals

**Goals:**
- Render the homepage from the committed design export, driven by live (seeded) data.
- Land the `ui → api` types-only edge with a Hono RPC client and a `shared/` wire contract.
- Add per-user consumed state and the default-unconsumed Feed filter, plus rating write-back.
- Give the homepage data before real Scans exist, via an idempotent, dev-only seed.

**Non-Goals:**
- Authentication, real sign-in, or multi-user session handling (the "Sign in" header is visual only for now).
- The `shared/` scaffold and enum-array move themselves (prerequisite trunk commit).
- The logged-out public directory ("popular public topics by category"), listen-mode TTS audio, topic chat, and email digests — later roadmap items.
- Functional search (the field is visual per the design until a later change).

## Decisions

### 1. Type edge: Hono RPC `AppType`, types-only, validated by shared Zod
`api/` builds a Hono app and exports its `AppType`; `ui/` builds a typed client with `hc<AppType>()`. The `ui → api` reference is types-only — `api` emits declarations, and `verbatimModuleSyntax` keeps any value import explicit, so `bunx tsc -b` fails if a runtime value crosses the boundary. Payload shapes the UI validates (rating, consumed, and the Feed response contract) live in `shared/` as Zod schemas, imported by both sides.
- *Alternative — full contract in `shared/`, hand-rolled `fetch`:* rejected; the Architecture decision log settled on Hono RPC for end-to-end inference, and re-deriving response types by hand duplicates the router.
- *Alternative — relax the boundary to value imports:* rejected; the boundary is the point, and `worker`/MCP will reuse the same API surface.

### 2. Consumed state: a `consumptions` table keyed `(user_id, finding_id)`
Presence of a row means consumed; unmarking deletes it. Marking is idempotent; "opening a Resource" and "manually checking" both take the same mark path (the design draws no storage distinction between auto-seen and manual — both are consumed).
- *Alternative — boolean on `findings`:* rejected outright by the consumed-state design ("per-user, not on the Finding"); a Finding is shared across a Topic's subscribers.
- *Alternative — key by `(subscription_id, finding_id)`:* the design says consumed "lives on the Subscription side," but keying by user is equivalent for the person case, needs no Subscription row to exist before marking, and a Finding already implies its Topic. We key by user and revisit if Audience-level consumed state ever becomes a thing.
- Building this per-user now (rather than a single-user shortcut) makes launch-week auth a wiring change, not a migration.

### 3. Current-user seam
The API resolves "the requesting user" through one `currentUser()` seam that returns the fixed seed user id today and reads the Better Auth session later. All per-user queries (consumed filter, mark/unmark) route through it, so no code assumes single-user beyond that one function.

### 4. Seed: idempotent, dev-only, deterministic
`db/seed.ts` upserts stub Topics, Sources, Scans, Resources, and Findings (and the dev user) using deterministic ids and `onConflictDoNothing`/`onConflictDoUpdate`, so re-running converges. It refuses to run unless the environment is dev — it checks the Doppler config/env and aborts otherwise — so it can never touch prod. Invoked as `bun run db:seed` under `doppler run` against the Neon dev branch.
- *Alternative — `drizzle-seed` random data:* rejected; a demo Feed needs stable, curated rows (specific titles, read/watch/listen mix), and idempotency beats randomness here.

### 5. Homepage rebuilt as React components, not the export's inline HTML
The committed export is a self-unpacking bundle, not source. At apply-time it is rendered in the browser to read exact structure, then rebuilt as React components on the existing shadcn/Tailwind stack. Latte/Dark-roast become Tailwind v4 theme tokens; Architects Daughter + Karla are added as fonts. shadcn `Popover` and `Accordion` are added (only `button/resource/input/label/select/textarea` exist today); `lucide-react` covers icons.
- *Alternative — paste the export's bundled CSS/DOM:* rejected; it is a runtime-unpacked artifact and would not fit the SPA or theme tokens.

## Risks / Trade-offs

- **Export layout ambiguity (the brief says "tabs," the settled design shows collapsible accordions)** → the committed export is the source of truth; render it in the browser at apply-time and match it. Specs describe the sections, not the exact affordance.
- **Seed hitting the wrong database** → the dev-only env guard plus idempotency; the seed aborts on any non-dev config.
- **Type-edge regressions (declaration emit, `verbatimModuleSyntax`)** → covered by `bunx tsc -b` in the verification gate; a stray value import fails the build.
- **Pre-auth assumptions leaking** → contained to `currentUser()`; everything else already treats consumed state as per-user.
- **Motion/perf on scroll** → entrance motion plays at most once per Topic per visit and honors `prefers-reduced-motion`.

## Migration Plan

1. Prerequisite (separate trunk commit, not this change): land `shared/` — scaffold, tsconfig references for the target graph, and the const enum-array move out of `db/schema.ts`.
2. This change: add the `consumptions` table to `db/schema.ts`, `bun run db:generate`, apply to the Neon dev branch.
3. Add the feed/rating/consumed Zod contracts to `shared/`; build the Hono `api/` routes and export `AppType`.
4. Build the homepage UI against the typed client; run `db:seed` to hydrate the dev branch.
- **Rollback:** the change is additive — drop the `consumptions` table and revert the `ui`/`api` code; no existing table or pipeline behavior changes.

## Open Questions

- Exact "N new" semantics — Findings since last visit vs. count of unconsumed — to be read from the export/seed at apply-time.
- Data source for Featured/Popular pre-auth: seeded stub Topics owned by the dev user, or a flag on Topic? Default to seeded stubs unless the export implies otherwise.
- Whether opening a Resource marks consumed optimistically on the client then reconciles (assumed yes) or waits for the API round-trip.
